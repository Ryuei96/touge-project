/**
 * 共通コースデータ定義（Task 4）。
 * procedural / geospatial / bim のいずれのソースでも同じ構造で表し、
 * CourseManager から同一 API で読み込めるようにする。
 */
import type { Vec3 } from '../core/vec3'
import type { CenterlinePoint, RoadSample } from '../road/spline'

export type CourseSource = 'procedural' | 'geospatial' | 'bim'

export interface GeodeticPosition {
  /** 緯度 [deg] */
  latitude: number
  /** 経度 [deg] */
  longitude: number
  /** 楕円体高または標高 [m] */
  altitude?: number
}

/** 投影座標（平面直角座標系・UTM など）。easting / northing は「東向き / 北向き」の距離 [m]。 */
export interface ProjectedPosition {
  easting: number
  northing: number
  height?: number
}

/**
 * ローカル座標原点と元データの座標参照系。
 * ゲーム座標は X=東, Y=上, Z=南 の右手系（m）。
 */
export interface CourseOrigin {
  /** ゲーム座標におけるコース原点（通常 0,0,0） */
  local: Vec3
  /** 元データの座標参照系。例: 'EPSG:6677'（JGD2011 平面直角 IX 系）, 'EPSG:4326', 'LOCAL'（架空） */
  sourceCrs: string
  /** 元データ座標系で見た原点の位置。LOCAL のときは未定義 */
  sourcePosition?: GeodeticPosition | ProjectedPosition
  /** 標高の基準。'none' = 架空データ */
  verticalDatum?: 'JGD2011' | 'EGM2008' | 'ellipsoid' | 'none'
}

/** 出典・利用条件 */
export interface Attribution {
  source: string
  license: string
  url?: string
  retrievedAt?: string
  notes?: string
  /** true のとき、データは架空であり実測値ではない */
  fictional: boolean
}

export interface Marker {
  id: string
  position: Vec3
  radius: number
  label?: string
  /** 中心線からの弧長 [m]（コース生成時に埋まる） */
  distance?: number
}

export interface Pose {
  position: Vec3
  /** ヨー角 [rad]（+Z 前方向を 0） */
  heading: number
}

export type AssetKind = 'primitive' | 'glb' | 'fbx'

/** 配置アセット（将来の BIM/CIM・外部モデル配置に対応） */
export interface PlacedAsset {
  id: string
  kind: AssetKind
  /** glb / fbx のとき: モデルの URI（public/ 配下など） */
  uri?: string
  /** primitive のとき */
  primitive?: 'box' | 'cylinder' | 'cone' | 'sphere'
  color?: string
  position: Vec3
  /** オイラー角 [rad] */
  rotation?: Vec3
  scale?: Vec3
  collision?: 'none' | 'box' | 'trimesh'
}

/** 描画・衝突に使うメッシュデータ（Three.js 非依存） */
export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  uvs?: Float32Array
  colors?: Float32Array
}

export type CollisionShape =
  | { kind: 'trimesh'; label: string; vertices: Float32Array; indices: Uint32Array; friction?: number }
  | { kind: 'heightfield'; label: string; rows: number; cols: number; heights: Float32Array; scale: Vec3; friction?: number }

export interface ElevationInfo {
  /** 'embedded' = 中心線の y に埋め込み済み, 'dem' = DEM から取得, 'profile' = 距離-標高プロファイル */
  mode: 'embedded' | 'dem' | 'profile'
  /** DEM 由来のとき: DEM の識別子（例: 'GSI DEM5A'） */
  demSource?: string
  profile?: { distance: number; elevation: number }[]
}

export interface TerrainOptions {
  enabled?: boolean
  /** 中心線バウンディングボックス外側の余白 [m] */
  margin?: number
  /** グリッド分割数（1 辺） */
  resolution?: number
  seed?: number
  /** ノイズ振幅 [m] */
  amplitude?: number
  /** 路肩幅 [m]（この範囲は路面高さに追従） */
  shoulder?: number
  /** 路肩から山肌へ遷移する距離 [m] */
  blendDistance?: number
}

export type CheckpointSpec = { atDistance: number; label?: string }[] | { interval: number }

