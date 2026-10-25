# オープンデータ活用とカスタムコース提供のロードマップ

目的: 日本全国のオープンデータ（道路線形・標高・建物・点群）から実在の峠コースを生成し、
「どこにどんなデータがあるか」を地図で可視化して、ユーザーがコースを作る場所を選べるようにする。
その上で、カスタムコース生成を有料サービス（または要望受付＋順次実装）として提供する。

## 1. 現状（v0.3 時点で実装済み）

| 層 | モジュール | 状態 |
| --- | --- | --- |
| 道路線形 | `GeoDataImporter`（GeoJSON LineString） | オフライン入力に対応。OSM / 基盤地図情報は GeoJSON に変換すれば読める |
| 標高 | `GeoDataImporter.DemGrid` | 規則格子を渡せば双一次補間で線形に標高を付与。標高タイルの取得は未実装 |
| 建物 | `CityGmlImporter`（PLATEAU CityGML LOD1/LOD2） | オフライン入力に対応。合成データで描画・衝突まで確認 |
| 点群 | `PointCloudImporter`（PLY / LAS / XYZ） | オフライン入力に対応。LAZ は未対応 |
| 座標変換 | `CoordinateTransformer` | 緯度経度（局所近似）・投影座標 → ゲーム座標。proj4 未導入 |
| データ目録 | `openDataCatalog` | 出典・ライセンス・形式・対応状況の静的一覧 |

ゲーム本体はこれらの出力（`CourseDefinition` + `layers`）だけを見るので、
取得方法（手動ダウンロード / API / バックエンド生成）を差し替えてもゲーム側は変わらない。

## 2. 全国データ可視化マップ（次フェーズ）

- MapLibre GL JS で日本地図を表示し、以下をレイヤーとして重ねる
  - PLATEAU 整備都市のポリゴン（G空間情報センターの都市一覧から生成）
  - DEM5A の整備範囲（国土地理院の整備状況図）
  - 点群公開エリア（静岡県全域、東京都 23 区など）
  - OSM の道路密度（`highway=tertiary` 以上）をタイルで表示
- クリックした地点について `openDataCatalog` の各ソースから「使えるデータ」を判定し、
  実現できるリアリティ（道路のみ / 道路 + 地形 / + 建物 / + 点群）を星の数で示す
- ユーザーは線形を指定（OSM の道路をクリックして始点・終点を選ぶ）してリクエストを作る
- 生成はブラウザ内（小規模）またはバックエンド（PLATEAU の切り出し・点群の間引きは重い）で行う

## 3. カスタムコースの提供モデル

```
[ユーザー] 地図で場所を選ぶ
   │
   ├─ 無料枠: 同梱サンプル + 自分で用意したデータの取り込み（既に可能）
   │
   └─ カスタム生成リクエスト
        ├─ 即時生成（有料）: 決済 → ジョブ投入 → 生成 → ダウンロード/ゲーム内配信
        └─ カミングスーン（無料・順次）: 要望として登録 → 票数順に実装 → 公開時に通知
```

### 必要になるバックエンド（未実装）

| 機能 | 候補 |
| --- | --- |
| 認証・ユーザー | Supabase Auth / Firebase Auth |
| 決済 | Stripe Checkout（単発課金）+ Webhook |
| リクエスト管理 | Postgres（Supabase）: requests(id, user, bbox, alignment, status, votes, paid) |
| 生成ジョブ | Cloud Run Jobs / Cloudflare Workers + Queue。PLATEAU 切り出し・点群間引き・DEM 取得 |
| 配信 | 生成した CourseDefinition + GLB/PLY/GML を R2/S3 に置き、ゲームは URL で読む |
| 可視化 | MapLibre + PMTiles（静的タイルを R2 に置けばサーバー不要） |

### 利用条件・出典の扱い

- `Attribution`（source / license / url / fictional）を CourseDefinition に必ず持たせ、ゲーム内で表示する
- PLATEAU、国土地理院、静岡県・東京都点群はいずれも出典表記が必要。OSM は ODbL（派生データの共有条件）に注意
- 架空データ（`fictional: true`）と実データは UI 上で区別する

## 4. 技術的な前提条件・課題

- **投影変換**: 広域で使うには proj4js を入れて平面直角座標系（EPSG:6669〜6687）を正式に扱う
- **データ量**: PLATEAU の 1 市区町村は数百 MB。bbox で切り出すツール（plateau-utils / citygml-tools / QGIS）を
  バックエンドに置くか、3D Tiles 配信（Cesium ion 不要の静的 3D Tiles + three-loader-3dtiles）に切り替える
- **点群**: LAZ 展開に laz-perf（wasm）。描画は Potree 形式（オクツリー）へ変換するとストリーミングできる
- **道路幅員**: OSM の `width` / `lanes` は欠損が多い。基盤地図情報の道路縁から幅員を計算する処理が必要
- **路面の自動生成**: 実道路では DEM の解像度（5 m）が路面の滑らかさに効く。中心線標高はスプラインで平滑化する
- **BIM/CIM**: IFC を直接読むより Blender（Bonsai アドオン）経由で GLB にするのが現実的。BlenderMCP で半自動化できる
