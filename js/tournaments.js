/**
 * シーズン大会予定・参加予定メンバー。
 * 大会（名前・日付・場所・メモ）ごとに、メンバーを「参加／未定／不参加」で登録する。
 * 保存先は他のページと同じ Worker（collection: 'events'）。共有していないときはこの端末だけ。
 */
import { KEYS, lsGet, lsSet } from './config.js?v=32';
import { patterns as events, push, pull, initStore, setHooks } from './store.js?v=32';

const STATUS = [['yes', '参加'], ['maybe', '未定'], ['no', '不参加']];
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_EVENTS = 100;

const listEl = document.getElementById('eventList');
const emptyEl = document.getElementById('eventEmpty');
const nameIn = document.getElementById('evName');
const dateIn = document.getElementById('evDate');
const placeIn = document.getElementById('evPlace');
const memoIn = document.getElementById('evMemo');
const addBtn = document.getElementById('evAddBtn');

/* 画面だけの状態：開いているカード、編集中・削除確認中のカード、追加欄にフォーカスを戻すカード */
const ui = { open: new Set(), editId: null, askDel: null, focusAdd: null };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function newId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/* ---- 共有していないとき用：Worker と同じ操作を手元の一覧に当てる ---- */
function localOp(list, body) {
  const out = list.slice();
  const i = out.findIndex((o) => o.id === (body.id || (body.item && body.item.id)));
  switch (body.action) {
    case 'save': if (i >= 0) out[i] = body.item; else out.unshift(body.item); return out.slice(0, MAX_EVENTS);
    case 'delete': return out.filter((o) => o.id !== body.id);
    case 'edit':
      if (i >= 0) out[i] = Object.assign({}, out[i], { name: body.name, date: body.date, place: body.place, memo: body.memo });
      return out;
    case 'member': {
      if (i < 0) return out;
      const members = (out[i].members || []).slice();
      const k = members.findIndex((m) => m.name === body.name);
      if (body.op === 'remove') { if (k >= 0) members.splice(k, 1); }
      else if (k >= 0) members[k] = { name: body.name, status: body.status };
      else members.push({ name: body.name, status: body.status });
      out[i] = Object.assign({}, out[i], { members });
      return out;
    }
    default: return out;
  }
}
function send(body) {
  return push(body, (l) => localOp(l, body));
}