/** コース定義（著者が書く / インポーターが生成するデータ） */
export interface CourseDefinition {
  id: string
  name: string
  description?: string
  source: CourseSource
  origin: CourseOrigin
  attribution: Attribution
  /** 道路中心線（ゲーム座標） */
  centerline: CenterlinePoint[]
  /** 既定の幅員 [m] */
  defaultWidth: number
  elevation: ElevationInfo
  /** サンプリング間隔 [m] */
  sampleStep?: number
  /** 閉路（周回コース）か */
  closed?: boolean
  /** 周回数（closed のとき）。省略時 1 */
  laps?: number
  terrain?: TerrainOptions
  guardrails?: boolean
  checkpoints?: CheckpointSpec
  assets: PlacedAsset[]
  /** BIM 等で既にメッシュが存在する場合（将来用） */
  meshes?: { road?: MeshData; terrain?: MeshData }
  /** 既存の衝突形状（将来用） */
  collision?: CollisionShape[]
  /** 景観生成のシード・密度 */
  scenery?: { seed?: number; treeCount?: number }
  /** source = 'bim' のとき: 走行路を含む GLB モデル */
  model?: BimModelRef
  /** 周辺環境レイヤー（点群・建物など）。ブラウザで非同期に読み込む */
  layers?: CourseLayer[]
}

/** 点群レイヤー: PLY / LAS / XYZ を読み、ゲーム座標で描画する */
export interface PointCloudLayerRef {
  kind: 'point-cloud'
  id: string
  uri: string
  /** 'enu' = (east, north, up) 列, 'game' = 既にゲーム座標, 'projected' = course.origin の投影座標（easting, northing, height） */
  coordinates: 'enu' | 'game' | 'projected'
  /** X/Y 入れ替え（平面直角座標系の X=北・Y=東 対策） */
  swapXY?: boolean
  maxPoints?: number
  pointSize?: number
  attribution: Attribution
}

/** CityGML 建物レイヤー（PLATEAU など）。course.origin が緯度経度なら同じ原点で変換する */
export interface CityGmlLayerRef {
  kind: 'citygml'
  id: string
  uri: string
  collision?: boolean
  maxBuildings?: number
  maxDistance?: number
  color?: string
  attribution: Attribution
}

export type CourseLayer = PointCloudLayerRef | CityGmlLayerRef

/** BIM/CIM モデル（GLB）の参照と補正 */
export interface BimModelRef {
  /** public/ からの相対 URI（例 'models/bim-bridge-course.glb'） */
  uri: string
  /** 走行路ノード名の正規表現（文字列）。既定は ^(Road_|Deck_|Pavement_|Lane_) */
  drivablePattern?: string
  /** モデル単位 → m の倍率 */
  scale?: number
  upAxis?: 'Y' | 'Z'
  offset?: Vec3
  yaw?: number
}

export interface SceneryInstance {
  position: Vec3
  scale: number
  rotationY: number
  /** 色のばらつき（0..1） */
  tint?: number
}

export type TreeSpecies = 'conifer' | 'broadleaf'

export interface TreeInstance extends SceneryInstance {
  species: TreeSpecies
}

export type SignKind = 'curve-left' | 'curve-right' | 'speed-40' | 'chevron-left' | 'chevron-right'

export interface SignInstance {
  position: Vec3
  /** 板の向き（ヨー） */
  heading: number
  kind: SignKind
}

export interface SceneryInstances {
  trees: TreeInstance[]
  rocks: SceneryInstance[]
  bushes: SceneryInstance[]
  /** 視線誘導標（白い反射ポール） */
  delineators: SceneryInstance[]
  /** 電柱（heading = 道路方向） */
  poles: SceneryInstance[]
  signs: SignInstance[]
}

export interface HeightField {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  getHeight(x: number, z: number): number
  /** 道路中心線までの水平距離 [m] と最近傍サンプルのインデックス */
  roadInfo(x: number, z: number): { distance: number; index: number }
  /** サンプル index の幅員 [m] */
  roadWidthAt?(index: number): number
}

/** CourseManager が返す、走行可能な状態に構築されたコース */
export interface BuiltCourse {
  definition: CourseDefinition
  samples: RoadSample[]
  /** 総延長 [m] */
  length: number
  meshes: { road: MeshData; terrain?: MeshData; guardrails: MeshData[]; guardrailBeams: MeshData[]; shoulders: MeshData[] }
  collision: CollisionShape[]
  heightField?: HeightField
  markers: { start: Pose; goal: Marker; checkpoints: Marker[] }
  scenery: SceneryInstances
  /** ガードレールのある区間（サンプルごと） */
  guardrailMask: { left: boolean[]; right: boolean[] }
  /** 標高の範囲 */
  bounds: { minY: number; maxY: number }
}
