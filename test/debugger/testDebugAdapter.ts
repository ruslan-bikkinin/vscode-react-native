import { ChromeDebugAdapter, ILaunchRequestArgs } from "vscode-chrome-debug-core";

export class TestDebugAdapter extends ChromeDebugAdapter {
    public launch(args: ILaunchRequestArgs): Promise<void> {
        return super.launch(args);
    }
    public doAttach(port: number, targetUrl?: string, address?: string, timeout?: number): Promise<void> {
        // We need to overwrite ChromeDebug's _attachMode to let Node2 adapter
        // to set up breakpoints on initial pause event
        (this as any)._attachMode = false;
        return super.doAttach(port, targetUrl, address, timeout);
    }
}