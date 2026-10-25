// Electron メインプロセス。ビルド済みの Web 版（app/）を読み込み、ローカルファイルの読み込みを橋渡しする。
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// ブラウザの自動再生制限を外す（起動直後から BGM・エンジン音を鳴らす）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// GPU: 省電力 GPU ではなく高性能側を優先
app.commandLine.appendSwitch('force_high_performance_gpu')

const MIME = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', ply: 'application/octet-stream', las: 'application/octet-stream', gml: 'application/xml', xml: 'application/xml', xyz: 'text/plain', txt: 'text/plain' }

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d1117',
    title: 'TOUGE DRIVE',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const template = [
    {
      label: 'ファイル',
      submenu: [
        { label: 'モデル (GLB) を開いて配置…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('desktop:open-model') },
        { label: '点群 / CityGML を開く…', click: () => win.webContents.send('desktop:open-layer') },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'togglefullscreen', label: 'フルスクリーン' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        { label: '操作方法', click: () => dialog.showMessageBox(win, { title: '操作方法', message: 'W/S アクセル・ブレーキ　A/D ステア　Space サイドブレーキ　R 復帰　C カメラ　M ミュート\nゲームパッド: R2 アクセル　L2 ブレーキ　左スティック　□ サイド　△ 復帰　○ カメラ　× 決定　OPTIONS セットアップ' }) },
        { label: `バージョン ${app.getVersion()}`, enabled: false },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  return win
}

/** ファイルを data: URL として返す（renderer は file:// を fetch できないため） */
async function pickFileAsDataUrl(win, filters) {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (result.canceled || result.filePaths.length === 0) return null
  const file = result.filePaths[0]
  const ext = path.extname(file).slice(1).toLowerCase()
  const buf = fs.readFileSync(file)
  return { name: path.basename(file), ext, size: buf.length, dataUrl: `data:${MIME[ext] ?? 'application/octet-stream'};base64,${buf.toString('base64')}` }
}

ipcMain.handle('desktop:pick-model', (e) => pickFileAsDataUrl(BrowserWindow.fromWebContents(e.sender), [{ name: 'glTF Binary', extensions: ['glb'] }]))
ipcMain.handle('desktop:pick-layer', (e) => pickFileAsDataUrl(BrowserWindow.fromWebContents(e.sender), [{ name: '点群 / CityGML', extensions: ['ply', 'las', 'xyz', 'txt', 'gml', 'xml'] }]))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
