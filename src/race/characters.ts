/**
 * キャラクター定義と口調別の台詞テンプレート。
 * 実在作品のキャラクター名・台詞は使わず、口調タイプ（personality）ごとにオリジナルの台詞を持つ。
 * {player} / {rival} / {car} / {rivalCar} などのプレースホルダを実行時に置き換える。
 */
export type Personality = 'hot' | 'cool' | 'veteran' | 'joker' | 'navigator'

export interface Character {
  id: string
  name: string
  personality: Personality
  /** 名前の表示色 */
  color: string
  /** アバター: 髪色・肌色・アクセント（簡易 SVG 似顔絵用） */
  avatar: { hair: string; skin: string; accent: string; style: 'short' | 'long' | 'cap' | 'spiky' }
  /** 一言プロフィール */
  bio: string
}

export interface RivalEntry {
  id: string
  characterId: string
  carId: string
  skill: 'easy' | 'normal' | 'hard'
  enabled: boolean
}

export const PERSONALITY_LABELS: Record<Personality, string> = {
  hot: '熱血',
  cool: 'クール',
  veteran: 'ベテラン',
  joker: 'お調子者',
  navigator: 'ナビ（相棒）',
}

export const DEFAULT_CHARACTERS: Character[] = [
  { id: 'haruto', name: 'ハルト', personality: 'cool', color: '#9ad0ff', avatar: { hair: '#2b2b33', skin: '#f1d2b6', accent: '#9ad0ff', style: 'short' }, bio: '豆腐屋の配達で峠を覚えた無口な走り屋。' },
  { id: 'misaki', name: 'ミサキ', personality: 'navigator', color: '#c6f08a', avatar: { hair: '#5a3a2a', skin: '#f3d9c4', accent: '#c6f08a', style: 'long' }, bio: '助手席のナビ役。コースを誰より研究している。' },
  { id: 'kenji', name: 'ケンジ', personality: 'hot', color: '#ffb46a', avatar: { hair: '#1a1a1a', skin: '#e8c4a0', accent: '#ffb46a', style: 'spiky' }, bio: '地元チームのエース。黒い GT で直線番長。' },
  { id: 'rin', name: 'リン', personality: 'cool', color: '#f08ad0', avatar: { hair: '#6a2a8a', skin: '#f3d9c4', accent: '#f08ad0', style: 'long' }, bio: '黄色いロータリーを操る理論派。ブレーキングで差を作る。' },
  { id: 'gonta', name: 'ゴンタ', personality: 'joker', color: '#ffe06a', avatar: { hair: '#8a5a2a', skin: '#e8c4a0', accent: '#ffe06a', style: 'cap' }, bio: '口は達者だがハンドルも達者。パンダ車で追い回す。' },
  { id: 'shiro', name: 'シロウ', personality: 'veteran', color: '#c0c8d0', avatar: { hair: '#9a9a9a', skin: '#e8c4a0', accent: '#c0c8d0', style: 'short' }, bio: 'かつての峠の王者。無駄のないラインで若手を黙らせる。' },
]

export const DEFAULT_RIVALS: RivalEntry[] = [
  { id: 'r1', characterId: 'kenji', carId: 'black-gt', skill: 'normal', enabled: true },
  { id: 'r2', characterId: 'rin', carId: 'yellow-rotary', skill: 'normal', enabled: true },
  { id: 'r3', characterId: 'gonta', carId: 'panda-hatch', skill: 'easy', enabled: false },
  { id: 'r4', characterId: 'shiro', carId: 'red-coupe', skill: 'hard', enabled: false },
]

export type BanterEvent =
  | 'pre-race'
  | 'race-start'
  | 'close-behind' // ライバルがプレイヤーのすぐ後ろ
  | 'close-ahead' // ライバルがプレイヤーのすぐ前
  | 'overtake' // プレイヤーがそのライバルを抜いた
  | 'overtaken' // そのライバルに抜かれた
  | 'hairpin'
  | 'checkpoint'
  | 'last-section'
  | 'crash'
  | 'finish-win'
  | 'finish-lose'
  | 'post-race-win'
  | 'post-race-lose'

