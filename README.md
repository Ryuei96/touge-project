# TOUGE DRIVE WEB v0.3

Chrome 上で遊べる 3D 峠ドライブゲーム。道路中心線から峠道を自動生成し、Rapier 物理の FR 車両で走る。

将来の BIM/CIM モデル読み込み・実在道路の線形/標高からのコース生成・AI 景観生成・有料カスタムコースに
対応できるよう、コースデータとジオデータ処理をゲーム本体から分離した構成にしている。

## 起動

```bash
npm install
npm run dev        # http://localhost:5173 を Chrome で開く
npm run check      # 型チェック + Lint + 単体テスト
npm run build      # 本番ビルド（dist/）
```

| キー | 操作 |
| --- | --- |
| W / ↑ | アクセル |
| S / ↓ | ブレーキ（停止後は後退） |
| A / D, ← / → | ステアリング |
| Space | サイドブレーキ（後輪ロック + 後輪グリップ低下でスライド） |
| R | 復帰（最後に通過したチェックポイントへ） |
| C | カメラ切替（追従 / ボンネット / 俯瞰） |
| P | オートパイロット ON/OFF（検証用） |

URL パラメータ: `?course=sample-geo`（コース選択）, `?autopilot=1`（自動走行で開始）。

## 技術スタック

- React 19 + TypeScript 6 + Vite 8
- Three.js 0.186 / @react-three/fiber 9 / @react-three/drei 10
- Rapier 0.19（@dimforge/rapier3d-compat）/ @react-three/rapier 2
- zustand（HUD 状態）、vitest（単体テスト）、oxlint
- 検証: Playwright + 同梱 Chromium（ヘッドレス、SwiftShader）

## ディレクトリ構成

```
src/
  core/        vec3（Three.js 非依存のベクトル演算）, noise（決定論ノイズ・乱数）
  road/        spline（Catmull-Rom 補間・等間隔サンプリング）
               RoadMeshGenerator（路面・ガードレールメッシュ）
               TerrainMeshGenerator（道路追従ハイトフィールド・地形メッシュ）
               CollisionBuilder（MeshData → 衝突形状記述）
  course/      types（共通コースデータ定義）, CourseManager, buildCourse（構築パイプライン）
               courses/touge01（架空峠）, courses/sampleGeoCourse（GeoJSON 経路の動作確認用・架空）
               CourseScene（BuiltCourse → Three.js / Rapier）
  geo/         CoordinateTransformer（緯度経度・投影座標 ⇔ ゲーム座標）
               GeoDataImporter（GeoJSON 線形 + DEM → CourseDefinition）
  scenery/     SceneryGenerator（樹木配置）
  vehicle/     vehicleConfig, RaycastVehicle（Rapier 車両コントローラーのラッパー）, Vehicle.tsx, autopilot
  input/       keyboard
  camera/      FollowCamera
  app/         Game（Canvas / Physics）, HUD, RaceController（CP・ゴール・タイム）, gameStore, runtime
  __tests__/   vitest 単体テスト
```

### 設計上の分離

- **車両挙動（vehicle/）はコースを知らない。** 路面は Rapier の衝突形状としてのみ見る。
- **道路メッシュ生成（road/）は Three.js / Rapier を知らない。** `MeshData` / `CollisionShape` という
  素のデータを返し、`CourseScene` が Three.js の `BufferGeometry` と Rapier の `TrimeshCollider` に変換する。
- **コース定義（CourseDefinition）は procedural / geospatial / bim で共通。** `CourseManager` が
  データソース別のビルダーへ振り分ける。procedural と geospatial は中心線の出どころが違うだけで、
  同じ `buildCourseFromCenterline` パイプラインを使う。
- **ジオデータ処理（geo/）はゲーム本体から独立。** `GeoDataImporter` の出力は `CourseDefinition` で、
  ゲーム側はそれが実データ由来か架空かを `attribution.fictional` で区別する。

## 座標系

- ゲーム座標: X = 東, Y = 上, Z = 南（-Z = 北）。右手系・Y-up・単位 m。
- 車両ローカル: +Z 前, +Y 上, +X 右。
- ENU（East-North-Up）との関係: `x = east, y = up, z = -north`。
- 日本の平面直角座標系は X が北・Y が東なので、`ProjectedPosition` には `easting = Y, northing = X` と読み替えて渡す。

## 共通コースデータ（Task 4）

`src/course/types.ts` の `CourseDefinition`:

