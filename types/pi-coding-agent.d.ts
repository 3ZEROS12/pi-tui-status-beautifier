/**
 * Minimal ambient shape of the host package.
 *
 * `@earendil-works/pi-coding-agent` is a type-only peer dependency and is not
 * installed in this repo, so typecheck needs a local declaration. This file is
 * NOT shipped (see package.json "files"); users resolve the real package.
 */
declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionContext {
    cwd?: string;
    hasUI?: boolean;
    ui: any;
    sessionManager?: any;
    model?: any;
    thinkingLevel?: string;
    [key: string]: any;
  }

  export interface ExtensionAPI {
    on(event: string, handler: (event: any, ctx: ExtensionContext) => unknown): void;
    registerCommand(name: string, definition: { description?: string; handler: (args: string, ctx: ExtensionContext) => unknown }): void;
    registerTool(definition: any): void;
    sendUserMessage?(text: string, options?: any): void;
    [key: string]: any;
  }
}
