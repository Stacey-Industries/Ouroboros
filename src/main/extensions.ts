export {
  disableExtension,
  dispatchActivationEvent,
  dispatchCommandEvent,
  dispatchFileOpenEvent,
  enableExtension,
  forceActivateExtension,
  getExtensionLog,
  getExtensionsDirPath,
  initExtensions,
  installExtension,
  listExtensions,
  uninstallExtension,
} from './extensionsApi'

export type {
  ActivationEvent,
  ExtensionInfo,
  ExtensionManifest,
  ExtensionStatus,
} from './extensionsTypes'
