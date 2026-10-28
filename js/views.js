/**
 * 「つくる」と「保存した一覧」の切り替えと、未保存のときに出す確認帯。
 * ここは表示の出し分けだけを持ち、保存や破棄の判断は main.js が行う。
 */
import { KEYS, lsSet, lsGet } from './config.js?v=9';

const viewEdit = document.getElementById('viewEdit');
const viewList = document.getElementById('viewList');
const tabEdit = document.getElementById('tabEdit');
const tabList = document.getElementById('tabList');
const leaveBar = document.getElementById('leaveBar');

const DEFAULT_LEAVE_MSG = '保存されていません。一覧に移ると入力中の内容は消えます';

export function setView(name, remember) {
  const list = name === 'list';
  viewEdit.hidden = list;
  viewList.hidden = !list;
  tabEdit.classList.toggle('on', !list);
  tabList.classList.toggle('on', list);
  if (remember !== false) lsSet(KEYS.view, name);
  if (!list) window.scrollTo(0, 0);
}

export function savedView() {
  return lsGet(KEYS.view, 'edit') === 'list' ? 'list' : 'edit';
}

export function showLeaveBar(on, msg) {
  leaveBar.hidden = !on;
  document.getElementById('leaveMsg').textContent = msg || DEFAULT_LEAVE_MSG;
  if (on && leaveBar.scrollIntoView) leaveBar.scrollIntoView({ block: 'nearest' });
}

export function isLeaveBarOpen() {
  return !leaveBar.hidden;
}

export function setTabCount(n) {
  document.getElementById('tabCount').textContent = n ? String(n) : '';
}
