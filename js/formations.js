/**
 * 保存したフォーメーションの一覧（カード）と、保存・読み込み・編集・削除・並び替え・リンク。
 * ひとつのフォーメーションに、ケース×分岐の6通りの配置とメンバー名・メモが入る。
 */
import { KEYS, lsSet, lsGet } from './config.js?v=9';
import { W, L, SHELTERS, ROSTER, allSlots, clonePos } from './court.js?v=9';
import { state, slotKey, ensureBoard } from './state.js?v=9';
import { render, renderBranch, esc } from './board.js?v=9';
import { fillRoster } from './roster.js?v=9';
import { patterns, push } from './store.js?v=9';
import { setView, setTabCount } from './views.js?v=9';

const list = document.getElementById('patternList');
const nameInput = document.getElementById('saveName');
const authorInput = document.getElementById('saveAuthor');
const memoInput = document.getElementById('saveMemo');

/* ---- 日付 ---- */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function today() {
  const d = new Date();
  return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
}

/* 古い形式（年なし・2桁年）で保存されたものも同じ書式で見せる */
function fmtDate(it) {
  if (it.ts) {
    const d = new Date(it.ts);
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
  }
  const s = String(it.date || '').replace(/\s/g, '');
  let m = s.match(/^(\d{2}|\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return (m[1].length === 2 ? '20' + m[1] : m[1]) + '/' + pad2(+m[2]) + '/' + pad2(+m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date().getFullYear() + '/' + pad2(+m[1]) + '/' + pad2(+m[2]);
  return esc(s);
}

/* ---- カードのミニコート（横向き）---- */
function thumbPos(it) {
  if (it.boards) {
    const keys = ['first:full', 'center:full', 'double:full'].concat(allSlots());
    for (const k of keys) if (it.boards[k]) return it.boards[k];
  }
  return it.pos || {};
}

function thumb(pos) {
  const o = ['<svg class="thumb" viewBox="0 0 36 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'];
  o.push('<line x1="18" y1="0" x2="18" y2="10" stroke="var(--snow-edge)" stroke-width="0.25"/>');
  SHELTERS.forEach((s) => {
    o.push('<rect x="' + (L - s.y - s.h / 2) + '" y="' + (s.x - s.w / 2) +
      '" width="' + s.h + '" height="' + s.w + '" fill="var(--shelter)"/>');
  });
  ['A', 'B'].forEach((t) => {
    for (let i = 1; i <= 7; i++) {
      const p = pos[t + i];
      if (!p) continue;
      const out = p.x > W + 0.2;
      const fw = i <= 4;
      const color = t === 'A'
        ? (fw ? 'var(--blue-fw)' : 'var(--blue-bk)')
        : (fw ? 'var(--red-fw)' : 'var(--red-bk)');
      o.push('<circle cx="' + (L - p.y) + '" cy="' + Math.min(9.6, Math.max(0.4, p.x)) +
        '" r="0.78" fill="' + color + '" fill-opacity="' + (out ? 0.18 : 1) + '"/>');
    }
  });
  return o.join('') + '</svg>';
}

/* ---- 一覧の描画 ---- */
export function renderSaved() {
  document.getElementById('savedEmpty').hidden = patterns.length > 0;
  setTabCount(patterns.length);

  list.innerHTML = patterns.map((it, i) => {
    const nm = esc(it.name);
    const on = state.active === it.name;
    const asking = state.askDel === i;
    const editing = state.editName === i;
    const who = esc((it.author || '').trim());
    const meta = (who ? '作成者：' + who + ' ・ ' : '') +
      (it.updated ? '更新日：' : '作成日：') + fmtDate(it);
    const memo = esc(it.memo || '');

    const foot = editing
      ? '<div class="editform">' +
        '<input class="rename' + (state.renameErr ? ' bad' : '') + '" type="text" maxlength="30" value="' + nm + '" aria-label="フォーメーション名">' +
        '<input class="reauthor" type="text" maxlength="12" value="' + who + '" placeholder="作成者" aria-label="作成者">' +
        '<textarea class="rememo" rows="3" maxlength="300" placeholder="メモ（任意）" aria-label="メモ">' + memo + '</textarea>' +
        '<div class="editbtns"><button class="primary" data-save-edit="' + i + '">保存</button>' +
        '<button class="ghost" data-cancel="1">やめる</button>' +
        (state.renameErr ? '<span class="ask">同じ名前があります</span>' : '') + '</div></div>'
      : '<button class="grip" data-grip="1" aria-label="' + nm + ' を並び替え" title="ドラッグで並び替え（↑↓キーでも可）">≡</button>' +
        (on ? '<span class="badge">表示中</span>' : '') + '<span class="spacer"></span>' +
        (asking
          ? '<span class="ask">削除しますか？</span><button class="danger" data-del="' + i + '">削除する</button><button class="ghost" data-cancel="1">やめる</button>'
          : '<button class="ghost" data-link="' + i + '">リンクをコピー</button>' +
            '<button class="ghost" data-edit="' + i + '">編集</button><button class="ghost" data-ask="' + i + '">削除</button>');

    return '<article class="pcard' + (on ? ' on' : '') + '" data-key="' + nm + '">' +
      '<button class="pcard-main" data-load="' + i + '">' + thumb(thumbPos(it)) +
      '<span class="pbody"><span class="pname">' + nm + '</span><span class="pmeta">' + meta + '</span></span></button>' +
      (memo && !editing ? '<p class="pmemo">' + memo + '</p>' : '') +
      '<div class="pfoot">' + foot + '</div></article>';
  }).join('');
}

/* ---- 保存・読み込み ---- */
function makePattern(name, dup) {
  const boards = {};
  allSlots().forEach((k) => { boards[k] = clonePos(ensureBoard(k)); });
  return {
    name,
    ts: Date.now(),
    date: today(),
    memo: (memoInput.value || '').trim(),
    author: (authorInput.value || '').trim(),
    names: JSON.parse(JSON.stringify(state.names)),
    boards,
    /* 古い版や他の画面がミニ図に使うための1面分 */
    pos: clonePos(state.boards['center:full'] || state.pos),
    updated: !!dup,
  };
}

export function savePattern(name) {
  lsSet(KEYS.author, (authorInput.value || '').trim());
  const dup = patterns.some((it) => it.name === name);
  const p = makePattern(name, dup);
  state.askDel = null;
  state.editName = null;
  return push({ action: 'save', pattern: p }, (l) => {
    const i = l.findIndex((it) => it.name === name);
    if (i >= 0) l[i] = p; else l.unshift(p);
    return l.slice(0, 100);
  }).then((res) => {
    /* 保存できたときだけ「保存済み」にする。弾かれたら編集内容は残す。 */
    if (res && res.ok) {
      state.active = name;
      state.dirty = false;
      renderSaved();
    }
    return res;
  });
}

function deletePattern(name) {
  if (state.active === name) state.active = null;
  state.askDel = null;
  state.editName = null;
  return push({ action: 'delete', name }, (l) => l.filter((it) => it.name !== name));
}

function editPattern(from, to, memo, author) {
  if (state.active === from) {
    state.active = to;
    memoInput.value = memo;
  }
  if (nameInput.value.trim() === from) nameInput.value = to;
  state.editName = null;
  state.renameErr = false;
  return push({ action: 'edit', from, to, memo, author }, (l) => {
    l.forEach((it) => {
      if (it.name === from) { it.name = to; it.memo = memo; it.author = author; }
    });
    return l;
  });
}

function orderPatterns(names) {
  return push({ action: 'order', names }, (l) => {
    const out = [];
    const used = [];
    names.forEach((n) => {
      for (let i = 0; i < l.length; i++) {
        if (used.indexOf(i) < 0 && esc(l[i].name) === n) { out.push(l[i]); used.push(i); break; }
      }
    });
    l.forEach((it, i) => { if (used.indexOf(i) < 0) out.push(it); });
    return out;
  });
}

/* 保存されている6通りの配置を取り出す（古い形式は1面だけ） */
function boardsOf(it) {
  const out = {};
  if (it.boards && typeof it.boards === 'object') {
    allSlots().forEach((k) => { if (it.boards[k]) out[k] = clonePos(it.boards[k]); });
  } else if (it.pos) {
    out['center:full'] = clonePos(it.pos);
  }
  return out;
}

export function loadPattern(it) {
  if (!it) return;
  state.boards = boardsOf(it);
  state.pos = ensureBoard(slotKey());

  /* メンバー名はチームで1組のものなので、そのフォーメーションに入っていない欄は今の内容を残す */
  const src = it.names || {};
  ROSTER.forEach(([id]) => {
    if ((src[id] || '').trim()) state.names[id] = src[id];
  });
  fillRoster();

  state.sel = null;
  state.active = it.name;
  state.askDel = null;
  state.editName = null;
  state.dirty = false;
  nameInput.value = it.name;
  memoInput.value = it.memo || '';
  render();
  renderBranch();
  renderSaved();
}

/* 「つくる」を初期状態に戻す */
export function resetEdit() {
  nameInput.value = '';
  memoInput.value = '';
  state.names = {};
  fillRoster();
  state.boards = {};
  state.caseKey = 'first';
  state.branch = 'full';
  state.pos = ensureBoard(slotKey());
  state.sel = null;
  state.active = null;
  state.dirty = false;
  render();
  renderBranch();
  renderSaved();
}

export function restoreAuthor() {
  authorInput.value = lsGet(KEYS.author, '');
}

/* ---- カード内の編集フォーム ---- */
function commitEdit(i) {
  const card = list.children[i];
  if (!card) return;
  const nameEl = card.querySelector('.rename');
  const memoEl = card.querySelector('.rememo');
  const authorEl = card.querySelector('.reauthor');
  if (!nameEl || !memoEl || !authorEl) return;

  const name = nameEl.value.trim();
  const memo = memoEl.value.trim();
  const author = authorEl.value.trim();
  const old = patterns[i];
  if (!name || !old) { nameEl.focus(); return; }

  if (name !== old.name && patterns.some((it, j) => j !== i && it.name === name)) {
    state.renameErr = true;
    renderSaved();
    const again = list.children[i].querySelector('.rename');
    if (again) again.focus();
    return;
  }
  if (name === old.name && memo === (old.memo || '') && author === (old.author || '')) {
    state.editName = null;
    state.renameErr = false;
    renderSaved();
    return;
  }
  editPattern(old.name, name, memo, author);
}

/* ---- リンク ---- */
function patternLink(name) {
  return location.origin + location.pathname + '#p=' + encodeURIComponent(name);
}

function copyLink(btn, name) {
  const url = patternLink(name);
  const box = document.getElementById('linkBox');
  const manual = () => { box.hidden = false; box.value = url; box.focus(); box.select(); };
  const done = () => {
    box.hidden = true;
    btn.textContent = 'コピーしました';
    setTimeout(() => { if (btn.parentNode) btn.textContent = 'リンクをコピー'; }, 1600);
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, manual);
    } else {
      manual();
    }
  } catch (e) {
    manual();
  }
}

export function hashName() {
  const m = /^#p=(.+)$/.exec(location.hash || '');
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
}

export function openFromHash() {
  const n = hashName();
  if (!n) return;
  const it = patterns.find((p) => p.name === n);
  if (it) loadPattern(it);
}

/* ---- 並び替え（≡ のドラッグ）---- */
let reorder = null;

export function isReordering() {
  return !!reorder;
}

function persistOrder() {
  orderPatterns([...list.children].map((c) => c.dataset.key));
}

/* ドラッグ中のカードの中心が、どの隣のカードの中心を越えたかを見る */
function swapTarget(card) {
  const r = card.getBoundingClientRect();
  const mid = r.top + r.height / 2;
  for (const c of list.children) {
    if (c === card) continue;
    const cr = c.getBoundingClientRect();
    const cm = cr.top + cr.height / 2;
    const follows = !!(card.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (follows && mid > cm) return { node: c, after: true };
    if (!follows && mid < cm) return { node: c, after: false };
  }
  return null;
}

function endReorder() {
  if (!reorder) return;
  reorder.card.style.transform = '';
  reorder.card.classList.remove('dragging');
  reorder = null;
  persistOrder();
}

/* ---- イベント配線 ---- */
export function initFormations() {
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.load !== undefined) {
      loadPattern(patterns[+b.dataset.load]);
      setView('edit');
    } else if (b.dataset.link !== undefined) {
      const p = patterns[+b.dataset.link];
      if (p) copyLink(b, p.name);
    } else if (b.dataset.ask !== undefined) {
      state.askDel = +b.dataset.ask;
      state.editName = null;
      renderSaved();
    } else if (b.dataset.edit !== undefined) {
      state.editName = +b.dataset.edit;
      state.askDel = null;
      state.renameErr = false;
      renderSaved();
      const inp = list.querySelector('.rename');
      if (inp) { inp.focus(); inp.select(); }
    } else if (b.dataset.saveEdit !== undefined) {
      commitEdit(+b.dataset.saveEdit);
    } else if (b.dataset.cancel !== undefined) {
      state.askDel = null;
      state.editName = null;
      state.renameErr = false;
      renderSaved();
    } else if (b.dataset.del !== undefined) {
      const gone = patterns[+b.dataset.del];
      if (gone) deletePattern(gone.name);
    }
  });

  list.addEventListener('keydown', (ev) => {
    if (ev.target.closest('.editform')) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        state.editName = null;
        state.renameErr = false;
        renderSaved();
      } else if (ev.key === 'Enter' && (ev.target.classList.contains('rename') || ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        commitEdit(state.editName);
      }
      return;
    }
    const g = ev.target.closest('[data-grip]');
    if (!g) return;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    const card = g.closest('.pcard');
    const key = card.dataset.key;
    if (ev.key === 'ArrowUp' && card.previousElementSibling) {
      list.insertBefore(card, card.previousElementSibling);
    } else if (ev.key === 'ArrowDown' && card.nextElementSibling) {
      list.insertBefore(card.nextElementSibling, card);
    } else {
      return;
    }
    persistOrder();
    const again = list.querySelector('.pcard[data-key="' + key + '"] [data-grip]');
    if (again) again.focus();
  });

  list.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest('[data-grip]');
    if (!g) return;
    ev.preventDefault();
    reorder = { card: g.closest('.pcard'), baseY: ev.clientY };
    reorder.card.classList.add('dragging');
    list.setPointerCapture(ev.pointerId);
  });

  list.addEventListener('pointermove', (ev) => {
    if (!reorder) return;
    const card = reorder.card;
    card.style.transform = 'translateY(' + (ev.clientY - reorder.baseY) + 'px)';
    const t = swapTarget(card);
    if (t) {
      list.insertBefore(card, t.after ? t.node.nextSibling : t.node);
      reorder.baseY = ev.clientY;
      card.style.transform = '';
    }
  });

  list.addEventListener('pointerup', endReorder);
  list.addEventListener('pointercancel', endReorder);

  window.addEventListener('hashchange', openFromHash);
}
