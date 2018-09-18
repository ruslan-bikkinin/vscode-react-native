// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as assert from "assert";
import * as WebSocket from "ws";
import * as path from "path";
import * as Q from "q";
import * as sinon from "sinon";
import * as child_process from "child_process";
import * as http from "http";

import { MultipleLifetimesAppWorker } from "../../src/debugger/appWorker";
import { ForkedAppWorker } from "../../src/debugger/forkedAppWorker";
import * as ForkedAppWorkerModule from "../../src/debugger/forkedAppWorker";
import * as packagerStatus from "../../src/common/packagerStatus";
import { ScriptImporter, DownloadedScript } from "../../src/debugger/scriptImporter";

suite("appWorker", function () {
    suite("debuggerContext", function () {
        const packagerPort = 8081;

        suite("SandboxedAppWorker", function () {
            const originalSpawn = child_process.spawn;
            const sourcesStoragePath = path.resolve(__dirname, "assets");

            // Inject 5 sec delay before shutting down to worker to give tests some time to execute
            const WORKER_DELAY_SHUTDOWN = `setTimeout(() => {console.log("Shutting down")}, 5000)`;

            let testWorker: ForkedAppWorker;
            let spawnStub: Sinon.SinonStub;
            let postReplyFunction = sinon.stub();

            function workerWithScript(scriptBody: string): ForkedAppWorker {
                const wrappedBody = [MultipleLifetimesAppWorker.WORKER_BOOTSTRAP,
                    scriptBody, MultipleLifetimesAppWorker.WORKER_DONE, WORKER_DELAY_SHUTDOWN].join("\n");

                spawnStub = sinon.stub(child_process, "spawn", () =>
                    originalSpawn("node", ["-e", wrappedBody], { stdio: ["pipe", "pipe", "pipe", "ipc"] }));

                testWorker = new ForkedAppWorker("localhost", packagerPort, sourcesStoragePath, "", postReplyFunction);
                return testWorker;
            }

            teardown(function () {
                // Reset everything
                spawnStub.restore();
                postReplyFunction.reset();
                if (testWorker) {
                    testWorker.stop();
                }
            });

            test("should execute scripts correctly and be able to invoke the callback", function () {
                const expectedMessageResult = { success: true };
                const startScriptContents = `var testResponse = ${JSON.stringify(expectedMessageResult)}; postMessage(testResponse);`;

                return workerWithScript(startScriptContents).start()
                    .then(() =>
                        Q.delay(1000))
                    .then(() =>
                        assert(postReplyFunction.calledWithExactly(expectedMessageResult)));
            });

            test("should be able to import scripts", function () {
                // NOTE: we're not able to mock reading script for import since this is performed by a
                // separate node process and is out of control so we must provide a real script file
                const scriptImportPath = path.resolve(sourcesStoragePath, "importScriptsTest.js");
                const startScriptContents = `importScripts("${scriptImportPath}"); postMessage("postImport");`;

                return workerWithScript(startScriptContents).start().then(() => {
                    // We have not yet finished importing the script, we should not have posted a response yet
                    assert(postReplyFunction.notCalled, "postReplyFuncton called before scripts imported");
                    return Q.delay(500);
                }).then(() => {
                    assert(postReplyFunction.calledWith("postImport"), "postMessage after import not handled");
                    assert(postReplyFunction.calledWith("inImport"), "postMessage not registered from within import");
                });
            });

            test("should correctly pass postMessage to the loaded script", function () {
                const startScriptContents = `onmessage = postMessage;`;
                const testMessage = { method: "test", success: true };

                const worker = workerWithScript(startScriptContents);
                return worker.start().then(() => {
                    assert(postReplyFunction.notCalled, "postRepyFunction called before message sent");
                    worker.postMessage(testMessage);
                    return Q.delay(1000);
                }).then(() => {
                    assert(postReplyFunction.calledWith({ data: testMessage }), "No echo back from app");
                });
            });

            test("should be able to require an installed node module via __debug__.require", function () {
                const expectedMessageResult = { qString: Q.toString() };
                const startScriptContents = `var Q = __debug__.require('q');
                    var testResponse = { qString: Q.toString() };
                    postMessage(testResponse);`;

                return workerWithScript(startScriptContents).start()
                    .then(() => Q.delay(500))
                    .then(() =>
                        assert(postReplyFunction.calledWithExactly(expectedMessageResult)));
            });

            test("should download script from remote packager", async () => {
                class MockAppWorker extends ForkedAppWorker {
                    public workerLoaded = Q.defer<void>();
                    public scriptImporter: ScriptImporter;
                    public debuggeeProcess: any = {
                        send: () => void 0,
                    };
                }
                const remotePackagerAddress = "1.2.3.4";
                const remotePackagerPort = 1337;
                const worker = new MockAppWorker(remotePackagerAddress, remotePackagerPort, sourcesStoragePath, "", postReplyFunction);
                const downloadAppScriptStub = sinon.stub(worker.scriptImporter, "downloadAppScript");
                const fakeDownloadedScript = <DownloadedScript>{ filepath: "/home/test/file" };
                downloadAppScriptStub.returns(Q.resolve(fakeDownloadedScript));
                const debuggeeProcessSendStub = sinon.stub(worker.debuggeeProcess, "send");
                worker.workerLoaded.resolve(void 0);
                const fakeMessage = {
                    method: "executeApplicationScript",
                    url: "http://localhost:8081/test-url",
                };

                await worker.postMessage(fakeMessage);

                assert.equal(downloadAppScriptStub.calledOnce, true);
                assert.equal(downloadAppScriptStub.firstCall.args[0], `http://${remotePackagerAddress}:${remotePackagerPort}/test-url`);
                assert.equal(debuggeeProcessSendStub.calledOnce, true);
                assert.deepEqual(debuggeeProcessSendStub.firstCall.args[0], {
                    data: {
                        ...fakeMessage,
                        url: fakeDownloadedScript.filepath,
                    },
                });
            });

            test("debuggee process should pass it's output to appWorker", () => {
                const sourcesStoragePath = path.resolve(__dirname, "assets", "consoleLog");
                testWorker = new ForkedAppWorker("localhost", packagerPort, sourcesStoragePath, "", postReplyFunction);
                let output: string = "";
                let debugPort;
                return testWorker.start().then((port: number) => {
                    debugPort = port;
                    const debuggeeProcess = testWorker.getDebugeeProcess() as child_process.ChildProcess;
                    debuggeeProcess.stderr.on("data", (data: string) => {
                        output += data;
                    });
                    debuggeeProcess.stdin.on("data", (data: string) => {
                        output += data;
                    });
                    debuggeeProcess.stdout.on("data", (data: string) => {
                        output += data;
                    });
                    debuggeeProcess.on("exit", () => {
                        assert.notEqual(output, "");
                        assert.equal(output, "test output from debuggee process");
                    });
                    return getWebSocketDebuggerUrl(debugPort);
                }).then((wsPath: string) => {
                    const WebSocket = require("ws");
                    const ws = new WebSocket(wsPath);
                    return Q.Promise((resolve, reject) => {
                        ws.on("open", function open() {
                            ws.send(JSON.stringify({
                                "id": 100,
                                "method": "Runtime.runIfWaitingForDebugger",
                            }), (err: Error) => {
                                if (err) reject(err);
                                resolve({});
                            });
                        });
                        ws.on("message", function incoming(data: string) {
                            console.log(data);
                        });
                    });
                });
            });
        });

        suite("MultipleLifetimesAppWorker", function () {
            const sourcesStoragePath = path.resolve(__dirname, "assets");

            let multipleLifetimesWorker: MultipleLifetimesAppWorker;
            let sandboxedAppWorkerStub: Sinon.SinonStub;
            let appWorkerModuleStub: Sinon.SinonStub;
            let webSocket: Sinon.SinonStub;
            let webSocketConstructor: Sinon.SinonStub;
            let packagerIsRunning: Sinon.SinonStub;

            let sendMessage: (message: string) => void;

            let clock: Sinon.SinonFakeTimers;

            setup(function () {
                webSocket = sinon.createStubInstance(WebSocket);

                sandboxedAppWorkerStub = sinon.createStubInstance(ForkedAppWorker);
                appWorkerModuleStub = sinon.stub(ForkedAppWorkerModule, "ForkedAppWorker").returns(sandboxedAppWorkerStub);

                const messageInvocation: Sinon.SinonStub = (<any>webSocket).on.withArgs("message");
                sendMessage = (message: string) => messageInvocation.callArgWith(1, message);

                webSocketConstructor = sinon.stub();
                webSocketConstructor.returns(webSocket);
                packagerIsRunning = sinon.stub(packagerStatus, "ensurePackagerRunning");
                packagerIsRunning.returns(Q.resolve(true));
                const attachRequestArguments = {
                    address: "localhost",
                    port: packagerPort,
                };

                multipleLifetimesWorker = new MultipleLifetimesAppWorker(attachRequestArguments, sourcesStoragePath, "", {
                    webSocketConstructor: webSocketConstructor,
                });

                sinon.stub(multipleLifetimesWorker, "downloadAndPatchDebuggerWorker").returns(Q.resolve({}));
            });

            teardown(function () {
                // Reset everything
                multipleLifetimesWorker.stop();
                appWorkerModuleStub.restore();
                packagerIsRunning.restore();

                if (clock) {
                    clock.restore();
                }
            });

            test("with packager running should construct a websocket connection to the correct endpoint and listen for events", function () {
                return multipleLifetimesWorker.start().then(() => {
                    const websocketRegex = new RegExp("ws://[^:]*:[0-9]*/debugger-proxy\\?role=debugger");
                    assert(webSocketConstructor.calledWithMatch(websocketRegex), "The web socket was not constructed to the correct url: " + webSocketConstructor.args[0][0]);

                    const expectedListeners = ["open", "close", "message", "error"];
                    expectedListeners.forEach((event) => {
                        assert((<any>webSocket).on.calledWithMatch(event), `Missing listener for ${event}`);
                    });
                });
            });

            test("with packager running should attempt to reconnect after disconnecting", function () {
                let startWorker = sinon.spy(multipleLifetimesWorker, "start");
                return multipleLifetimesWorker.start().then(() => {
                    // Forget previous invocations
                    startWorker.reset();
                    packagerIsRunning.returns(Q.resolve(true));

                    clock = sinon.useFakeTimers();

                    const closeInvocation: Sinon.SinonStub = (<any>webSocket).on.withArgs("close");
                    closeInvocation.callArg(1);

                    // Ensure that the retry is 100ms after the disconnection
                    clock.tick(99);
                    assert(startWorker.notCalled, "Attempted to reconnect too quickly");

                    clock.tick(1);
                }).then(() => {
                    assert(startWorker.called);
                });
            });

            test("with packager running should respond correctly to prepareJSRuntime messages", function () {
                return multipleLifetimesWorker.start().then(() => {
                    const messageId = 1;
                    const testMessage = JSON.stringify({ method: "prepareJSRuntime", id: messageId });
                    const expectedReply = JSON.stringify({ replyID: messageId });

                    const appWorkerDeferred = Q.defer<void>();

                    const appWorkerStart: Sinon.SinonStub = (<any>sandboxedAppWorkerStub).start;
                    const websocketSend: Sinon.SinonStub = (<any>webSocket).send;

                    appWorkerStart.returns(appWorkerDeferred.promise);

                    sendMessage(testMessage);

                    assert(appWorkerStart.called, "SandboxedAppWorker not started in respones to prepareJSRuntime");
                    assert(websocketSend.notCalled, "Response sent prior to configuring sandbox worker");

                    appWorkerDeferred.resolve(void 0);

                    return Q.delay(1).then(() => {
                        assert(websocketSend.calledWith(expectedReply), "Did not receive the expected response to prepareJSRuntime");
                    });
                });
            });

            test("with packager running should pass unknown messages to the sandboxedAppWorker", function () {
                return multipleLifetimesWorker.start().then(() => {
                    // Start up an app worker
                    const prepareJSMessage = JSON.stringify({ method: "prepareJSRuntime", id: 1 });
                    const appWorkerStart: Sinon.SinonStub = (<any>sandboxedAppWorkerStub).start;
                    appWorkerStart.returns(Q.resolve(void 0));

                    sendMessage(prepareJSMessage);

                    // Then attempt to message it

                    const testMessage = { method: "unknownMethod" };
                    const testMessageString = JSON.stringify(testMessage);

                    const postMessageStub: Sinon.SinonStub = (<any>sandboxedAppWorkerStub).postMessage;

                    assert(postMessageStub.notCalled, "sandboxedAppWorker.postMessage called prior to any message");
                    sendMessage(testMessageString);

                    assert(postMessageStub.calledWith(testMessage), "message was not passed to sandboxedAppWorker");
                });
            });

            test("with packager running should close connection if there is another debugger connected to packager", () => {
                return multipleLifetimesWorker.start().then(() => {
                    // Forget previous invocations
                    webSocketConstructor.reset();
                    clock = sinon.useFakeTimers(new Date().getTime());

                    const closeInvocation: Sinon.SinonStub = (<any>webSocket).on.withArgs("close");
                    (<any>webSocket)._closeMessage = "Another debugger is already connected";
                    closeInvocation.callArg(1);

                    // Ensure it doesn't try to reconnect
                    clock.tick(100);
                    assert(webSocketConstructor.notCalled, "socket attempted to reconnect");
                });
            });

            test("without packager running should not start if there is no packager running", () => {
                packagerIsRunning.returns(Q.reject(false));

                return multipleLifetimesWorker.start()
                    .done(() => {
                        assert(webSocketConstructor.notCalled, "socket should not be created");
                    }, reason => {
                        assert(reason.message === `Cannot attach to packager. Are you sure there is a packager and it is running in the port ${packagerPort}? If your packager is configured to run in another port make sure to add that to the setting.json.`);
                    });
            });
        });
    });
});

function getWebSocketDebuggerUrl(port: number): Q.Promise<string> {
    return Q.Promise((resolve, reject) => {
        const req = http.get({ port, path: "/json/list", headers: { "Connection": "keep-alive" } }, (res: http.IncomingMessage) => {
            let response = "";
            res.setEncoding("utf8");
            res
                .on("data", (data) => response += data.toString())
                .on("end", () => {
                    resolve(response);
                });
        });
        req.on("error", (err) => {
            reject(err);
        });
    }).then((response: string) => {
        try {
            const res = JSON.parse(response);
            return res[0].webSocketDebuggerUrl;
        } catch (e) {
            e.body = response;
            throw e;
        }
    });
}