/* ---- 描画 ---- */
function counts(ev) {
  const c = { yes: 0, maybe: 0, no: 0 };
  (ev.members || []).forEach((m) => { if (c[m.status] !== undefined) c[m.status] += 1; });
  return c;
}
function knownNames() {
  const freq = new Map();
  events.forEach((ev) => (ev.members || []).forEach((m) => freq.set(m.name, (freq.get(m.name) || 0) + 1)));
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

function dateBadge(ev) {
  const d = parseDate(ev.date);
  if (!d) return '<span class="edate nodate"><b>日程</b><small>未定</small></span>';
  return '<span class="edate"><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b><small>' + WEEK[d.getDay()] + '</small></span>';
}

function memberRows(ev) {
  const ms = ev.members || [];
  if (!ms.length) return '<p class="mempty">まだ誰も登録されていません。</p>';
  return ms.map((m) =>
    '<div class="mrow st-' + esc(m.status) + '" data-name="' + esc(m.name) + '">' +
      '<span class="mname">' + esc(m.name) + '</span>' +
      '<span class="mseg" role="group" aria-label="' + esc(m.name) + 'の参加状況">' +
        STATUS.map(([k, label]) =>
          '<button type="button" data-set="' + k + '" class="' + (m.status === k ? 'on' : '') + '">' + label + '</button>').join('') +
      '</span>' +
      '<button type="button" class="mdel" data-del-member aria-label="' + esc(m.name) + 'を外す">×</button>' +
    '</div>').join('');
}

function quickChips(ev) {
  const have = new Set((ev.members || []).map((m) => m.name));
  const names = knownNames().filter((n) => !have.has(n)).slice(0, 14);
  if (!names.length) return '';
  return '<div class="qchips"><span class="qlabel">他の大会のメンバーから追加</span>' +
    names.map((n) => '<button type="button" class="qchip" data-quick="' + esc(n) + '">＋' + esc(n) + '</button>').join('') + '</div>';
}

function detailHtml(ev) {
  if (ui.editId === ev.id) {
    return '<div class="edetail">' +
      '<div class="editform">' +
      '<input class="ed-name" type="text" maxlength="40" value="' + esc(ev.name) + '" aria-label="大会名">' +
      '<div class="ed-row"><input class="ed-date" type="date" value="' + esc(ev.date) + '" aria-label="開催日">' +
      '<input class="ed-place" type="text" maxlength="30" value="' + esc(ev.place) + '" placeholder="場所" aria-label="場所"></div>' +
      '<input class="ed-memo" type="text" maxlength="100" value="' + esc(ev.memo) + '" placeholder="メモ" aria-label="メモ">' +
      '<div class="efoot"><button type="button" class="primary" data-save-edit>保存</button>' +
      '<button type="button" class="ghost" data-cancel-edit>やめる</button></div></div></div>';
  }
  const memo = ev.memo ? '<p class="ememo">' + esc(ev.memo) + '</p>' : '';
  const del = ui.askDel === ev.id
    ? '<span class="askdel">この大会を削除しますか？</span><button type="button" class="danger" data-confirm-del>削除する</button><button type="button" class="ghost" data-cancel-del>やめる</button>'
    : '<button type="button" class="ghost" data-edit>編集</button><button type="button" class="ghost" data-del>削除</button>';
  return '<div class="edetail">' + memo +
    '<div class="members">' + memberRows(ev) + '</div>' +
    '<div class="madd"><input class="madd-in" type="text" maxlength="12" autocomplete="off" placeholder="名前を入れて追加" aria-label="メンバー名">' +
    '<button type="button" class="primary" data-add-member>追加</button></div>' +
    quickChips(ev) +
    '<div class="efoot">' + del + '</div></div>';
}

function cardHtml(ev, past) {
  const c = counts(ev);
  const open = ui.open.has(ev.id);
  const summary = c.yes + c.maybe + c.no === 0
    ? '<span class="esum none">未登録</span>'
    : '<span class="esum"><b>参加 ' + c.yes + '</b>' + (c.maybe ? ' ・未定 ' + c.maybe : '') + (c.no ? ' ・不参加 ' + c.no : '') + '</span>';
  return '<article class="ecard' + (open ? ' open' : '') + (past ? ' past' : '') + '" data-id="' + esc(ev.id) + '">' +
    '<button type="button" class="ehead" data-toggle aria-expanded="' + open + '">' +
      dateBadge(ev) +
      '<span class="emain"><span class="etitle">' + esc(ev.name) + '</span>' +
      '<span class="eplace">' + esc(ev.place || '場所未定') + '</span></span>' +
      summary + '<span class="rcaret" aria-hidden="true"></span>' +
    '</button>' +
    (open ? detailHtml(ev) : '') +
  '</article>';
}

function groupLabel(ev) {
  const d = parseDate(ev.date);
  return d ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' : '日程未定';
}

export function render() {
  const today = todayStr();
  const sorted = events.slice().sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  const upcoming = sorted.filter((e) => !e.date || e.date >= today);
  const past = sorted.filter((e) => e.date && e.date < today).reverse();
  let html = '';
  let last = null;
  upcoming.forEach((ev) => {
    const g = groupLabel(ev);
    if (g !== last) {
      if (last !== null) html += '</div>';
      html += '<div class="egroup"><h3 class="egroup-h">' + g + '</h3>';
      last = g;
    }
    html += cardHtml(ev, false);
  });
  if (last !== null) html += '</div>';
  if (past.length) {
    html += '<div class="egroup"><h3 class="egroup-h">終了した大会 <span class="rgroup-n">' + past.length + '</span></h3>' +
      past.map((ev) => cardHtml(ev, true)).join('') + '</div>';
  }
  listEl.innerHTML = html;
  emptyEl.hidden = events.length > 0;
  if (ui.focusAdd) {
    const inp = listEl.querySelector('.ecard[data-id="' + CSS.escape(ui.focusAdd) + '"] .madd-in');
    if (inp) inp.focus();
    ui.focusAdd = null;
  }
}

/* ---- 操作 ---- */
function evOf(el) {
  const card = el.closest('.ecard');
  return card ? events.find((e) => e.id === card.dataset.id) : null;
}

function setMember(ev, name, status) {
  name = name.trim().slice(0, 12);
  if (!name) return Promise.resolve();
  return send({ action: 'member', id: ev.id, op: 'set', name, status });
}

listEl.addEventListener('click', (e) => {
  const t = e.target;
  const ev = evOf(t);
  if (!ev) return;
  if (t.closest('[data-toggle]')) {
    if (ui.open.has(ev.id)) { ui.open.delete(ev.id); ui.editId = null; ui.askDel = null; } else ui.open.add(ev.id);
    render();
    return;
  }
  const row = t.closest('.mrow');
  const setBtn = t.closest('[data-set]');
  if (setBtn && row) { setMember(ev, row.dataset.name, setBtn.dataset.set); return; }
  if (t.closest('[data-del-member]') && row) { send({ action: 'member', id: ev.id, op: 'remove', name: row.dataset.name }); return; }
  const quick = t.closest('[data-quick]');
  if (quick) { setMember(ev, quick.dataset.quick, 'yes'); return; }
  if (t.closest('[data-add-member]')) {
    const inp = t.closest('.ecard').querySelector('.madd-in');
    const v = inp.value;
    if (!v.trim()) { inp.focus(); return; }
    ui.focusAdd = ev.id;
    setMember(ev, v, 'yes').then((res) => { if (res && res.ok === false) ui.focusAdd = null; });
    inp.value = '';
    return;
  }
  if (t.closest('[data-edit]')) { ui.editId = ev.id; ui.askDel = null; render(); return; }
  if (t.closest('[data-cancel-edit]')) { ui.editId = null; render(); return; }
  if (t.closest('[data-save-edit]')) {
    const card = t.closest('.ecard');
    const name = card.querySelector('.ed-name').value.trim();
    if (!name) { card.querySelector('.ed-name').focus(); return; }
    ui.editId = null;
    send({
      action: 'edit', id: ev.id, name,
      date: card.querySelector('.ed-date').value,
      place: card.querySelector('.ed-place').value.trim(),
      memo: card.querySelector('.ed-memo').value.trim(),
    });
    return;
  }
  if (t.closest('[data-del]')) { ui.askDel = ev.id; render(); return; }
  if (t.closest('[data-cancel-del]')) { ui.askDel = null; render(); return; }
  if (t.closest('[data-confirm-del]')) { ui.askDel = null; ui.open.delete(ev.id); send({ action: 'delete', id: ev.id }); }
});

/* メンバー名の入力欄で Enter を押したら追加 */
listEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('madd-in') || e.isComposing) return;
  e.preventDefault();
  const btn = e.target.closest('.madd').querySelector('[data-add-member]');
  if (btn) btn.click();
});

