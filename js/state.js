/**
 * 画面がいま何を表示しているかを持つ、ひとつの状態オブジェクト。
 * 各モジュールはこれを読み書きして、描画は board.js の render() に任せる。
 */
import { W, templatePos } from './court.js?v=9';

export const state = {
  /* コート */
  caseKey: 'first',   // 'center' | 'first' | 'double'
  branch: 'full',     // 'full' | 'out1'
  boards: {},         // "<ケース>:<分岐>" → 配置
  pos: null,          // いま表示している配置（boards の中身を指す）
  sel: null,          // 選択中の駒のID
  zoom: 'all',        // 図の表示範囲 'all'（全体） | 'own'（自コート）

  /* フォーメーション */
  names: {},          // メンバー名（A1〜A7, C1, R1〜R3）
  active: null,       // いま読み込んでいるフォーメーション名
  dirty: false,       // 保存していない変更があるか

  /* 一覧のカードの状態 */
  askDel: null,       // 削除確認を出しているカードの番号
  editName: null,     // 編集フォームを開いているカードの番号
  renameErr: false,   // 同名エラーを表示中か
};

export function slotKey(key, branch) {
  return (key || state.caseKey) + ':' + (branch || state.branch);
}

/* そのスロットの配置をなければ作って返す */
export function ensureBoard(key) {
  if (!state.boards[key]) {
    const [caseKey, branch] = key.split(':');
    state.boards[key] = templatePos(caseKey, branch);
  }
  return state.boards[key];
}

/* コート右の待機エリアに出ていればアウト扱い */
export function isOut(id) {
  return state.pos[id].x > W + 0.2;
}

export function markDirty() {
  state.dirty = true;
}

state.pos = ensureBoard(slotKey());
