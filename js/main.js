/**
 * 起動とモジュール同士の配線。
 * 画面ごとの処理は board / roster / formations / views に置き、
 * ここでは「どれを呼ぶか」だけを決める。
 */
import { state } from './state.js';
import { drawStatic, render, renderBranch, initBoard } from './board.js';
import { buildRoster, fillRoster, initRoster } from './roster.js';
import { setHooks, initStore, pull } from './store.js';
import {
  renderSaved, resetEdit, savePattern, initFormations,
  openFromHash, hashName, restoreAuthor, isReordering,
} from './formations.js';
import { setView, savedView, showLeaveBar, isLeaveBarOpen } from './views.js';

/* 一覧の描き直しと、自動更新を止めたい状況を store に教える */
setHooks({
  onChange: renderSaved,
  isBusy: () => state.editName !== null || state.askDel !== null || isReordering(),
});

/* ---- 保存ボタン ---- */
document.getElementById('saveBtn').addEventListener('click', (ev) => {
  const btn = ev.currentTarget;
  const input = document.getElementById('saveName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  savePattern(name).then((res) => {
    if (res && res.conflict) {
      /* 読んだあとに他の人が保存していた場合。入力は残したままもう一度押してもらう。 */
      showLeaveBar(true, 'ほかの人が先に更新したため保存できませんでした。最新を読み込んだので、もう一度「保存」を押してください');
      btn.textContent = '保存できませんでした';
    } else {
      btn.textContent = '保存しました';
    }
    setTimeout(() => { btn.textContent = '保存'; }, 2200);
  });
});

/* ---- 入力したら「未保存」にする ---- */
document.getElementById('viewEdit').addEventListener('input', (ev) => {
  if (!ev.target.closest('#saveName,#saveAuthor,#saveMemo,#roster')) return;
  state.dirty = true;
  if (isLeaveBarOpen()) showLeaveBar(false);
});

/* ---- タブ（未保存なら移動前に確認）---- */
function goList() {
  showLeaveBar(false);
  resetEdit();
  setView('list');
}

document.getElementById('tabEdit').addEventListener('click', () => setView('edit'));

document.getElementById('tabList').addEventListener('click', () => {
  if (state.dirty) { showLeaveBar(true); return; }
  goList();
});

document.getElementById('leaveStay').addEventListener('click', () => showLeaveBar(false));
document.getElementById('leaveDrop').addEventListener('click', goList);
document.getElementById('leaveSave').addEventListener('click', () => {
  const input = document.getElementById('saveName');
  const name = input.value.trim();
  if (!name) {
    showLeaveBar(true, 'フォーメーション名を入れてから保存してください');
    input.focus();
    return;
  }
  savePattern(name).then((res) => {
    if (res && res.conflict) {
      showLeaveBar(true, 'ほかの人が先に更新したため保存できませんでした。最新を読み込んだので、もう一度「保存して移る」を押してください');
      return;
    }
    goList();
  });
});

document.getElementById('refreshBtn').addEventListener('click', () => pull());

/* ---- 起動画面を閉じる ---- */
const SPLASH_MIN_MS = 600;   // 一瞬で消えてちらつかないよう、最低限は見せる
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => { el.hidden = true; }, 420);
  }, wait);
}

/* ---- 起動 ---- */
buildRoster();
fillRoster();
initRoster();
initBoard();
initFormations();
drawStatic();
render();
renderBranch();
restoreAuthor();

/* リンクで開かれたときは「つくる」から始める */
setView(hashName() ? 'edit' : savedView(), false);

initStore()
  .then(openFromHash)
  .catch(() => {})      /* 読み込みに失敗しても起動画面は必ず閉じる */
  .then(hideSplash);
