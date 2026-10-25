# Blender / BlenderMCP

## ヘッドレスでのサンプルアセット生成

```bash
# Ubuntu: apt install blender python3-numpy
blender --background --python tools/blender/make_sample_assets.py -- public/models
```

`public/models/` に `bridge-segment.glb` / `bim-bridge-course.glb` / `shrine-gate.glb` を書き出す。
いずれも架空の簡易形状で、実在の構造物や BIM データではない。

## BlenderMCP（Claude Code から Blender を操作する）

リポジトリ直下の `.mcp.json` に `blender` サーバー（`uvx blender-mcp`）を登録している。
ローカル PC で使うには次の準備が必要（クラウドのヘッドレス環境では GUI の Blender が無いため動かない）。

1. Blender 3.0 以降をインストールする。
2. `uv` をインストールする（`curl -LsSf https://astral.sh/uv/install.sh | sh` または `pip install uv`）。
3. https://github.com/ahujasid/blender-mcp から `addon.py` を取得し、Blender の
   Edit > Preferences > Add-ons > Install でアドオンとして入れ、「Interface: Blender MCP」を有効化する。
4. Blender の 3D ビューポートのサイドバー（N キー）> BlenderMCP タブ > Connect to Claude を押す。
5. Claude Code をこのリポジトリで起動すると `.mcp.json` の `blender` サーバーが有効になる
   （初回は許可を求められる）。`/mcp` で接続状態を確認できる。

## モデル命名規約（BimModelImporter が参照）

| ノード名の接頭辞 | 扱い |
| --- | --- |
| `Road_`, `Deck_`, `Pavement_`, `Lane_` | 走行路（trimesh 衝突・車が走れる） |
| それ以外 | 障害物（trimesh 衝突あり、走行対象外） |

座標系: Blender は Z-up。glTF エクスポータ（`export_yup=True`、既定）が Y-up に変換するので、
ゲーム側では `upAxis: 'Y'` のまま読める。IFC → Blender を経由せず Z-up のまま書き出された GLB は
`upAxis: 'Z'` を指定する。単位は m（mm のモデルは `scale: 0.001`）。
