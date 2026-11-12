/**
 * 決め事ページ。チームの申し合わせをカテゴリごとに貯めておく。
 * 1件 = { id, title, category, body, author, ts, date, updatedTs, pinned }
 * 保存先は store.js（フォーメーションと同じ Worker の rules コレクション）。
 * このファイルだけで、追加フォーム・一覧・編集・削除・並び替え・リンクを賄う。
 */
import { KEYS, lsGet, lsSet } from './config.js?v=29';
import { patterns as rules, push, pull, initStore, setHooks } from './store.js?v=29';

/* カテゴリの並びと表示名。並びはこの順に固定。 */
const CATS = [
  ['attack',   '攻撃'],
  ['defense',  '守備'],
  ['signal',   '声かけ・合図'],
  ['practice', '練習'],
  ['gameday',  '試合当日'],
  ['other',    'その他'],
];
const CAT_LABEL = {};
CATS.forEach(([k, label]) => { CAT_LABEL[k] = label; });
function catOf(r) { return CAT_LABEL[r.category] ? r.category : 'other'; }

const listEl = document.getElementById('rulesList');
const emptyEl = document.getElementById('rulesEmpty');
const titleInput = document.getElementById('ruleTitle');
const catSelect = document.getElementById('ruleCat');
const authorInput = document.getElementById('ruleAuthor');
const ruleEditor = document.getElementById('ruleEditor');
const pinInput = document.getElementById('rulePin');
const addBtn = document.getElementById('addBtn');
const controlsEl = document.getElementById('rulesControls');
const searchEl = document.getElementById('ruleSearch');
const chipsEl = document.getElementById('catChips');
const noMatchEl = document.getElementById('rulesNoMatch');

/* カードごとの一時状態（id で持つ。並び替えで番号がずれるため）。 */
const uiState = { askDel: null, editId: null };

