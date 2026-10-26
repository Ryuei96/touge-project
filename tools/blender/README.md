# Blender / BlenderMCP

## ヘッドレスでのサンプルアセット生成

```bash
# Ubuntu: apt install blender python3-numpy
blender --background --python tools/blender/make_sample_assets.py -- public/models
```

`public/models/` に `bridge-segment.glb` / `bim-bridge-course.glb` / `shrine-gate.glb` を書き出す。
いずれも架空の簡易形状で、実在の構造物や BIM データではない。

## BlenderMCP（Claude Code から Blender を操作する）

リポジトリ直下の `.mcp.json` に `blender` サーバー（`uvx blender-mcp`、ahujasid/blender-mcp）を登録している。
Blender は手元の PC で GUI 起動している必要があるため、**ローカルで Claude Code（CLI またはデスクトップアプリ）をこのリポジトリで起動して使う**。
クラウド（claude.ai/code）のセッションからは手元の Blender に到達できない。

動作確認: 本リポジトリのスクリプトは Blender 4.0.2（ヘッドレス）で検証。Blender 5.2 LTS で削除された
`use_auto_smooth` には対応済み（4.1 以降は「角度でスムーズ」オペレータを使う）が、5.2 での実行は未検証。

### 手順（Blender 5.2 LTS）

1. `uv` を入れる: Windows は `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`、macOS/Linux は `curl -LsSf https://astral.sh/uv/install.sh | sh`。
2. https://github.com/ahujasid/blender-mcp の `addon.py` をダウンロードし、Blender の
   Edit > Preferences > Add-ons > 右上の ∨ > Install from Disk… で入れて「Interface: Blender MCP」を有効化する。
3. 3D ビューポートでサイドバー（N キー）> BlenderMCP タブ > **Connect to Claude**（ポート 9876 で待受）。
4. リポジトリのフォルダで `claude` を起動。`.mcp.json` のサーバーを使うか聞かれるので許可する。`/mcp` で `blender` が connected なら OK。
5. 例: 「`tools/blender/make_cars.py` の hatch を Blender に読み込んで、屋根をもう少し低くして `public/models/cars/hatch.glb` に書き出して」
   のように頼むと、Claude が `execute_blender_code` でスクリプトを流し、`get_viewport_screenshot` で見た目を確認しながら調整できる。

Poly Haven の無料アセット（HDRI・テクスチャ・小物）はアドオンの設定で「Use assets from Poly Haven」をオンにすると
Claude から検索・配置できる。Sketchfab / Hyper3D は各サービスの API キーが必要。

### もう一つの選択肢: MCP for Blender（Claude デスクトップアプリ用）

Claude デスクトップアプリ（Cowork）のコネクタに「Blender」がある場合はそちらでも動く。アドオンは
`uvx mcp-for-blender install-addon` で入れ、Blender 側で有効化する。どちらか一方を使えばよい。

### ヘッドレスだけで済ませる場合

GUI も MCP も使わず、`blender --background --python tools/blender/make_cars.py -- public/models/cars` で
車体 GLB を再生成できる（現在のアセットはこの方法で作っている）。

## モデル命名規約（BimModelImporter が参照）

| ノード名の接頭辞 | 扱い |
| --- | --- |
| `Road_`, `Deck_`, `Pavement_`, `Lane_` | 走行路（trimesh 衝突・車が走れる） |
| それ以外 | 障害物（trimesh 衝突あり、走行対象外） |

座標系: Blender は Z-up。glTF エクスポータ（`export_yup=True`、既定）が Y-up に変換するので、
ゲーム側では `upAxis: 'Y'` のまま読める。IFC → Blender を経由せず Z-up のまま書き出された GLB は
`upAxis: 'Z'` を指定する。単位は m（mm のモデルは `scale: 0.001`）。
