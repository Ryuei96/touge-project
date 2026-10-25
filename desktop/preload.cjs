const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tougeDesktop', {
  version: process.versions.electron,
  platform: process.platform,
  /** GLB をファイルダイアログで選び、data: URL で返す */
  pickModel: () => ipcRenderer.invoke('desktop:pick-model'),
  /** 点群 / CityGML を選び、data: URL で返す */
  pickLayer: () => ipcRenderer.invoke('desktop:pick-layer'),
  /** メニューからの要求を受け取る */
  onOpenModel: (cb) => ipcRenderer.on('desktop:open-model', () => cb()),
  onOpenLayer: (cb) => ipcRenderer.on('desktop:open-layer', () => cb()),
})