/* 一覧の表示状態：カテゴリ絞り込み・検索語。カードは既定で畳み、開いたものだけ expanded に持つ。 */
const view = { cat: 'all', q: '' };
const expanded = new Set();
/* 絞り込み・検索中はドラッグ並び替えを止める（表示が一部だと並び順を壊すため）。 */
function filterActive() { return view.cat !== 'all' || !!view.q.trim(); }
function textOf(r) { return ((r.title || '') + ' ' + (r.body || '').replace(/<[^>]+>/g, ' ')).toLowerCase(); }
/* 畳んだときに題名の下に出す本文の抜粋（1行）。 */
function snippet(body) {
  const t = String(body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 70 ? t.slice(0, 70) + '…' : t;
}

/* ---- 小物 ---- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* 本文のかんたん記法。かならず先に esc() でHTMLを無効化し、そのうえで
   決めた記法だけをタグに置き換える。生のHTMLは一切通さない（共有される内容なので安全第一）。
   対応: **太字** / *斜体* / 行頭「- ・ •」で箇条書き / 行頭「1.」で番号付き / URL自動リンク / 改行 */
function fmtInline(s) {
  s = s.replace(/\*\*([^\n*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^\n_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^\n*]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}
function fmtBody(src) {
  const lines = esc(src).split('\n');
  let html = '';
  let list = null;
  const close = () => { if (list) { html += '</' + list + '>'; list = null; } };
  for (const line of lines) {
    const ul = /^\s*[-・•]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul) {
      if (list !== 'ul') { close(); html += '<ul class="rb-ul">'; list = 'ul'; }
      html += '<li>' + fmtInline(ul[1]) + '</li>';
    } else if (ol) {
      if (list !== 'ol') { close(); html += '<ol class="rb-ol">'; list = 'ol'; }
      html += '<li>' + fmtInline(ol[1]) + '</li>';
    } else if (line.trim() === '') {
      close(); html += '<div class="rb-sp"></div>';
    } else {
      close(); html += '<div class="rb-line">' + fmtInline(line) + '</div>';
    }
  }
  close();
  return html;
}

/* ---- リッチ入力（contenteditable）とHTMLサニタイズ ----
   入力欄そのものに太字などを表示する（Teamsのチャット欄のような形）。
   保存時・表示時に、必ず決めたタグだけへ通す（生HTML・スクリプトは除去）。 */
const FMTBTNS =
  '<button type="button" class="fmtbtn" data-md="bold" title="太字" aria-label="太字"><b>B</b></button>' +
  '<button type="button" class="fmtbtn" data-md="italic" title="斜体" aria-label="斜体"><i>I</i></button>' +
  '<button type="button" class="fmtbtn" data-md="list" title="箇条書き" aria-label="箇条書き">•</button>' +
  '<button type="button" class="fmtbtn" data-md="link" title="リンク" aria-label="リンク">🔗</button>';

const KEEP_INLINE = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em' };
function sanWalk(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += esc(n.nodeValue); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { out += '<br>'; return; }
    if (KEEP_INLINE[tag]) {
      const t = KEEP_INLINE[tag], inner = sanWalk(n);
      if (inner) out += '<' + t + '>' + inner + '</' + t + '>';
      return;
    }
    if (tag === 'A') {
      const h = n.getAttribute('href') || '';
      const inner = sanWalk(n) || esc(n.textContent);
      out += /^https?:\/\//i.test(h)
        ? '<a href="' + esc(h) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>'
        : inner;
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const t = tag.toLowerCase();
      out += '<' + t + ' class="rb-' + t + '">' + sanWalk(n) + '</' + t + '>';
      return;
    }
    if (tag === 'LI') { out += '<li>' + sanWalk(n) + '</li>'; return; }
    if (tag === 'P' || tag === 'DIV') { out += '<div class="rb-line">' + sanWalk(n) + '</div>'; return; }
    out += sanWalk(n); /* span/font など未対応タグは中身だけ残す */
  });
  return out;
}
function sanitizeHtml(src) {
  const tpl = document.createElement('template');
  tpl.innerHTML = src || '';
  return sanWalk(tpl.content).trim();
}
/* 表示用。新しい決め事はHTML、昔の決め事（**記法**）も読めるよう両対応。 */
function displayBody(src) {
  if (!src) return '';
  return /<\w/.test(src) ? sanitizeHtml(src) : fmtBody(src);
}
/* 入力欄の中身を保存値（安全なHTML）に。空なら ''。 */
function bodyValueOf(editor) {
  if (!editor || !(editor.textContent || '').trim()) return '';
  return sanitizeHtml(editor.innerHTML);
}
/* contenteditable には placeholder が無いので自前で出し分ける。 */
function syncEmpty(editor) {
  if (editor) editor.classList.toggle('is-empty', !(editor.textContent || '').trim());
}
/* ツールバー：入力欄に直接書式を付ける（標準の execCommand を使用。追加ライブラリ不要）。 */
function runCmd(editor, type) {
  if (!editor) return;
  editor.focus();
  try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* noop */ }
  if (type === 'bold') document.execCommand('bold');
  else if (type === 'italic') document.execCommand('italic');
  else if (type === 'list') document.execCommand('insertUnorderedList');
  else if (type === 'link') runLink();
  syncEmpty(editor);
}
function runLink() {
  const selObj = window.getSelection();
  const range = selObj && selObj.rangeCount ? selObj.getRangeAt(0).cloneRange() : null;
  const url = window.prompt('リンク先のURL（https://…）', 'https://');
  if (range) { selObj.removeAllRanges(); selObj.addRange(range); }
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (range && range.collapsed) {
    document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(url) + '</a>');
  } else {
    document.execCommand('createLink', false, url);
  }
}
/* 貼り付けは必ずサニタイズしてから挿入（生HTMLを入力欄に入れない＝XSS対策）。 */
function onPaste(ev) {
  const dt = ev.clipboardData;
  if (!dt) return;
  ev.preventDefault();
  const html = dt.getData('text/html');
  const ins = html ? sanitizeHtml(html) : esc(dt.getData('text/plain')).replace(/\r?\n/g, '<br>');
  document.execCommand('insertHTML', false, ins);
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) {
  return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
}
function today() { return fmtDate(new Date()); }
function newId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function metaOf(r) {
  const who = esc((r.author || '').trim());
  let dateStr;
  let label;
  if (r.updatedTs) { dateStr = fmtDate(new Date(r.updatedTs)); label = '更新日：'; }
  else if (r.ts) { dateStr = fmtDate(new Date(r.ts)); label = '作成日：'; }
  else { dateStr = esc(r.date || ''); label = '作成日：'; }
  return (who ? '作成者：' + who + ' ・ ' : '') + label + esc(dateStr);
}

