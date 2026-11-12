/** メニュー画面。件数だけを出す。共有先があればそこから、なければこの端末の保存分から数える。 */
import { SHARE_URL, KEYS, lsGet } from './config.js?v=27';

function countLocal(key) {
  try { return (JSON.parse(lsGet(key, '[]')) || []).length; } catch (e) { return 0; }
}
function set(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(n);
}

function load(collection, field, id, cacheKey, localKey) {
  if (!SHARE_URL) { set(id, countLocal(localKey)); return; }
  set(id, countLocal(cacheKey));
  const sep = SHARE_URL.indexOf('?') < 0 ? '?' : '&';
  fetch(SHARE_URL + sep + 'collection=' + collection + '&t=' + Date.now())
    .then((r) => r.json())
    .then((res) => { if (res && res.ok) set(id, (res[field] || []).length); })
    .catch(() => {});
}

load('patterns', 'patterns', 'cntPat', KEYS.cache, KEYS.local);
load('rules', 'patterns', 'cntRule', 'yukigassen-rules-cache', 'yukigassen-rules-local');

/* 起動画面（このセッションで最初だけ）を見せたあと、メニューが現れる */
const SPLASH_MIN_MS = 4000;
const splash = document.getElementById('splash');
if (splash && !splash.hidden) {
  setTimeout(() => {
    splash.classList.add('done');
    setTimeout(() => { splash.hidden = true; }, 420);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}