/** 口調別テンプレート。{player}=プレイヤー名, {rival}=話者（ライバル）名, {other}=相手名 */
const T: Record<Personality, Partial<Record<BanterEvent, string[]>>> = {
  hot: {
    'pre-race': ['{player}！ 今日こそ決着をつけるぞ！', 'この峠は俺の庭だ。ついてこれるか？'],
    'race-start': ['行くぞ！ 置いていくからな！'],
    'close-behind': ['後ろにいるぞ、{player}！ ミスしたら貰う！', 'まだまだ！ 離れねえぞ！'],
    'close-ahead': ['ほら、ここが俺のライン！ 真似できるか！'],
    overtaken: ['なにっ！？ どこで抜いた！', 'くそっ、次のコーナーで返す！'],
    overtake: ['まだまだだな！ 立ち上がりが遅い！'],
    hairpin: ['ヘアピンだ！ ここで差が出るぞ！'],
    'last-section': ['最後の区間だ！ ここからが本番だぞ！'],
    'finish-lose': ['……負けだ。だが次は同じようにはいかない！'],
    'finish-win': ['よっしゃあ！ 峠はまだ俺のもんだ！'],
    'post-race-win': ['見たか！ 直線で勝負が決まるんだよ！'],
    'post-race-lose': ['認めるよ、{player}。でもな、次は俺が勝つ。'],
    crash: ['おいおい、ガードレールと勝負してどうする！'],
  },
  cool: {
    'pre-race': ['……前は見ている。始めよう。', '走れば分かる。'],
    'race-start': ['……行く。'],
    'close-behind': ['ラインが見えた。', '……そこか。'],
    'close-ahead': ['ついてこられるか。'],
    overtaken: ['……やるな。', 'いい進入だ。'],
    overtake: ['……そこじゃない。'],
    hairpin: ['荷重を前に……今だ。'],
    'last-section': ['あと少し。崩さない。'],
    'finish-lose': ['……負けた。理由は分かっている。'],
    'finish-win': ['……届いた。'],
    'post-race-win': ['{player}、ブレーキを 1 m 遅らせてみろ。', '……悪くなかった。'],
    'post-race-lose': ['{player}。次は、もう少し長く走ろう。'],
    crash: ['……落ち着け。R で戻れる。'],
  },
  veteran: {
    'pre-race': ['若いの、無理はするな。峠は逃げん。', '一本だけ付き合ってやる。'],
    'race-start': ['さて、見せてもらおうか。'],
    'close-behind': ['焦るな、{player}。ラインはひとつじゃない。', 'そこで踏むのはまだ早い。'],
    'close-ahead': ['こうやって曲がるんだ。よく見ておけ。'],
    overtaken: ['ほう。若いのも捨てたもんじゃない。'],
    overtake: ['出口で待っていた。それだけだ。'],
    hairpin: ['奥まで我慢して、一気に向きを変えろ。'],
    'last-section': ['仕上げだ。雑になるな。'],
    'finish-lose': ['……年には勝てんな。いや、お前が速かった。'],
    'finish-win': ['まだ負けんよ。'],
    'post-race-win': ['ブレーキを信じろ。それだけで 1 秒縮む。'],
    'post-race-lose': ['{player}、お前の走りは本物だ。胸を張れ。'],
    crash: ['慌てるな。壊れたのは車じゃなく集中だ。'],
  },
  joker: {
    'pre-race': ['よっ {player}！ 負けたらジュース 1 本な！', 'オレの{rivalCar}、今日は調子いいぜ〜'],
    'race-start': ['いただきまーす！'],
    'close-behind': ['おーい、道あけてくれよ〜', 'ケツに付いたぜ！ ミスんなよ？'],
    'close-ahead': ['バイバーイ！', 'オレの背中、よく見とけよ？'],
    overtaken: ['えっ、ちょ、待って！？', 'うそーん！'],
    overtake: ['はい、いただきっ！'],
    hairpin: ['ヘアピン！ サイド引くぜ〜！'],
    'last-section': ['ラスト！ ジュースが見えてきた！'],
    'finish-lose': ['まいった！ ジュース奢るよ……'],
    'finish-win': ['よっしゃ！ ジュースごちそうさま！'],
    'post-race-win': ['オレの勝ちー！ 次はコーヒーな！'],
    'post-race-lose': ['くっそー、速すぎだろ {player}。もう一本！'],
    crash: ['あちゃー。R だよ R！'],
  },
  navigator: {
    'pre-race': ['{player}、最初の 300 m は直線。ブレーキは最初のカーブの手前で一回だけ。', 'コースは頭に入ってる。任せて。'],
    'race-start': ['スタート！ 落ち着いて。'],
    'close-behind': ['{other}が後ろ！ ラインを守って。'],
    'close-ahead': ['{other}のすぐ後ろ。立ち上がりで並ぼう。'],
    overtaken: ['抜かれた。落ち着いて、取り返せる。'],
    overtake: ['前に出た！ このまま離そう。'],
    hairpin: ['ヘアピン！ 奥でサイドを引いて向きを変えて。'],
    checkpoint: ['チェックポイント通過。ペースはいい。', 'この先は S 字。リズムで抜けよう。'],
    'last-section': ['ゴールまであと少し！'],
    'finish-win': ['やった！ 勝った！'],
    'finish-lose': ['悔しいけど、ラインは見えてきた。もう一回！'],
    'post-race-win': ['タイム見た？ 自己ベストだよ。'],
    'post-race-lose': ['2 つ目のヘアピン、ブレーキが早かった。次はもう少し奥まで。'],
    crash: ['大丈夫！？ R で復帰できるよ。'],
  },
}

export interface BanterContext {
  player: string
  rival?: string
  rivalCar?: string
  other?: string
}

export function fillTemplate(text: string, ctx: BanterContext): string {
  return text
    .replace(/\{player\}/g, ctx.player)
    .replace(/\{rival\}/g, ctx.rival ?? '')
    .replace(/\{rivalCar\}/g, ctx.rivalCar ?? '')
    .replace(/\{other\}/g, ctx.other ?? '')
}

/** 口調とイベントから台詞を 1 つ選ぶ（seed で決定論的）。無ければ undefined */
export function banterLine(personality: Personality, event: BanterEvent, ctx: BanterContext, seed: number): string | undefined {
  const list = T[personality][event]
  if (!list || list.length === 0) return undefined
  return fillTemplate(list[Math.abs(seed) % list.length], ctx)
}

export function getCharacter(list: Character[], id: string): Character {
  return list.find((c) => c.id === id) ?? list[0]
}
