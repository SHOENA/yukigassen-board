/**
 * 雪合戦フォーメーションボード — チーム共有用の保存先（Cloudflare Worker + KV）
 *
 * ■ 作り方（ブラウザだけで完結・無料・カード登録なし）
 *  1. https://dash.cloudflare.com にサインアップ / ログイン
 *  2. 左メニュー「Storage & Databases」→「KV」→「Create a namespace」
 *       名前: yukigassen  （名前は何でもよい）
 *  3. 左メニュー「Compute & Workers」→「Create」→「Start from Hello World」→ Deploy
 *       名前: yukigassen-api  （この名前がURLになる）
 *  4. 作った Worker を開く →「Edit code」→ 既定のコードを全部消して
 *     このファイルの中身を貼り付け →「Deploy」
 *  5. Worker の「Settings」→「Bindings」→「Add」→「KV namespace」
 *       Variable name: PATTERNS      ← この名前のままにする
 *       KV namespace : yukigassen    ← 2 で作ったもの
 *     → Deploy（保存後にもう一度 Deploy すると確実）
 *  6. Worker の URL（https://yukigassen-api.<あなたのサブドメイン>.workers.dev）をコピー
 *  7. yukigassen-board.html の先頭 var SHARE_URL='' にそのURLを貼る
 *  8. HTML を GitHub のリポジトリに push → Settings → Pages で公開
 *     → 出てきたURLをチームに配る。各自スマホで開いて「ホーム画面に追加」
 *
 * ■ メモ
 *  - このURLを知っている人は誰でも読み書きできます。URLはチーム内に留めてください。
 *    もう少し絞りたい場合は下の TEAM_KEY を設定してください（下のコメント参照）。
 *  - 同時保存は版番号（rev）で弾きます。読んだあとに誰かが保存していた場合、
 *    後から押した側は保存されず「ほかの人が先に更新しました」と表示されます。
 *  - 保存した人の画面には即反映されます。他の人の画面には最大1分ほど遅れて届くことがあります。
 *  - 無料枠は1日10万リクエスト・1000書き込み。7人のチームなら桁違いに余裕があります。
 *  - コードを直したら「Deploy」を押すだけ。URLは変わりません。
 */

/* 共有の合言葉。'' のままなら誰でも（URLを知っていれば）読み書きできます。
   例えば '2026fuyu' と入れた場合は、HTML側の SHARE_URL を
   https://....workers.dev/?k=2026fuyu のようにして使います。 */
const TEAM_KEY = '';

const KEY = 'patterns';
const MAX_PATTERNS = 100;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (TEAM_KEY) {
      const k = new URL(request.url).searchParams.get('k');
      if (k !== TEAM_KEY) return json({ ok: false, error: '合言葉が違います' }, 403);
    }
    if (!env.PATTERNS) {
      return json({ ok: false, error: 'KVが紐づいていません（Bindings で PATTERNS を設定してください）' }, 500);
    }

    try {
      const { rev, patterns: list } = await readAll(env);

      if (request.method === 'GET') return json({ ok: true, rev, patterns: list });
      if (request.method !== 'POST') return json({ ok: false, error: '不明なメソッド' }, 405);

      const body = await request.json();

      /* 楽観ロック。ブラウザが「読んだときの版番号」を送ってくるので、
         その間に誰かが保存していたら断って最新を返す（黙って上書きしない）。 */
      if (body.rev !== undefined && Number(body.rev) !== rev) {
        return json({
          ok: false,
          conflict: true,
          error: 'ほかの人が先に更新しました',
          rev,
          patterns: list,
        });
      }

      let out;

      switch (body.action) {
        case 'save': {
          const p = body.pattern;
          if (!p || !p.name) return json({ ok: false, error: 'パターン名がありません' });
          out = list.slice();
          const i = out.findIndex((o) => o.name === p.name);
          if (i >= 0) out[i] = p;
          else out.unshift(p);
          if (out.length > MAX_PATTERNS) out = out.slice(0, MAX_PATTERNS);
          break;
        }
        case 'delete': {
          out = list.filter((o) => o.name !== body.name);
          break;
        }
        case 'edit':
        case 'rename': {
          if (!body.to) return json({ ok: false, error: 'パターン名がありません' });
          if (body.to !== body.from && list.some((o) => o.name === body.to)) {
            return json({ ok: false, error: '同じ名前があります' });
          }
          const i = list.findIndex((o) => o.name === body.from);
          if (i < 0) return json({ ok: false, error: '元のパターンが見つかりません' });
          out = list.slice();
          const patch = { name: body.to };
          if (body.action === 'edit') {
            patch.memo = String(body.memo || '');
            patch.author = String(body.author || '');
          }
          out[i] = Object.assign({}, out[i], patch);
          break;
        }
        case 'order': {
          const names = Array.isArray(body.names) ? body.names : [];
          const used = new Set();
          out = [];
          for (const n of names) {
            const k = list.findIndex((o, idx) => !used.has(idx) && o.name === n);
            if (k >= 0) { out.push(list[k]); used.add(k); }
          }
          list.forEach((o, idx) => { if (!used.has(idx)) out.push(o); });
          break;
        }
        default:
          return json({ ok: false, error: '不明な操作です: ' + body.action });
      }

      const nextRev = rev + 1;
      await writeAll(env, nextRev, out);
      return json({ ok: true, rev: nextRev, patterns: out });
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
  },
};

/* KVには { rev, patterns } の形で入れる。
   rev は保存のたびに1つ増える版番号で、同時保存の検出に使う。
   配列がそのまま入っている古い形式も読めるようにしてある。 */
async function readAll(env) {
  const raw = await env.PATTERNS.get(KEY);
  if (!raw) return { rev: 0, patterns: [] };
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { rev: 0, patterns: v.filter((o) => o && o.name) };
    return {
      rev: Number(v.rev) || 0,
      patterns: Array.isArray(v.patterns) ? v.patterns.filter((o) => o && o.name) : [],
    };
  } catch (err) {
    return { rev: 0, patterns: [] };
  }
}

async function writeAll(env, rev, patterns) {
  await env.PATTERNS.put(KEY, JSON.stringify({ rev, patterns }));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS),
  });
}
