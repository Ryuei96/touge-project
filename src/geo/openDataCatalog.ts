/**
 * 日本のオープンデータのカタログ（コース生成に使える候補）。
 * 「全国のどこにどのデータがあるか」を可視化する地図 UI（MapLibre 予定）と、
 * コース生成リクエスト機能の土台。ここに書くのは出典・ライセンス・形式・対応状況の静的情報のみで、
 * 取得（ネットワーク）は行わない。
 */
export type DataKind = 'road-alignment' | 'dem' | 'buildings' | 'point-cloud' | 'trees' | 'bridges-bim' | 'landuse'

export interface OpenDataSource {
  id: string
  name: string
  provider: string
  kind: DataKind[]
  license: string
  url: string
  formats: string[]
  /** 整備範囲の概要 */
  coverage: string
  /** このプロジェクトでの取り込み状況 */
  support: 'implemented-offline' | 'parser-ready' | 'planned'
  notes?: string
}

export const OPEN_DATA_SOURCES: OpenDataSource[] = [
  {
    id: 'plateau',
    name: 'PLATEAU 3D 都市モデル',
    provider: '国土交通省',
    kind: ['buildings', 'bridges-bim', 'landuse', 'trees'],
    license: 'PLATEAU ポリシー（CC BY 4.0 相当）',
    url: 'https://www.geospatial.jp/ckan/dataset/plateau',
    formats: ['CityGML', '3D Tiles', 'OBJ', 'FBX', 'GeoPackage'],
    coverage: '全国 200 以上の都市（2024 年度時点）。建築物 LOD1 は対象都市全域、LOD2 は主に都市中心部',
    support: 'parser-ready',
    notes: 'CityGML の bldg:Building（LOD1/LOD2）を CityGmlImporter で読める。配布は市区町村単位の zip（数百 MB）なので、対象範囲を切り出して public/ に置く運用。橋梁（brid:Bridge）は未対応',
  },
  {
    id: 'gsi-dem',
    name: '基盤地図情報 数値標高モデル（DEM5A/5B/10B）・標高タイル',
    provider: '国土地理院',
    kind: ['dem'],
    license: '国土地理院コンテンツ利用規約（出典明記）',
    url: 'https://fgd.gsi.go.jp/download/',
    formats: ['GML (JPGIS)', '標高タイル (PNG / TXT)'],
    coverage: '10B は全国、5A（航空レーザー）は都市部・河川沿い中心',
    support: 'parser-ready',
    notes: 'GeoDataImporter.DemGrid 形式に変換して渡す。標高タイルの取得は未実装（GeoSourceNotImplementedError）',
  },
  {
    id: 'gsi-fgd-road',
    name: '基盤地図情報 道路縁・道路中心線',
    provider: '国土地理院',
    kind: ['road-alignment'],
    license: '国土地理院コンテンツ利用規約',
    url: 'https://fgd.gsi.go.jp/download/',
    formats: ['GML (JPGIS)', 'Shapefile（変換後）'],
    coverage: '全国',
    support: 'parser-ready',
    notes: 'GeoJSON LineString へ変換すれば GeoDataImporter で読める（QGIS 等で変換）',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap 道路',
    provider: 'OpenStreetMap contributors',
    kind: ['road-alignment'],
    license: 'ODbL 1.0',
    url: 'https://www.openstreetmap.org/',
    formats: ['GeoJSON (Overpass API)', 'PBF'],
    coverage: '全国（峠道の整備率が高い）',
    support: 'parser-ready',
    notes: 'highway=* の way を GeoJSON LineString で取得して GeoDataImporter へ。幅員は lanes / width タグから推定',
  },
  {
    id: 'shizuoka-pcdb',
    name: 'VIRTUAL SHIZUOKA 点群データ',
    provider: '静岡県',
    kind: ['point-cloud'],
    license: 'CC BY 4.0',
    url: 'https://www.geospatial.jp/ckan/dataset/shizuoka-2019-pointcloud',
    formats: ['LAS', 'LAZ', 'TXT'],
    coverage: '静岡県全域（航空レーザー）・一部道路（MMS）',
    support: 'parser-ready',
    notes: 'LAS（非圧縮）は PointCloudImporter で読める。LAZ は事前展開が必要。座標系は平面直角 VIII 系（EPSG:6676）',
  },
  {
    id: 'tokyo-pointcloud',
    name: '東京都デジタルツイン 点群データ',
    provider: '東京都',
    kind: ['point-cloud'],
    license: 'CC BY 4.0',
    url: 'https://www.geospatial.jp/ckan/dataset/tokyopc-23ku-2024',
    formats: ['LAS', 'LAZ'],
    coverage: '23 区・多摩地域（順次）',
    support: 'parser-ready',
  },
  {
    id: 'mlit-bimcim',
    name: '道路・橋梁 BIM/CIM モデル（事業別）',
    provider: '国土交通省・各地方整備局',
    kind: ['bridges-bim', 'road-alignment'],
    license: '事業ごとに異なる（要確認）',
    url: 'https://www.mlit.go.jp/tec/tec_tk_000037.html',
    formats: ['IFC', 'LandXML', 'J-LandXML'],
    coverage: '公開は限定的。発注者から受領するケースが主',
    support: 'planned',
    notes: 'IFC → Blender（Bonsai アドオン）→ GLB で BimModelImporter に渡す経路を想定。LandXML の線形は GeoDataImporter で直接読めるよう拡張予定',
  },
]

export function sourcesFor(kind: DataKind): OpenDataSource[] {
  return OPEN_DATA_SOURCES.filter((s) => s.kind.includes(kind))
}
