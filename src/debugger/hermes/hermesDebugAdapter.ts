// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import { ReactNativeProjectHelper } from "../../common/reactNativeProjectHelper";
import { ErrorHelper } from "../../common/error/errorHelper";
import { ILaunchArgs } from "../../extension/launchArgs";
import { getProjectRoot } from "../nodeDebugWrapper";
import { Telemetry } from "../../common/telemetry";
import { OutputEvent } from "vscode-debugadapter";
import { TelemetryHelper } from "../../common/telemetryHelper";
import { RemoteTelemetryReporter, ReassignableTelemetryReporter, NullTelemetryReporter } from "../../common/telemetryReporters";
import { ChromeDebugAdapter, ChromeDebugSession, IChromeDebugSessionOpts, IAttachRequestArgs, logger } from "vscode-chrome-debug-core";
import { InternalErrorCode } from "../../common/error/internalErrorCode";
import { RemoteExtension } from "../../common/remoteExtension";
import { DebugProtocol } from "vscode-debugprotocol";

export interface IHermesAttachRequestArgs extends IAttachRequestArgs, ILaunchArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
}

export interface IHermesLaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, IHermesAttachRequestArgs { }

export class HermesDebugAdapter extends ChromeDebugAdapter {

    private outputLogger: (message: string, error?: boolean | string) => void;
    private telemetryReporter: ReassignableTelemetryReporter;
    private projectRootPath: string;
    private remoteExtension: RemoteExtension;
    private isTelemetryAndRemoteExtensionInitialized: boolean;
    private previousAttachArgs: IHermesAttachRequestArgs;

    public constructor(opts: IChromeDebugSessionOpts, debugSession: ChromeDebugSession) {
        super(opts, debugSession);
        this.outputLogger = (message: string, error?: boolean | string) => {
            let category = "console";
            if (error === true) {
                category = "stderr";
            }
            if (typeof error === "string") {
                category = error;
            }

            let newLine = "\n";
            if (category === "stdout" || category === "stderr") {
                newLine = "";
            }
            debugSession.sendEvent(new OutputEvent(message + newLine, category));
        };

        this.telemetryReporter = new ReassignableTelemetryReporter(new NullTelemetryReporter());
        this.isTelemetryAndRemoteExtensionInitialized = false;
    }

    public launch(launchArgs: IHermesLaunchRequestArgs): Promise<void>  {
        const extProps = {
            platform: {
                value: launchArgs.platform,
                isPii: false,
            },
        };

        return new Promise<void>((resolve, reject) => this.initializeTelemetryAndRemoteExtension(launchArgs)
            .then(() => TelemetryHelper.generate("launch", extProps, (generator) => {
                this.outputLogger("HermesDebugAdapter - remoteExtension.launch");
                return this.remoteExtension.launch({ "arguments": launchArgs })
                    .then(() => {
                        this.outputLogger("HermesDebugAdapter - getPackagerPort");
                        return this.remoteExtension.getPackagerPort(launchArgs.cwd);
                    })
                    .then((packagerPort: number) => {
                        this.outputLogger("HermesDebugAdapter - packagerPort");
                        launchArgs.port = packagerPort;
                        this.attach(launchArgs).then(() => {
                            resolve();
                        }).catch((e) => reject(e));
                    }).catch((e) => reject(e));
            })
            .catch((err) => {
                this.cleanUp();
                this.outputLogger(err.message || err, true);
            })));
    }

    public attach(attachArgs: IHermesAttachRequestArgs): Promise<void> {
        const extProps = {
            platform: {
                value: attachArgs.platform,
                isPii: false,
            },
        };

        this.previousAttachArgs = attachArgs;

        return new Promise<void>((resolve, reject) =>
        this.initializeTelemetryAndRemoteExtension(attachArgs)
            .then(() => TelemetryHelper.generate("launch", extProps, (generator) => {
                return this.remoteExtension.getPackagerPort(attachArgs.cwd)
                    .then((packagerPort: number) => {
                        this.outputLogger("HermesDebugAdapter - superAttach");
                        const attachArguments = Object.assign({}, attachArgs, {
                            address: "localhost",
                            port: packagerPort,
                            restart: true,
                            request: "attach",
                            remoteRoot: undefined,
                            localRoot: undefined,
                            // trace: true
                        });
                        super.attach(attachArguments).then(() => {
                            resolve();
                        }).catch((e) => reject(e));
                    }).catch((e) => reject(e));
        })
        .catch((err) => {
            this.cleanUp();
            this.outputLogger(err.message || err, true);
        })));
    }

    public disconnect(args: DebugProtocol.DisconnectArguments): void {
        this.cleanUp();
        super.disconnect(args);
    }

    private initializeTelemetryAndRemoteExtension(args: any): Q.Promise<any> {
        const projectRootPath = getProjectRoot(args);
        return ReactNativeProjectHelper.isReactNativeProject(projectRootPath)
        .then((result) => {
            if (!this.isTelemetryAndRemoteExtensionInitialized) {
                if (!result) {
                    throw ErrorHelper.getInternalError(InternalErrorCode.NotInReactNativeFolderError);
                }
                this.projectRootPath = projectRootPath;
                this.remoteExtension = RemoteExtension.atProjectRootPath(this.projectRootPath);
                const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "package.json"), "utf-8")).version;

                // Start to send telemetry
                this.telemetryReporter.reassignTo(new RemoteTelemetryReporter(
                    "react-native-tools", version, Telemetry.APPINSIGHTS_INSTRUMENTATIONKEY, this.projectRootPath));

                if (args.program) {
                    // TODO: Remove this warning when program property will be completely removed
                    // logger.warn(localize("ProgramPropertyDeprecationWarning", "Launched debug configuration contains 'program' property which is deprecated and will be removed soon. Please replace it with: \"cwd\": \"${workspaceFolder}\""));
                    const useProgramEvent = TelemetryHelper.createTelemetryEvent("useProgramProperty");
                    Telemetry.send(useProgramEvent);
                }
                if (args.cwd) {
                    // To match count of 'cwd' users with 'program' users. TODO: Remove when program property will be removed
                    const useCwdEvent = TelemetryHelper.createTelemetryEvent("useCwdProperty");
                    Telemetry.send(useCwdEvent);
                }

                this.isTelemetryAndRemoteExtensionInitialized = true;
            }

            return void 0;
        });
    }

    private cleanUp(){

        if (this.previousAttachArgs.platform === "android") {
            this.remoteExtension.stopMonitoringLogcat()
                .catch(reason => logger.warn("CouldNotStopMonitoringLogcat"))
                .finally(() => super.disconnect({terminateDebuggee: true}));
        }
    }

}