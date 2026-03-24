import type { IpcResult } from './electron-foundation';

export interface ExtensionInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  status: 'active' | 'inactive' | 'pending' | 'error';
  permissions: string[];
  activationEvents: string[];
  errorMessage?: string;
}

export interface ExtensionListResult extends IpcResult {
  extensions?: ExtensionInfo[];
}

export interface ExtensionLogResult extends IpcResult {
  log?: string[];
}

export interface ExtensionsAPI {
  list: () => Promise<ExtensionListResult>;
  enable: (name: string) => Promise<IpcResult>;
  disable: (name: string) => Promise<IpcResult>;
  install: (sourcePath: string) => Promise<IpcResult>;
  uninstall: (name: string) => Promise<IpcResult>;
  getLog: (name: string) => Promise<ExtensionLogResult>;
  openFolder: () => Promise<IpcResult>;
  activate: (name: string) => Promise<IpcResult>;
  commandExecuted: (commandId: string) => Promise<IpcResult>;
  onNotification: (
    callback: (data: { extensionName: string; message: string }) => void,
  ) => () => void;
}
