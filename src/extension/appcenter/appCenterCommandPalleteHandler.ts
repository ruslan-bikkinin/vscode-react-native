// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { ILogger, LogLevel } from "../log/LogHelper";
import * as Q from "q";
import { AppCenterCommandExecutor } from "./command/commandExecutor";
import Auth from "../appcenter/auth/auth";
import * as vscode from "vscode";
import { AppCenterClient } from "./api/index";
import { getUser } from "./auth/profile/profile";
import { AppCenterClientFactory, createAppCenterClient } from "./api/createClient";
import { SettingsHelper } from "../settingsHelper";
import { AppCenterCommandType } from "./appCenterConstants";
import { AppCenterExtensionManager } from "./appCenterExtensionManager";

export class AppCenterCommandPalleteHandler {
    private commandExecutor: AppCenterCommandExecutor;
    private client: AppCenterClient;
    private logger: ILogger;
    private clientFactory: AppCenterClientFactory;

    constructor(logger: ILogger) {
        this.commandExecutor = new AppCenterCommandExecutor(logger);
        this.clientFactory = createAppCenterClient();
        this.logger = logger;
    }

    public run(command: AppCenterCommandType, appCenterManager: AppCenterExtensionManager): Q.Promise<void>  {
        // Login is special case
        if (command === AppCenterCommandType.Login) {
            return this.commandExecutor.login(appCenterManager);
        }

        return Auth.isAuthenticated().then((isAuthenticated: boolean) => {
            if (!isAuthenticated) {
                vscode.window.showInformationMessage("You are not logged in to AppCenter");
                return Q.resolve(void 0);
             } else {
                const clientOrNull: AppCenterClient | null  = this.resolveAppCenterClient();
                if (clientOrNull) {
                    this.client = clientOrNull;

                    switch (command) {
                        case (AppCenterCommandType.Logout):
                            return this.commandExecutor.logout(this.client, appCenterManager);

                        case (AppCenterCommandType.Whoami):
                            return this.commandExecutor.whoAmI(this.client);

                        case (AppCenterCommandType.CodePushDeploymentList):
                            return this.commandExecutor.codePushDeploymentList(this.client);

                        case (AppCenterCommandType.SetCurrentApp):
                            return this.commandExecutor.setCurrentApp();

                        default:
                            throw new Error("Unknown App Center command!");
                    }
                } else {
                    this.logger.log("Failed to get App Center client", LogLevel.Error);
                    throw new Error("Failed to get App Center client!");
                }
             }
        });
    }

    private resolveAppCenterClient(): AppCenterClient | null {
        if (!this.client) {
            const user = getUser();
            if (user) {
                return this.clientFactory.fromProfile(user, SettingsHelper.getAppCenterAPIEndpoint());
            } else {
                throw new Error("No App Center user specified");
            }
        }
        return this.client;
    }
}