function addEvent() {
  const name = nameIn.value.trim();
  if (!name) { nameIn.focus(); return; }
  const it = {
    id: newId(), name, date: dateIn.value, place: placeIn.value.trim(), memo: memoIn.value.trim(),
    members: [], ts: Date.now(),
  };
  send({ action: 'save', item: it }).then((res) => {
    if (res && res.ok) {
      nameIn.value = ''; dateIn.value = ''; placeIn.value = ''; memoIn.value = '';
      ui.open.add(it.id);
      render();
      addBtn.textContent = '追加しました';
      setTimeout(() => { addBtn.textContent = '追加'; }, 1600);
    } else if (res && res.conflict) {
      addBtn.textContent = 'もう一度「追加」';
      setTimeout(() => { addBtn.textContent = '追加'; }, 1800);
    }
  });
}
addBtn.addEventListener('click', addEvent);
nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) addEvent(); });
document.getElementById('refreshBtn').addEventListener('click', () => pull());

/* ---- 起動 ---- */
setHooks({
  onChange: render,
  /* 入力中・編集中・削除確認中は、自動更新で描き直さない */
  isBusy: () => !!(ui.editId || ui.askDel ||
    (document.activeElement && document.activeElement.closest && document.activeElement.closest('#eventList input'))),
});
initStore({ collection: 'events', localKey: 'yukigassen-events-local', cacheKey: 'yukigassen-events-cache', requireEcho: true })
  .catch(() => {});
