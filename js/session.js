/**
 * ページ移動（決め事 ⇄ フォーメーション）で作業中の画面が初期状態に戻らないよう、
 * 作りかけの内容をこのタブの sessionStorage に預けて、戻ったときに復元する。
 * 預けるのは：ケース／分岐、各配置、メンバー名、名前・メモの入力、表示範囲、読み込み中のフォーメーション名。
 */
import { state, ensureBoard, slotKey } from './state.js?v=33';

const KEY = 'sbf-edit-session';
const nameEl = () => document.getElementById('saveName');
const memoEl = () => document.getElementById('saveMemo');

export function saveSession() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      caseKey: state.caseKey, branch: state.branch, boards: state.boards,
      names: state.names, active: state.active, dirty: state.dirty, zoom: state.zoom,
      saveName: nameEl() ? nameEl().value : '', saveMemo: memoEl() ? memoEl().value : '',
    }));
  } catch (e) { /* 保存できなくても動作には影響しない */ }
}

/* DOM を組み立てる前に呼ぶ。復元できたら true。 */
export function restoreSession() {
  let s;
  try { s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !s.boards) return false;
  state.caseKey = s.caseKey || 'first';
  state.branch = s.branch || 'full';
  state.boards = s.boards;
  state.names = s.names || {};
  state.active = s.active || null;
  state.dirty = !!s.dirty;
  if (s.zoom) state.zoom = s.zoom;
  state.pos = ensureBoard(slotKey());
  state.pendingInputs = { saveName: s.saveName || '', saveMemo: s.saveMemo || '' };
  return true;
}

/* DOM ができたあとに入力欄へ戻す */
export function restoreInputs() {
  const p = state.pendingInputs;
  if (!p) return;
  if (nameEl()) nameEl().value = p.saveName;
  if (memoEl()) memoEl().value = p.saveMemo;
  state.pendingInputs = null;
}

export function initSession() {
  window.addEventListener('pagehide', saveSession);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
  document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', saveSession));
}
