# TOUGE DRIVE WEB v0.3

Chrome 上で遊べる 3D 峠ドライブゲーム。道路中心線から峠道を自動生成し、Rapier 物理の FR 車両で走る。
車種・パーツのカスタマイズ、ライバル車との対戦と掛け合い、ミニマップ・周回表示、合成サウンド/BGM、
GLB（BIM/CIM）モデルの走行・配置、PLATEAU CityGML と点群の取り込みに対応している。

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
| M | ミュート |
| P | オートパイロット ON/OFF（検証用） |

ゲームパッド（PS5 DualSense / Xbox、Gamepad API 標準マッピング。接続すると HUD に「パッド接続中」と出る）:

| ボタン | 操作 |
| --- | --- |
| R2 / L2 | アクセル（アナログ）/ ブレーキ（停止後は後退） |
| 左スティック・十字キー左右 | ステアリング |
| □ / L1 | サイドブレーキ |
| △ | 復帰 |
| ○ | カメラ切替 |
| × | 決定（走り出す・会話を進める） |
| OPTIONS | セットアップ画面 |

衝突・スキール・発進時に振動（対応ブラウザのみ）。Chrome ではページ上で一度ボタンを押すとパッドが認識される。

起動すると走行前セットアップ画面が出る（タブ: レース / ガレージ / キャラクター）。
コース・時間帯（昼/夕方/夜）・BGM、車種・パーツ、キャラクターの名前・口調・見た目、ライバルのロスター（最大 4 台）を決めて
「走り出す」とスタート前の会話シーンが始まり、その後にレース。ゴール後はレース後の会話が出る。
走行中も左上の「ガレージ」「モデル配置」「セットアップ」から変更できる。

URL パラメータ: `?course=sample-geo`（コース選択）, `?autopilot=1`（自動走行で開始、セットアップを省略）,
`?rival=1`（ライバルあり）, `?bgm=phonk|eurobeat|off`, `?mute=1`, `?skipSetup=1`, `?time=day|dusk|night`, `?fx=0`（ポストエフェクト無効）。

同梱コース: `touge01` 鳴沢峠（架空の峠）, `loop01` 湖畔サーキット（架空・3 周）, `sample-geo` GeoJSON + DEM + CityGML + 点群の合成サンプル,
`bim-bridge` GLB（Blender 生成の道路 + 橋梁）から走行路を読む BIM サンプル。すべて架空データ。

## 技術スタック

- React 19 + TypeScript 6 + Vite 8
- Three.js 0.186 / @react-three/fiber 9 / @react-three/drei 10
- Rapier 0.19（@dimforge/rapier3d-compat）/ @react-three/rapier 2
- zustand（HUD 状態）、vitest（単体テスト）、oxlint
- fast-xml-parser（CityGML）、Web Audio API（合成サウンド）
- Blender 4.0（ヘッドレスでサンプル GLB 生成）、BlenderMCP（`.mcp.json`、ローカルで利用）
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
               CityGmlImporter（PLATEAU CityGML → 建物メッシュ）, PointCloudImporter（PLY/LAS/XYZ）
               openDataCatalog（国内オープンデータの目録）
  bim/         GlbReader（Three.js 非依存 GLB パーサー）, BimModelImporter（走行路抽出・軸/単位補正）
  assets/      GlbAsset（GLB の描画 + 衝突）, modelCatalog（配置できるモデル一覧）
  scenery/     SceneryGenerator（樹木配置）, EnvironmentLayers（点群・建物レイヤー）
  vehicle/     vehicleConfig, RaycastVehicle（Rapier 車両コントローラーのラッパー）, Vehicle.tsx,
               carCatalog（車種・パーツ）, CarBody（見た目）, autopilot（AutopilotDriver）, RivalVehicle
  race/        characters（キャラクター・口調別台詞テンプレート）, conversation（レース前後の会話）
  audio/       AudioEngine（AudioWorklet エンジン音・環境音・SE・BGM 2 スタイル）, engineWorklet（爆発パルス合成）
  input/       keyboard, gamepad（Gamepad API、DualSense/Xbox 標準マッピング、振動）
  camera/      FollowCamera
  app/         Game（Canvas / Physics）, HUD, SetupScreen, GaragePanel, CharacterPanel, PlacementPanel, Minimap,
               DialogueOverlay, ConversationScene, Avatar, SceneEffects（影・ポストプロセス）, timePresets,
               RaceController（CP・周回・ゴール・順位・掛け合いトリガー）, gameStore, garageStore, runtime
  __tests__/   vitest 単体テスト
