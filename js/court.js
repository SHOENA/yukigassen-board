/**
 * コートの寸法と、ケースごとの初期配置（テンプレート）。
 * 単位はメートル。x は横 0〜10、y は縦 0〜36 で、自陣が下（y が大きい側）。
 * 寸法は国際雪合戦連合の競技規則にもとづく。
 */

export const W = 10;          // コート幅
export const L = 36;          // コート長
export const CENTER = 18;     // センターライン
export const BACK_OURS = 28;  // 自陣バックライン（エンドラインから8m）
export const BACK_OPP = 8;    // 相手バックライン

/* シェルターとシャトー（センターシェルターだけ180cm、他は90cm） */
export const SHELTERS = [
  { x: 5, y: 18, w: 1.8, h: 0.45, k: 'center' },
  { x: 2.45, y: 23, w: 0.9, h: 0.45 },
  { x: 7.55, y: 26, w: 0.9, h: 0.45 },
  { x: 5, y: 30, w: 0.9, h: 0.45, k: 'chateau' },
  { x: 7.55, y: 13, w: 0.9, h: 0.45 },
  { x: 2.45, y: 10, w: 0.9, h: 0.45 },
  { x: 5, y: 6, w: 0.9, h: 0.45, k: 'chateau' },
];

export const FLAGS = [{ x: 5, y: 27 }, { x: 5, y: 9 }];

/* コート外のエリア（監督・アウト選手・リザーブ） */
export const COACH = { x0: -2.1, x1: -0.45, y0: 18.6, y1: 35.4 };
export const OUT_A = { x0: 10.45, x1: 12.1, y0: 18.8, y1: 35.4 };
export const OUT_B = { x0: 10.45, x1: 12.1, y0: 0.6, y1: 17.2 };
export const RES_A = { x0: -3.85, x1: -2.2, y0: 18.8, y1: 35.4 };

/* コート上に置く駒。A=自チーム、B=相手チーム、C1=監督。
   リザーブ（R1〜R3）は名前だけなのでここには入れない。 */
export const IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
  'C1',
];

/* メンバー欄の並び */
export const ROSTER = [
  ['A1', 'FW'], ['A2', 'FW'], ['A3', 'FW'], ['A4', 'FW'],
  ['A5', 'BK'], ['A6', 'BK'], ['A7', 'BK'],
  ['C1', '監督'],
  ['R1', 'リザーブ'], ['R2', 'リザーブ'], ['R3', 'リザーブ'],
];

/* ケース（場面）と分岐。boards のキーは "<ケース>:<分岐>" の形。 */
export const CASE_KEYS = ['center', 'first', 'double'];
export const BRANCHES = ['full', 'out1'];

/* 各ケースの初期配置。a が自チーム①〜⑦、b が相手①〜⑦。
   vars は「初手で①が落ちた場合」の組み直し。 */
export const PRESETS = {
  first: {
    label: 'ケースB 1シェル止まり',
    a: [[2.45, 23.6], [4.6, 27.4], [7.55, 26.7], [9.2, 26.6], [0.9, 27.4], [5.8, 30.8], [4.2, 30.8]],
    b: [[5, 17.05], [7.55, 12.4], [1.6, 13.4], [2.45, 9.3], [9.1, 11.6], [5.8, 5.2], [4.2, 5.2]],
    vars: [{
      label: '①落ち',
      note: '②が第1に入り、③は第2のまま',
      a: [[11.3, 20.4], [2.45, 23.6], [7.55, 26.7], [9.2, 26.6], [0.9, 27.4], [5.8, 30.8], [4.2, 30.8]],
    }],
  },
  center: {
    label: 'ケースA センター取り',
    a: [[5, 18.95], [2.45, 23.6], [7.55, 26.7], [9.2, 22.4], [0.9, 24.4], [5.8, 30.8], [4.2, 30.8]],
    b: [[7.55, 12.4], [5.6, 8.6], [3.6, 8.6], [2.45, 9.3], [9.1, 8.6], [5.8, 5.2], [4.2, 5.2]],
    vars: [{
      label: '①落ち',
      note: '②がセンターに入り、③が第1、⑥が第2に上がる',
      a: [[11.3, 20.4], [5, 18.95], [2.45, 23.6], [9.2, 22.4], [0.9, 24.4], [7.55, 26.7], [5, 30.8]],
    }],
  },
  double: {
    label: 'ケースC センター2枚取り',
    a: [[4.3, 18.95], [5.7, 18.95], [2.45, 23.6], [9.2, 21.6], [0.9, 24.4], [7.55, 26.7], [5, 30.8]],
    b: [[7.55, 12.4], [5.6, 8.6], [3.6, 8.6], [2.45, 9.3], [9.1, 8.6], [5.8, 5.2], [4.2, 5.2]],
    vars: [{
      label: '①落ち',
      note: '②が1枚でセンターを持ち、③が第1、⑥が第2に上がる',
      a: [[11.3, 20.4], [5, 18.95], [2.45, 23.6], [9.2, 22.4], [0.9, 24.4], [7.55, 26.7], [5, 30.8]],
    }],
  },
};

export function team(id) {
  return id.charAt(0);
}

export function isFW(id) {
  return +id.charAt(1) <= 4;
}

export function outZone(id) {
  return team(id) === 'B' ? OUT_B : OUT_A;
}

/* ケースと分岐から初期配置を作る */
export function templatePos(key, branch) {
  const preset = PRESETS[key];
  const a = (branch === 'out1' && preset.vars && preset.vars[0]) ? preset.vars[0].a : preset.a;
  const pos = {};
  a.forEach((c, i) => { pos['A' + (i + 1)] = { x: c[0], y: c[1] }; });
  preset.b.forEach((c, i) => { pos['B' + (i + 1)] = { x: c[0], y: c[1] }; });
  pos.C1 = { x: -1.25, y: 25 };
  return pos;
}

/* 配置の複製。欠けている駒は無難な位置で埋める。 */
export function clonePos(src) {
  const out = {};
  IDS.forEach((id) => {
    const p = (src && src[id]) || (id === 'C1' ? { x: -1.25, y: 25 } : { x: 5, y: 27.6 });
    out[id] = { x: p.x, y: p.y };
  });
  return out;
}

/* ケース×分岐の全スロット（6通り） */
export function allSlots() {
  const out = [];
  CASE_KEYS.forEach((c) => BRANCHES.forEach((v) => out.push(c + ':' + v)));
  return out;
}
