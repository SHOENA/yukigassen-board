/**
 * 設定とブラウザ保存のキー。
 * 触るのは基本的に SHARE_URL の1行だけ。
 */

/* チーム共有の保存先（Cloudflare Worker のURL）
   例: 'https://yukigassen-api.xxxx.workers.dev'
   空のままだと、保存はその端末のブラウザの中だけになる。 */
export const SHARE_URL = 'https://yukigassen-api.show0120nnn.workers.dev/';

/* localStorage のキー。共有していないときの保存先と、共有時のキャッシュなど。 */
export const KEYS = {
  local: 'yukigassen-board-v2',
  cache: 'yukigassen-board-share-cache',
  author: 'yukigassen-board-author',
  view: 'yukigassen-board-view',
};

/* 共有先を見に行く間隔（ミリ秒） */
export const POLL_MS = 20000;

/* localStorage はプライベートブラウズなどで例外を投げるので、必ず包んで使う。 */
export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* 保存できなくても動作は続ける */
  }
}
