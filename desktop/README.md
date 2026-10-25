# TOUGE DRIVE — デスクトップ版（Electron）

Web 版と同じコード（`../src`）をビルドして Electron（Chromium 同梱）で包む。ブラウザの制約
（自動再生、ファイルアクセス、配布サイズ）が無くなり、exe として配布できる。

## ビルド手順

```bash
cd desktop
npm install                 # electron と @electron/packager を取得
npm run build:web           # ../ を vite build して desktop/app/ に出力
npm start                   # 開発用に起動（Linux/Mac/Windows）
npm run pack:win            # release/TougeDrive-win32-x64/TougeDrive.exe を生成（Linux からでも可）
npm run zip:win             # 配布用 zip
```

- Windows 以外で `pack:win` を実行すると、exe のアイコン・バージョン情報の書き換え（rcedit）は wine が無い場合スキップされる。動作には影響しない。
- 生成物は署名されていないので、Windows で初回起動時に SmartScreen の警告が出る。「詳細情報 → 実行」で起動できる。
- `release/` と `app/` は git 管理外。

## Web 版との違い

| 項目 | Web 版 | デスクトップ版 |
| --- | --- | --- |
| 音の自動再生 | 最初の操作後 | 起動直後から |
| ローカルファイル | 不可 | メニュー「ファイル > モデル (GLB) を開いて配置」「点群 / CityGML を開く」 |
| 配布 | URL | exe（zip） |
| 描画 | 同じ（Chromium） | 同じ。GPU は高性能側を優先 |

描画・物理・音は同一コードなので、見た目や挙動の上限はどちらも同じ。差が出るのは配布形態と
大きなアセット（PLATEAU・点群・高精細な車体モデル）をローカルから読める点。
