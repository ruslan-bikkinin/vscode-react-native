// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {FileSystem} from "../common/node/fileSystem";
import {Log} from "../common/log/log";
import {LogLevel} from "../common/log/logHelper";
import {Packager} from "../common/packager";
import path = require("path");
import Q = require("q");
import {Request} from "../common/node/request";
import {SourceMapUtil} from "./sourceMap";
import url = require("url");

interface IStrictUrl extends url.Url {
    pathname: string;
    href: string;
}

export class ScriptImporter {
    public static DEBUGGER_WORKER_FILE_BASENAME = "debuggerWorker";
    public static DEBUGGER_WORKER_FILENAME = ScriptImporter.DEBUGGER_WORKER_FILE_BASENAME + ".js";
    private packagerPort: number;
    private appScriptEtag: string | null;
    private sourcesStoragePath: string;
    private sourceMapUtil: SourceMapUtil;

    constructor(packagerPort: number, sourcesStoragePath: string) {
        this.packagerPort = packagerPort;
        this.sourcesStoragePath = sourcesStoragePath;
        this.sourceMapUtil = new SourceMapUtil();
    }

    public downloadAppScript(scriptUrlString: string): Q.Promise<string> {
        const fs = new FileSystem();
        const parsedScriptUrl = url.parse(scriptUrlString);
        const overriddenScriptUrlString = (parsedScriptUrl.hostname === "localhost") ?
            this.overridePackagerPort(scriptUrlString) : scriptUrlString;

        const scriptUrl = <IStrictUrl>url.parse(overriddenScriptUrlString);
        const scriptFilePath = path.join(this.sourcesStoragePath, path.basename(scriptUrl.pathname));

        if (!fs.existsSync(scriptFilePath)) {
            // Zero etag to make sure that request will return script content instead of 304
            this.appScriptEtag = null;
        }

        return Request.requestWithEtag(overriddenScriptUrlString, this.appScriptEtag)
            .then(resp => {
                this.appScriptEtag = resp.etag;
                if (resp.code === 304) {
                    // Ignore body and just return - if bundle exists and didn't change then
                    // sourcemap likely didn't change as well and don't need to be redownloaded
                    return Q.resolve(scriptFilePath);
                }

                // We'll get the source code, and store it locally to have a better debugging experience
                let scriptBody = resp.body;

                // Extract sourceMappingURL from body
                // sourceMappingUrl = "http://localhost:8081/index.ios.map?platform=ios&dev=true"
                return Q.when(this.sourceMapUtil.getSourceMapURL(scriptUrl, resp.body))
                    .then(sourceMappingUrl => {
                        if (!sourceMappingUrl) {
                            return;
                        }

                        scriptBody = this.sourceMapUtil.updateScriptPaths(scriptBody, <IStrictUrl>sourceMappingUrl);
                        // Notice that writeAppSourceMap is async be we're not waiting its completion
                        this.writeAppSourceMap(sourceMappingUrl, scriptUrl);
                    })
                    .then(() => fs.writeFile(scriptFilePath, scriptBody))
                    .then(() => {
                        Log.logInternalMessage(LogLevel.Info, `Script ${overriddenScriptUrlString} downloaded to ${scriptFilePath}`);
                        return scriptFilePath;
                    });
            });
    }

    public downloadDebuggerWorker(): Q.Promise<string> {
        return Packager.isPackagerRunning(Packager.getHostForPort(this.packagerPort))
            .then(running => {
                if (!running) {
                    throw new RangeError(`Cannot attach to packager. Are you sure there is a packager and it is running in the port ${this.packagerPort}? If your packager is configured to run in another port make sure to add that to the setting.json.`);
                }

                let debuggerWorkerURL = `http://${Packager.getHostForPort(this.packagerPort)}/${ScriptImporter.DEBUGGER_WORKER_FILENAME}`;
                Log.logInternalMessage(LogLevel.Info, "About to download: " + debuggerWorkerURL);
                return Request.request(debuggerWorkerURL, true);
            });
    }

    /**
     * Writes the source map file to the project temporary location.
     */
    private writeAppSourceMap(sourceMapUrl: IStrictUrl, scriptUrl: IStrictUrl): Q.Promise<void> {
        return Request.request(sourceMapUrl.href, true)
            .then((sourceMapBody: string) => {
                let sourceMappingLocalPath = path.join(this.sourcesStoragePath, path.basename(sourceMapUrl.pathname)); // sourceMappingLocalPath = "$TMPDIR/index.ios.map"
                let scriptFileRelativePath = path.basename(scriptUrl.pathname); // scriptFileRelativePath = "index.ios.bundle"
                let updatedContent = this.sourceMapUtil.updateSourceMapFile(sourceMapBody, scriptFileRelativePath, this.sourcesStoragePath);
                return new FileSystem().writeFile(sourceMappingLocalPath, updatedContent);
            });
    }

    /**
     * Changes the port of the url to be the one configured as this.packagerPort
     */
    private overridePackagerPort(urlToOverride: string): string {
        let components = url.parse(urlToOverride);
        components.port = this.packagerPort.toString();
        delete components.host; // We delete the host, if not the port change will be ignored
        return url.format(components);
    }
}