tools/blender/ make_sample_assets.py（サンプル GLB 生成）, README.md（BlenderMCP の設定）
scripts/       make-sample-geo.mjs（合成 CityGML / PLY 生成）, make-artifact-page.mjs（単一 HTML → Artifact 用）
docs/          open-data-roadmap.md（全国オープンデータ可視化・カスタムコース提供の設計）
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

検証環境: Node 22 / Chromium（Playwright 同梱、ヘッドレス + SwiftShader）。ヘッドレスで再現確認した内容のみ「確認済み」としている。
実機 Chrome での手動操作感（フレームレート・操作の手応え）は未確認。

| Task | 内容 | 状態 |
| --- | --- | --- |
| 1 | `npm run dev` で Chrome 上にゲーム画面表示 | 確認済み（HUD・路面・地形・樹木・空が描画される） |
| 1 | `npm run build` / `tsc -b` / `oxlint` / `vitest`（28 テスト） | 確認済み |
| 2 | W で前進（-Z 方向へ加速、約 5.4 m/s²） | 確認済み |
| 2 | S でブレーキ → 停止後に後退（ギア R 表示） | 確認済み |
| 2 | A で左旋回 / D で右旋回（直線区間でヨー変化を計測） | 確認済み |
| 2 | Space サイドブレーキ（後輪ロック + グリップ低下） | 実装済み・挙動はヘッドレスでは未計測 |
| 2 | R で復帰（スタート / 最終チェックポイントへ戻り速度ゼロ） | 確認済み |
| 2 | C でカメラ切替（追従 → ボンネット → 俯瞰） | 確認済み |
| 2 | Rapier `DynamicRayCastVehicleController` を用いた FR 車両（後輪駆動・前輪操舵・速度感応ステア・ダウンフォース） | 確認済み |
| 3 | XYZ 制御点 + 幅員 + 勾配 → centripetal Catmull-Rom 補間 → 等間隔サンプル | 確認済み（単体テスト） |
| 3 | 路面メッシュ・ガードレール・地形メッシュ生成、trimesh 衝突 | 確認済み |
| 3 | 架空コース「鳴沢峠」（約 1.5 km、ヘアピン 2・S 字）をオートパイロットで完走 | 確認済み（CP 5/5 → ゴール、復帰 0 回、89.2 s、最高 102 km/h） |
| 4 | 共通コースデータ `CourseDefinition` と `CourseManager`（procedural / geospatial / bim） | 確認済み（bim は NotImplemented を返す） |
| 4 | スタート・ゴール・チェックポイント・タイム計測・ゴール表示 | 確認済み |
| 5 | GeoJSON 線形 + 配列 DEM → `GeoDataImporter` → `CourseDefinition(geospatial)` → 同じパイプラインで走行 | 確認済み（合成データの `sample-geo` をオートパイロットで完走、52.0 s） |
| 5 | `CoordinateTransformer`（緯度経度 / 投影座標 ⇔ ゲーム座標、往復変換） | 確認済み（単体テスト） |
| 追加 | GLB 読み込み（`GlbReader`）と BIM コース（`bim-bridge`、GLB のデッキ上を走行） | 確認済み（自動走行で完走、107 km/h） |
| 追加 | 既存コースへの GLB 配置（鳥居・橋梁セグメント）と trimesh 衝突 | 確認済み（描画・走行） |
| 追加 | 車種 4 種・パーツ 6 カテゴリ・走行前セットアップ画面 | 確認済み（画面表示・パラメータ反映） |
| 追加 | ミニマップ・進行バー・周回（`loop01` 3 周完走） | 確認済み |
| 追加 | ライバル車（最大 4 台、3 段階）・順位 N/M・口調別の掛け合い | 確認済み（3 台同時出走、順位・会話表示） |
| 追加 | キャラクター設定（名前・口調・似顔絵）とレース前後の会話シーン | 確認済み（画面表示・台詞生成） |
| 追加 | AudioWorklet エンジン音（爆発パルス合成・慣性付き回転数・5 速）、環境音、SE、リバーブ付き BGM | ヘッドレスで worklet 動作と回転数変化を確認。音質は実機で要確認 |
| 追加 | ヘッドライト（スポットライト + グロー）、クリアコート塗装、環境反射、昼/夕方/夜 | 確認済み（夜間に路面が照らされる） |
| 追加 | ゲームパッド操作（R2/L2/スティック/各ボタン、メニュー決定） | 仮想パッドを注入して確認。実機の DualSense は未検証（Bluetooth/USB どちらでも標準マッピングになる想定） |
| 追加 | PLATEAU 形式 CityGML（LOD1）と PLY 点群のレイヤー表示・建物衝突 | 確認済み（合成データ） |
| 追加 | LAS 1.2〜1.4 点群の解析 | 単体テストのみ（実データ未検証） |


