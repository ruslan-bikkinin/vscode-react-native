// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.


export class ACConstants {
    public static ExtensionPrefixName: string = "reactNative";
    public static AppCenterExtensionName: string = "appcenter";
    public static DefaulAPIEndPoint: string = "https://api.appcenter.ms";
    public static DefaultLoginEndPoint: string = "https://appcenter.ms/cli-login";
}

export class ACCommandNames {
    public static CommandPrefix: string = ACConstants.AppCenterExtensionName + ".";
    public static Login: string = ACCommandNames.CommandPrefix + "login";
    public static Logout: string = ACCommandNames.CommandPrefix + "logout";
    public static WhoAmI: string = ACCommandNames.CommandPrefix + "whoami";
    public static SetCurrentApp: string = ACCommandNames.CommandPrefix + "setcurrentapp";
}

export enum AppCenterCommandType {
    // Auth commands
    Login,
    Logout,
    Whoami,

    SetCurrentApp,

    // CodePush commands
    CodePushDeploymentList,
}