/* ---- カード ---- */
function cardHtml(r, showCat, hideIds) {
  const id = esc(r.id);
  const hideCls = (hideIds && hideIds.has(r.id)) ? ' is-hidden' : '';
  const editing = uiState.editId === r.id;
  const asking = uiState.askDel === r.id;
  const pinned = !!r.pinned;

  if (editing) {
    const opts = CATS.map(([k, label]) =>
      '<option value="' + k + '"' + (catOf(r) === k ? ' selected' : '') + '>' + label + '</option>').join('');
    return '<article class="rcard editing" data-id="' + id + '">' +
      '<div class="editform">' +
        '<input class="re-title" type="text" maxlength="60" value="' + esc(r.title) + '" placeholder="タイトル" aria-label="タイトル">' +
        '<select class="re-cat" aria-label="カテゴリ">' + opts + '</select>' +
        '<input class="re-author" type="text" maxlength="12" value="' + esc((r.author || '').trim()) + '" placeholder="作成者（任意）" aria-label="作成者">' +
        '<div class="fmtbar">' + FMTBTNS + '</div>' +
        '<div class="re-editor rbody" contenteditable="true" aria-label="内容" ' +
          'data-placeholder="内容（任意）。文字を選んで B / I / • / 🔗">' + displayBody(r.body) + '</div>' +
        '<div class="editbtns"><button class="primary" data-save-edit="' + id + '">保存</button>' +
        '<button class="ghost" data-cancel="1">やめる</button></div>' +
      '</div></article>';
  }

  const foot = asking
    ? '<span class="ask">削除しますか？</span>' +
      '<button class="danger" data-del="' + id + '">削除する</button>' +
      '<button class="ghost" data-cancel="1">やめる</button>'
    : '<button class="ghost" data-link="' + id + '">リンクをコピー</button>' +
      '<button class="ghost" data-edit="' + id + '">編集</button>' +
      '<button class="ghost" data-ask="' + id + '">削除</button>';

  const isOpen = expanded.has(r.id);
  const snip = snippet(r.body);
  return '<article class="rcard' + (pinned ? ' pinned' : '') + (isOpen ? ' open' : '') + hideCls + '" data-id="' + id + '">' +
    '<div class="rtop">' +
      '<button class="grip" data-grip="1" aria-label="並び替え" title="ドラッグで並び替え（↑↓キーでも可）">≡</button>' +
      '<button class="rhead" data-expand="' + id + '" aria-expanded="' + isOpen + '">' +
        '<span class="rhead-main"><span class="rtitle">' + esc(r.title) + '</span>' +
          (snip ? '<span class="rsnip">' + esc(snip) + '</span>' : '') + '</span>' +
        '<span class="rcaret" aria-hidden="true"></span>' +
      '</button>' +
      '<button class="pinbtn' + (pinned ? ' on' : '') + '" data-pin="' + id + '" aria-pressed="' + pinned + '" ' +
        'title="' + (pinned ? '重要から外す' : '重要にする') + '" aria-label="重要にする">★</button>' +
    '</div>' +
    '<div class="rdetail">' +
      (showCat ? '<span class="rchip">' + esc(CAT_LABEL[catOf(r)]) + '</span>' : '') +
      (r.body ? '<div class="rbody">' + displayBody(r.body) + '</div>' : '') +
      '<div class="rmeta">' + metaOf(r) + '</div>' +
      '<div class="rfoot">' + foot + '</div>' +
    '</div></article>';
}

function groupHtml(key, label, items, pin, o) {
  const cards = items.map((r) => cardHtml(r, pin, o.hideIds)).join('');
  const cls = 'rgroup' + (pin ? ' rgroup-pin' : '') + (o.hidden ? ' is-hidden' : '');
  return '<section class="' + cls + '" data-gkey="' + esc(key) + '">' +
    '<div class="rgroup-h">' + esc(label) + '<span class="rgroup-n">' + o.count + '</span></div>' +
    '<div class="rgroup-list" data-group>' + cards + '</div></section>';
}

function chipHtml(key, label, n) {
  return '<button type="button" class="chip' + (view.cat === key ? ' on' : '') + '" data-chip="' + esc(key) + '">' +
    esc(label) + '<span class="chip-n">' + n + '</span></button>';
}
function renderChips(pinned, buckets, match) {
  const chips = [chipHtml('all', 'すべて', rules.filter(match).length)];
  if (pinned.length) chips.push(chipHtml('__pinned', '★重要', pinned.filter(match).length));
  CATS.forEach(([k, label]) => { if (buckets[k].length) chips.push(chipHtml(k, label, buckets[k].filter(match).length)); });
  chipsEl.innerHTML = chips.join('');
}

