/**
 * 掛け合い台詞。オリジナルキャラクター（主人公・ライバル・相棒）がレース中のイベントで話す。
 * 実在作品のキャラクター名・台詞は使わない。
 */
export type DialogueEvent =
  | 'race-start'
  | 'first-corner'
  | 'hairpin'
  | 'overtake'
  | 'overtaken'
  | 'checkpoint'
  | 'last-section'
  | 'finish-win'
  | 'finish-lose'
  | 'finish-solo'
  | 'crash'
  | 'high-speed'

export interface Speaker {
  id: string
  name: string
  color: string
  role: 'player' | 'rival' | 'navigator'
}

export const SPEAKERS: Record<string, Speaker> = {
  haruto: { id: 'haruto', name: 'ハルト', color: '#9ad0ff', role: 'player' },
  kenji: { id: 'kenji', name: 'ケンジ', color: '#ffb46a', role: 'rival' },
  misaki: { id: 'misaki', name: 'ミサキ', color: '#c6f08a', role: 'navigator' },
}

export interface DialogueLine {
  speaker: string
  text: string
}

export const DIALOGUE: Record<DialogueEvent, DialogueLine[][]> = {
  'race-start': [
    [
      { speaker: 'kenji', text: 'この峠は俺の庭だ。ついてこれるか？' },
      { speaker: 'haruto', text: '……前は見てるよ。行こう。' },
    ],
    [
      { speaker: 'misaki', text: '最初の 300 m は直線。ブレーキは最初のカーブの手前で一回だけ。' },
      { speaker: 'haruto', text: '了解。' },
    ],
  ],
  'first-corner': [
    [{ speaker: 'misaki', text: '右カーブ、出口で開けていこう。' }],
    [{ speaker: 'kenji', text: 'ほう、進入は悪くない。' }],
  ],
  hairpin: [
    [{ speaker: 'misaki', text: 'ヘアピン！ 奥でサイドを引いて向きを変えて。' }],
    [{ speaker: 'kenji', text: 'ここで差が出る。見てろ。' }],
    [{ speaker: 'haruto', text: '荷重を前に……今だ。' }],
  ],
  overtake: [
    [
      { speaker: 'kenji', text: 'なに！？ どこで抜いた！' },
      { speaker: 'haruto', text: 'インが空いてた。' },
    ],
    [{ speaker: 'misaki', text: '前に出た！ このまま離そう。' }],
  ],
  overtaken: [
    [
      { speaker: 'kenji', text: 'まだまだだな。立ち上がりが遅い。' },
      { speaker: 'haruto', text: '……次のコーナーで取り返す。' },
    ],
    [{ speaker: 'misaki', text: '抜かれた。落ち着いて、ラインを守って。' }],
  ],
  checkpoint: [
    [{ speaker: 'misaki', text: 'チェックポイント通過。ペースはいい。' }],
    [{ speaker: 'misaki', text: 'この先は S 字。リズムで抜けよう。' }],
  ],
  'last-section': [
    [
      { speaker: 'kenji', text: '最後の区間だ。ここからが本番だぞ。' },
      { speaker: 'misaki', text: 'ゴールまであと少し！' },
    ],
  ],
  'finish-win': [
    [
      { speaker: 'kenji', text: '……負けだ。だが次は同じようにはいかない。' },
      { speaker: 'haruto', text: 'いつでも。' },
    ],
  ],
  'finish-lose': [
    [
      { speaker: 'kenji', text: 'いい走りだった。だが峠はまだ俺のものだ。' },
      { speaker: 'misaki', text: '悔しいけど、ラインは見えてきた。もう一回！' },
    ],
  ],
  'finish-solo': [[{ speaker: 'misaki', text: 'ゴール！ タイムを見てみよう。' }]],
  crash: [
    [{ speaker: 'misaki', text: '大丈夫！？ R で復帰できるよ。' }],
    [{ speaker: 'kenji', text: 'おいおい、ガードレールと勝負してどうする。' }],
  ],
  'high-speed': [
    [{ speaker: 'misaki', text: '速すぎ！ 次のコーナーは曲がり切れない！' }],
  ],
}

/** 決定論的に台詞を選ぶ（同じ seed なら同じ組） */
export function pickDialogue(event: DialogueEvent, seed: number): DialogueLine[] {
  const options = DIALOGUE[event]
  return options[Math.abs(seed) % options.length]
}
