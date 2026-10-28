/**
 * フォーメーションの保存先。
 * SHARE_URL があれば Cloudflare Worker（チーム共有）、なければ localStorage（その端末だけ）。
 * 読み書きのたびに、サーバーが返した一覧でこちらを置き換える。
 */
import { SHARE_URL, KEYS, POLL_MS, lsGet, lsSet } from './config.js';

/* いま画面に出している一覧。読むのは formations.js。 */
export let patterns = [];

/* 保存のたびにサーバー側で1つ増える版番号。
   書き込み時に「自分が読んだときの番号」として送り、ずれていたら弾かれる。 */
let rev = 0;

const share = { url: '', state: 'off', msg: '' };

let pollTimer = null;
let onChange = () => {};      // 一覧を描き直す関数（main.js が差す）
let isBusy = () => false;     // 編集中などポーリングを止めたいときの判定

export function setHooks(hooks) {
  if (hooks.onChange) onChange = hooks.onChange;
  if (hooks.isBusy) isBusy = hooks.isBusy;
}

export function isShared() {
  return !!share.url;
}

/* ---- localStorage 側 ---- */
function localRead() {
  try { return JSON.parse(lsGet(KEYS.local, '[]')) || []; } catch (e) { return []; }
}
function localWrite(v) {
  lsSet(KEYS.local, JSON.stringify(v));
}
function cacheRead() {
  try { return JSON.parse(lsGet(KEYS.cache, '[]')) || []; } catch (e) { return []; }
}
function cacheWrite(v) {
  lsSet(KEYS.cache, JSON.stringify(v));
}

/* ---- 通信できていないときだけ出す帯 ---- */
function renderStatus() {
  const bar = document.getElementById('shareStatus');
  if (share.state === 'error') {
    bar.hidden = false;
    bar.className = 'bar tight warn';
    bar.textContent = '共有先につながりません（' + share.msg + '）。表示は最後に読めた内容です。';
  } else if (share.state === 'conflict') {
    bar.hidden = false;
    bar.className = 'bar tight warn';
    bar.textContent = 'ほかの人が先に更新したため、この操作は保存されていません。最新を読み込みました。';
  } else {
    bar.hidden = true;
  }
  document.getElementById('refreshBtn').hidden = !share.url;
}

function applyResult(res) {
  if (!res || !res.ok) throw new Error((res && res.error) || '応答が不正');
  patterns = res.patterns || [];
  if (res.rev !== undefined) rev = Number(res.rev) || 0;
  cacheWrite(patterns);
  share.state = 'ok';
  share.msg = '';
  renderStatus();
  onChange();
}

/* 先に誰かが保存していた場合。最新を取り込んで画面を更新し、保存は見送る。 */
function applyConflict(res) {
  patterns = res.patterns || patterns;
  if (res.rev !== undefined) rev = Number(res.rev) || 0;
  cacheWrite(patterns);
  share.state = 'conflict';
  share.msg = '';
  renderStatus();
  onChange();
  return { ok: false, conflict: true };
}

function failWith(err, keepCache) {
  share.state = 'error';
  share.msg = err.message || '通信エラー';
  if (keepCache && !patterns.length) patterns = cacheRead();
  renderStatus();
  onChange();
}

/* 共有先から読み直す。quiet=true なら通信中の表示を出さない（自動更新用）。 */
export function pull(quiet) {
  if (!share.url) {
    patterns = localRead();
    onChange();
    return Promise.resolve();
  }
  if (!quiet) { share.state = 'loading'; renderStatus(); }
  /* 読み直したので、前の衝突表示は消す */
  if (share.state === 'conflict') share.state = 'ok';
  const url = share.url + (share.url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
  return fetch(url)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(applyResult)
    .catch((e) => failWith(e, true));
}

/**
 * 変更を送る。共有していないときは localFn(list) でローカルの一覧を作り直す。
 * body は Worker 側の action ごとの指定（save / delete / edit / order）。
 * 戻り値は { ok, conflict } で、呼んだ側が結果に応じて表示を変えられる。
 */
export function push(body, localFn) {
  if (!share.url) {
    patterns = localFn(localRead());
    localWrite(patterns);
    onChange();
    renderStatus();
    return Promise.resolve({ ok: true });
  }
  share.state = 'loading';
  renderStatus();
  return fetch(share.url, {
    method: 'POST',
    /* text/plain にしておくと CORS のプリフライトが飛ばない */
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    /* rev を添えて送るのが楽観ロックの肝 */
    body: JSON.stringify({ ...body, rev }),
  })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((res) => {
      if (res && res.conflict) return applyConflict(res);
      applyResult(res);
      return { ok: true };
    })
    .catch((e) => { failWith(e, false); return { ok: false, conflict: false }; });
}

function startPoll() {
  if (pollTimer) clearInterval(pollTimer);
  if (!share.url) return;
  pollTimer = setInterval(() => {
    if (document.hidden || isBusy() || share.state === 'loading') return;
    pull(true);
  }, POLL_MS);
}

/* 起動時の読み込み。戻り値は最初の読み込みが終わる Promise。 */
export function initStore() {
  share.url = SHARE_URL || '';
  if (share.url) {
    patterns = cacheRead();
    onChange();
    renderStatus();
    startPoll();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pull(true);
    });
    return pull();
  }
  patterns = localRead();
  onChange();
  renderStatus();
  return Promise.resolve();
}