/* ---- 一覧の描画 ---- */
export function renderRules() {
  const has = rules.length > 0;
  emptyEl.hidden = has;
  controlsEl.hidden = !has;

  const q = view.q.trim().toLowerCase();
  const match = (r) => !q || textOf(r).includes(q);

  const pinned = rules.filter((r) => r.pinned);
  const buckets = {};
  CATS.forEach(([k]) => { buckets[k] = []; });
  rules.forEach((r) => { if (!r.pinned) buckets[catOf(r)].push(r); });

  renderChips(pinned, buckets, match);

  /* グループは常に全件レンダリングし、絞り込み/折りたたみは class で出し分ける
     （DOM に全カードが残るので、並び順の保存が壊れない）。 */
  const groups = [];
  if (pinned.length) groups.push(['__pinned', '重要', pinned, true]);
  CATS.forEach(([k, label]) => { if (buckets[k].length) groups.push([k, label, buckets[k], false]); });

  let html = '';
  let anyVisible = false;
  groups.forEach(([key, label, items, pin]) => {
    const vis = items.filter(match);
    const inFilter = view.cat === 'all' || view.cat === key;
    const hidden = !inFilter || (!!q && vis.length === 0);
    if (!hidden && vis.length) anyVisible = true;
    html += groupHtml(key, label, items, pin, {
      hidden,
      hideIds: q ? new Set(items.filter((r) => !match(r)).map((r) => r.id)) : null,
      count: vis.length,
    });
  });
  listEl.innerHTML = html;
  noMatchEl.hidden = !(has && !anyVisible);
}

/* ---- 追加・保存・削除 ---- */
function addRule() {
  const title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }
  const author = authorInput.value.trim();
  lsSet(KEYS.author, author);
  const r = {
    id: newId(),
    title,
    category: catSelect.value || 'other',
    body: bodyValueOf(ruleEditor),
    author,
    ts: Date.now(),
    date: today(),
    pinned: !!pinInput.checked,
  };
  uiState.askDel = null;
  uiState.editId = null;
  push({ action: 'save', item: r }, (l) => {
    const i = l.findIndex((x) => x.id === r.id);
    if (i >= 0) l[i] = r; else l.unshift(r);
    return l.slice(0, 200);
  }).then((res) => {
    if (res && res.ok) {
      titleInput.value = '';
      ruleEditor.innerHTML = '';
      syncEmpty(ruleEditor);
      pinInput.checked = false;
      addBtn.textContent = '追加しました';
      setTimeout(() => { addBtn.textContent = '追加'; }, 1600);
      titleInput.focus();
    } else if (res && res.conflict) {
      addBtn.textContent = '保存できませんでした';
      setTimeout(() => { addBtn.textContent = 'もう一度「追加」'; }, 1800);
    }
  });
}

function deleteRule(id) {
  uiState.askDel = null;
  uiState.editId = null;
  return push({ action: 'delete', id }, (l) => l.filter((x) => x.id !== id));
}

function togglePin(id) {
  const r = rules.find((x) => x.id === id);
  if (!r) return;
  const pinned = !r.pinned;
  return push({ action: 'pin', id, pinned }, (l) => {
    l.forEach((x) => { if (x.id === id) x.pinned = pinned; });
    return l;
  });
}

function commitEdit(id) {
  const card = listEl.querySelector('.rcard.editing[data-id="' + cssEsc(id) + '"]');
  if (!card) return;
  const titleEl = card.querySelector('.re-title');
  const catEl = card.querySelector('.re-cat');
  const authorEl = card.querySelector('.re-author');
  const bodyEl = card.querySelector('.re-editor');
  if (!titleEl) return;
  const title = titleEl.value.trim();
  if (!title) { titleEl.focus(); return; }
  const payload = {
    action: 'edit',
    id,
    title,
    category: catEl.value || 'other',
    author: authorEl.value.trim(),
    body: bodyValueOf(bodyEl),
  };
  uiState.editId = null;
  push(payload, (l) => {
    l.forEach((x) => {
      if (x.id === id) {
        x.title = payload.title;
        x.category = payload.category;
        x.author = payload.author;
        x.body = payload.body;
        x.updatedTs = Date.now();
      }
    });
    return l;
  });
}