| 項目 | フィールド |
| --- | --- |
| コース ID・名称 | `id`, `name`, `description` |
| データソース | `source: 'procedural' | 'geospatial' | 'bim'` |
| ローカル座標原点 | `origin.local` |
| 元データの座標参照系 | `origin.sourceCrs`（例 `EPSG:6677`）, `origin.sourcePosition`, `origin.verticalDatum` |
| 道路中心線 | `centerline: CenterlinePoint[]`（XYZ + 任意の幅員） |
| 路面幅 | `defaultWidth`, 各点の `width` |
| 標高 | `elevation.mode`（embedded / dem / profile）, `elevation.demSource` |
| 道路・地形メッシュ | 生成結果は `BuiltCourse.meshes`、既存メッシュは `meshes`（BIM 用・未使用） |
| 衝突判定情報 | 生成結果は `BuiltCourse.collision`、既存形状は `collision`（未使用） |
| 配置アセット | `assets: PlacedAsset[]`（primitive / glb / fbx） |
| スタート・ゴール・チェックポイント | `checkpoints`（距離指定 or 間隔）→ `BuiltCourse.markers` |
| 出典・利用条件 | `attribution`（source, license, url, fictional） |

## 動作確認済みの機能（v0.3）

__VERIFICATION__

## 未実装・今後の機能

| 機能 | 状態 | 備考 |
| --- | --- | --- |
| BIM/CIM（GLB・FBX）モデルの読み込み・走行 | 未実装 | `PlacedAsset.kind = 'glb'` の型と `source = 'bim'` の分岐（NotImplemented を返す）のみ。GLB は drei `useGLTF` + Rapier `trimesh` で対応予定。FBX は Blender で GLB へ変換する方針 |
| 既存コースへの外部モデル配置 | 一部 | primitive（box 等）の配置と box 衝突は動作。GLB 配置 UI は未実装 |
| 道路・橋梁モデルと既存走行路の接続 | 未実装 | 中心線の接続点（端点・接線）を `CourseDefinition` に持たせる設計が必要 |
| 実在道路の線形・標高からのコース生成 | 設計のみ | `GeoDataImporter` はオフラインの GeoJSON + 配列 DEM のみ対応。国土地理院標高タイル・道路線形 API の取得は未実装（`GeoSourceNotImplementedError`）。proj4 による正式な投影変換も未導入（局所近似のみ） |
| AI 景観生成・自然言語コース編集 | 未実装 | `SceneryGenerator` の出力形式 `SceneryInstances` を AI 生成の受け皿にする想定 |
| カスタムコース生成の有料サービス化 | 未実装 | 本リリースではオンライン API・課金は対象外 |
| 地図 UI（MapLibre） | 未実装 | 第一候補として MapLibre を想定 |
| Blender + BlenderMCP による 3D アセット | 未実装 | 現状は全て簡易プリミティブ |
| 効果音・BGM | 未実装 | |

## 既知の技術的問題点

- **Rapier `addForce` は蓄積される。** 毎ステップ力を加えると積み上がって車体が沈むため、ダウンフォースは
  `applyImpulse(force * dt)` で与えている。
- **Rapier 車両コントローラーの符号。** 舵角は正で左旋回、駆動力は +Z（前）方向。ブラウザ検証で確定させ、
  `RaycastVehicle.ts` の `STEER_SIGN` / `ENGINE_SIGN` にまとめている。
- **駆動力は輪ごとに加わる。** `maxEngineForce` は後輪 1 輪あたりの値で、合計はその 2 倍。
- **車両の挙動はアーケード寄りの近似。** タイヤモデルは Rapier（Bullet 由来）のレイキャスト車両で、
  frictionSlip / sideFrictionStiffness による簡易グリップ。ドリフトの手応えは今後要調整。
- **地形は架空のノイズ地形。** 道路の近傍は路面高さに追従し、離れるほど「中心線にフィットした平面 + fBm」へ
  ブレンドする。実 DEM が入る場合は `HeightField` 実装を差し替える。
- **地形・道路の衝突は trimesh。** 大規模な実在コースでは `heightfield` への切替や分割ロードが必要。
- **ヘッドレス Chromium（SwiftShader）での検証は低フレームレート。** 物理は固定ステップ（1/60 s）なので
  挙動の再現性はあるが、体感の操作性は実機 Chrome で確認すること。
- **架空データの扱い。** 同梱コースは全て `attribution.fictional = true`。`sample-geo` は GeoDataImporter の
  経路確認用の合成緯度経度・合成 DEM で、実在地点とは無関係。

## 検証方法

```bash
npm run check                      # tsc + oxlint + vitest（27 テスト）
npm run dev                        # 手動: Chrome で操作確認
```

ヘッドレス検証（Playwright がインストール済みの環境）:
`window.__touge` にストアとランタイム状態を公開しているので、`?autopilot=1` で開き
`store.getState().finished` を監視すればコース完走を自動確認できる。
