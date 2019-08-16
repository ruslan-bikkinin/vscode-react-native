// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ChromeDebugAdapter, ChromeDebugSession, IChromeDebugSessionOpts, logger } from "vscode-chrome-debug-core";
// import * as Q from "q";

export class HermesDebugAdapter extends ChromeDebugAdapter {

    public constructor(opts: IChromeDebugSessionOpts, debugSession: ChromeDebugSession){
        super(opts, debugSession)
        logger.log("HermesDebugAdapter - constructor: " + JSON.stringify(opts));
    }

    public launch(): Promise<void>  {
        logger.log("HermesDebugAdapter - launch");
        return new Promise<void>((res, rej) => {});
    }


}