/* data-id は自前生成の id なので記号は出ないが、念のため属性セレクタを安全にする */
function cssEsc(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

/* ---- リンク ---- */
function ruleLink(id) {
  return location.origin + location.pathname + '#r=' + encodeURIComponent(id);
}
function copyLink(btn, id) {
  const url = ruleLink(id);
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
    } else { manual(); }
  } catch (e) { manual(); }
}

export function openFromHash() {
  const m = /^#r=(.+)$/.exec(location.hash || '');
  if (!m) return;
  let id;
  try { id = decodeURIComponent(m[1]); } catch (e) { return; }
  const card = listEl.querySelector('.rcard[data-id="' + cssEsc(id) + '"]');
  if (!card) return;
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1600);
}

/* ---- 並び替え（≡ のドラッグ。カテゴリを跨いだ移動もできる）---- */
let reorder = null;
function isReordering() { return !!reorder; }

/* 指定の id 順にローカル配列を並べ替える。 */
function orderBy(ids, l) {
  const out = []; const used = [];
  ids.forEach((id) => {
    for (let i = 0; i < l.length; i++) {
      if (used.indexOf(i) < 0 && l[i].id === id) { out.push(l[i]); used.push(i); break; }
    }
  });
  l.forEach((it, i) => { if (used.indexOf(i) < 0) out.push(it); });
  return out;
}
function pushOrder() {
  const ids = [...listEl.querySelectorAll('.rcard')].map((c) => c.dataset.id);
  return push({ action: 'order', ids }, (l) => orderBy(ids, l));
}

/* ドラッグ中：ポインタ直下の要素から入れる場所を決める（別カテゴリの中も可）。
   dragging 中のカードは pointer-events:none なので下の要素が拾える。
   window で受けるので、指が ≡ から外れても追従する（タッチでも確実）。 */
function onReorderMove(ev) {
  if (!reorder) return;
  if (ev.cancelable) ev.preventDefault();  // ドラッグ中はスクロールさせない
  const card = reorder.card;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el) return;
  const overCard = el.closest('.rcard');
  if (overCard && overCard !== card && !overCard.classList.contains('is-hidden')) {
    const r = overCard.getBoundingClientRect();
    const before = ev.clientY < r.top + r.height / 2;
    overCard.parentNode.insertBefore(card, before ? overCard : overCard.nextSibling);
    return;
  }
  const list = el.closest('.rgroup-list');
  if (list) { if (!list.contains(card)) list.appendChild(card); return; }
  const sec = el.closest('.rgroup:not(.is-hidden)');
  if (sec) { const l = sec.querySelector('.rgroup-list'); if (l && !l.contains(card)) l.appendChild(card); }
}

/* ドロップ時：落とした先のカテゴリ（または重要）に応じて分類/ピンを更新し、並び順を保存。 */
function commitReorder(card) {
  const id = card.dataset.id;
  const sec = card.closest('.rgroup');
  const gkey = sec ? sec.dataset.gkey : null;
  const r = rules.find((x) => x.id === id);
  let upd = null;
  if (r && gkey) {
    if (gkey === '__pinned') {
      if (!r.pinned) upd = Object.assign({}, r, { pinned: true });
    } else if (catOf(r) !== gkey || r.pinned) {
      upd = Object.assign({}, r, { category: gkey, pinned: false });
    }
  }
  if (upd) {
    push({ action: 'save', item: upd }, (l) => {
      const i = l.findIndex((x) => x.id === id);
      if (i >= 0) l[i] = upd; else l.unshift(upd);
      return l;
    }).then(() => pushOrder());
  } else {
    pushOrder();
  }
}

function endReorder() {
  if (!reorder) return;
  const card = reorder.card;
  card.classList.remove('dragging');
  reorder = null;
  window.removeEventListener('pointermove', onReorderMove);
  window.removeEventListener('pointerup', endReorder);
  window.removeEventListener('pointercancel', endReorder);
  commitReorder(card);
}