## 未実装・今後の機能

| 機能 | 状態 | 備考 |
| --- | --- | --- |
| BIM/CIM（GLB）モデルの読み込み・走行 | 実装済み | ノード名 `Road_` / `Deck_` 等を走行路として抽出。FBX は Blender で GLB へ変換する（`tools/blender/README.md`）。IFC 直読みは未対応 |
| 既存コースへの外部モデル配置 | 実装済み | 「モデル配置」パネルから車の前方に配置。配置は localStorage 保存、JSON をコース定義へ貼り付け可能。ドラッグ移動 UI は未実装 |
| 道路・橋梁モデルと既存走行路の接続 | 一部 | 配置した橋梁セグメントの上は走れるが、既存路面との段差の自動すり合わせ（高さ合わせ・接続点のスナップ）は未実装 |
| 実在道路の線形・標高からのコース生成 | オフライン対応 | GeoJSON + DEM グリッド + CityGML + 点群をファイルから読める。国土地理院タイル・OSM API の取得、proj4 の投影変換、LAZ 展開は未実装（`docs/open-data-roadmap.md`） |
| 全国オープンデータの可視化・場所選択 | 設計のみ | MapLibre + `openDataCatalog`。`docs/open-data-roadmap.md` 参照 |
| カスタムコース生成の有料化 / カミングスーン要望 | 設計のみ | 決済・リクエスト管理・生成ジョブのバックエンドが必要。同文書参照 |
| AI 景観生成・自然言語コース編集 | 未実装 | `SceneryInstances` と `layers` を AI 生成の受け皿にする想定 |
| ライバルの AI | 簡易 | pure pursuit + スタック時後退。追い抜きライン・ブロック・ライバル同士の駆け引きは未実装 |
| 掛け合いの音声 | 未実装 | テキストのみ。音声合成（Web Speech API / 外部 TTS）は未接続 |
| 車両モデル | 簡易形状 | 全車プリミティブ構成。Blender で作った GLB 車体の読み込みは `GlbAsset` で可能だが未接続 |
| サウンド | 合成のみ | 録音素材なし。実機での音量バランス調整が必要 |

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
npm run check                      # tsc + oxlint + vitest（49 テスト）
npm run dev                        # 手動: Chrome で操作確認
```

ヘッドレス検証（Playwright がインストール済みの環境）:
`window.__touge` にストアとランタイム状態を公開しているので、`?autopilot=1` で開き
`store.getState().finished` を監視すればコース完走を自動確認できる。