/* ---- イベント配線 ---- */
function initEvents() {
  addBtn.addEventListener('click', addRule);
  titleInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); addRule(); }
  });
  document.getElementById('ruleFmt').addEventListener('pointerdown', (ev) => {
    const btn = ev.target.closest('.fmtbtn');
    if (!btn) return;
    ev.preventDefault();
    runCmd(ruleEditor, btn.dataset.md);
  });
  ruleEditor.addEventListener('input', () => syncEmpty(ruleEditor));
  ruleEditor.addEventListener('paste', onPaste);
  syncEmpty(ruleEditor);
  /* 編集フォームの入力欄：プレースホルダの出し分け＋貼り付けのサニタイズ */
  listEl.addEventListener('input', (ev) => {
    const ed = ev.target.closest('.re-editor');
    if (ed) syncEmpty(ed);
  });
  listEl.addEventListener('paste', (ev) => {
    if (ev.target.closest('.re-editor')) onPaste(ev);
  });

  /* 検索・カテゴリ絞り込み */
  searchEl.addEventListener('input', () => { view.q = searchEl.value; renderRules(); });
  chipsEl.addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    view.cat = c.dataset.chip;
    renderRules();
  });

  listEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.expand !== undefined) {
      const key = b.dataset.expand;
      if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
      const card = b.closest('.rcard');
      const open = card.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
    } else if (b.dataset.pin !== undefined) {
      togglePin(b.dataset.pin);
    } else if (b.dataset.link !== undefined) {
      copyLink(b, b.dataset.link);
    } else if (b.dataset.edit !== undefined) {
      uiState.editId = b.dataset.edit;
      uiState.askDel = null;
      renderRules();
      const form = listEl.querySelector('.rcard.editing');
      const inp = form && form.querySelector('.re-title');
      if (inp) { inp.focus(); inp.select(); }
      if (form) syncEmpty(form.querySelector('.re-editor'));
    } else if (b.dataset.saveEdit !== undefined) {
      commitEdit(b.dataset.saveEdit);
    } else if (b.dataset.ask !== undefined) {
      uiState.askDel = b.dataset.ask;
      uiState.editId = null;
      renderRules();
    } else if (b.dataset.del !== undefined) {
      deleteRule(b.dataset.del);
    } else if (b.dataset.cancel !== undefined) {
      uiState.askDel = null;
      uiState.editId = null;
      renderRules();
    }
  });

  listEl.addEventListener('keydown', (ev) => {
    if (ev.target.closest('.editform')) {
      if (ev.key === 'Escape') { ev.preventDefault(); uiState.editId = null; renderRules(); }
      else if (ev.key === 'Enter' && ev.target.classList.contains('re-title')) {
        ev.preventDefault(); commitEdit(uiState.editId);
      }
      return;
    }
    const g = ev.target.closest('[data-grip]');
    if (!g) return;
    if (filterActive()) return;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    const card = g.closest('.rcard');
    const group = card.parentNode;
    const id = card.dataset.id;
    if (ev.key === 'ArrowUp' && card.previousElementSibling) {
      group.insertBefore(card, card.previousElementSibling);
    } else if (ev.key === 'ArrowDown' && card.nextElementSibling) {
      group.insertBefore(card.nextElementSibling, card);
    } else { return; }
    pushOrder();
    const again = listEl.querySelector('.rcard[data-id="' + cssEsc(id) + '"] [data-grip]');
    if (again) again.focus();
  });

  listEl.addEventListener('pointerdown', (ev) => {
    const fb = ev.target.closest('.fmtbtn');
    if (fb) {
      ev.preventDefault();
      const form = fb.closest('.editform');
      if (form) runCmd(form.querySelector('.re-editor'), fb.dataset.md);
      return;
    }
    const g = ev.target.closest('[data-grip]');
    if (!g) return;
    if (filterActive()) return;
    ev.preventDefault();
    const card = g.closest('.rcard');
    reorder = { card };
    card.classList.add('dragging');
    try { g.setPointerCapture(ev.pointerId); } catch (e) { /* 一部ブラウザで失敗しても window 側で追従する */ }
    window.addEventListener('pointermove', onReorderMove, { passive: false });
    window.addEventListener('pointerup', endReorder);
    window.addEventListener('pointercancel', endReorder);
  });

  window.addEventListener('hashchange', openFromHash);
}

/* ---- 起動 ---- */
setHooks({
  onChange: renderRules,
  isBusy: () => uiState.editId !== null || uiState.askDel !== null || isReordering(),
});
authorInput.value = lsGet(KEYS.author, '');
document.getElementById('refreshBtn').addEventListener('click', () => pull());
initEvents();
initStore({ collection: 'rules', localKey: 'yukigassen-rules-local', cacheKey: 'yukigassen-rules-cache' })
  .then(openFromHash)
  .catch(() => {});
