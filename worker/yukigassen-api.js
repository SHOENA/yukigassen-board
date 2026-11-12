/**
 * SnowBall Fight — チーム共有用の保存先（Cloudflare Worker + KV）
 *
 * フォーメーション・「決め事」・「大会予定」の3種類を、同じ Worker・同じ KV で保存します。
 * どれを読み書きするかは collection で切り替えます（patterns / rules / events）。
 * KV の中では別々のキーに入るので、版番号（rev）もそれぞれ独立しています。
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
 *  7. js/config.js の SHARE_URL='' にそのURLを貼る
 *  8. GitHub のリポジトリに push → Settings → Pages で公開
 *     → 出てきたURLをチームに配る。各自スマホで開いて「ホーム画面に追加」
 *
 * ■ メモ
 *  - このURLを知っている人は誰でも読み書きできます。URLはチーム内に留めてください。
 *    もう少し絞りたい場合は下の TEAM_KEY を設定してください（下のコメント参照）。
 *  - 同時保存は版番号（rev）で弾きます。読んだあとに誰かが保存していた場合、
 *    後から押した側は保存されず「ほかの人が先に更新しました」と表示されます。
 *  - フォーメーションと決め事は別々に数えるので、片方を保存しても
 *    もう片方の版番号は変わりません。
 *  - 無料枠は1日10万リクエスト・1000書き込み。7人のチームなら桁違いに余裕があります。
 *  - コードを直したら「Deploy」を押すだけ。URLは変わりません。
 */

/* 共有の合言葉。'' のままなら誰でも（URLを知っていれば）読み書きできます。
   例えば '2026fuyu' と入れた場合は、HTML側の SHARE_URL を
   https://....workers.dev/?k=2026fuyu のようにして使います。 */
const TEAM_KEY = '';

/* 保存の種類ごとの設定。KV のキー・1件を見分ける項目・上限。 */
const COLLECTIONS = {
  patterns: { idField: 'name', max: 100 },
  rules:    { idField: 'id',   max: 200 },
  events:   { idField: 'id',   max: 100 },
};

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
      const url = new URL(request.url);
      let body = null;
      if (request.method === 'POST') body = await request.json();

      /* どの種類を読み書きするか。POST は本文、GET はクエリで指定。
         古いクライアント（collection なし）はフォーメーション扱いにする。 */
      const collection = normColl(request.method === 'POST'
        ? (body && body.collection)
        : url.searchParams.get('collection'));
      const conf = COLLECTIONS[collection];

      const { rev, patterns: list } = await readAll(env, collection, conf.idField);

      if (request.method === 'GET') return json({ ok: true, collection, rev, patterns: list });
      if (request.method !== 'POST') return json({ ok: false, error: '不明なメソッド' }, 405);

      /* 楽観ロック。ブラウザが「読んだときの版番号」を送ってくるので、
         その間に誰かが保存していたら断って最新を返す（黙って上書きしない）。 */
      if (body.rev !== undefined && Number(body.rev) !== rev) {
        return json({ ok: false, conflict: true, error: 'ほかの人が先に更新しました', collection, rev, patterns: list });
      }

      const r = collection === 'rules' ? rulesOp(body, list, conf.max)
        : collection === 'events' ? eventsOp(body, list, conf.max)
        : patternsOp(body, list, conf.max);
      if (r.error) return json({ ok: false, error: r.error });

      const nextRev = rev + 1;
      await writeAll(env, collection, nextRev, r.out);
      return json({ ok: true, collection, rev: nextRev, patterns: r.out });
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
  },
};

/* ---- フォーメーション（name で見分ける）---- */
function patternsOp(body, list, max) {
  switch (body.action) {
    case 'save': {
      const p = body.pattern;
      if (!p || !p.name) return { error: 'パターン名がありません' };
      let out = list.slice();
      const i = out.findIndex((o) => o.name === p.name);
      if (i >= 0) out[i] = p;
      else out.unshift(p);
      if (out.length > max) out = out.slice(0, max);
      return { out };
    }
    case 'delete':
      return { out: list.filter((o) => o.name !== body.name) };
    case 'edit':
    case 'rename': {
      if (!body.to) return { error: 'パターン名がありません' };
      if (body.to !== body.from && list.some((o) => o.name === body.to)) {
        return { error: '同じ名前があります' };
      }
      const i = list.findIndex((o) => o.name === body.from);
      if (i < 0) return { error: '元のパターンが見つかりません' };
      const out = list.slice();
      const patch = { name: body.to };
      if (body.action === 'edit') {
        patch.memo = String(body.memo || '');
        patch.author = String(body.author || '');
      }
      out[i] = Object.assign({}, out[i], patch);
      return { out };
    }
    case 'order':
      return { out: reorder(list, body.names, 'name') };
    default:
      return { error: '不明な操作です: ' + body.action };
  }
}

/* ---- 決め事（id で見分ける）---- */
function rulesOp(body, list, max) {
  switch (body.action) {
    case 'save': {
      const it = body.item;
      if (!it || !it.id || !String(it.title || '').trim()) return { error: 'タイトルがありません' };
      let out = list.slice();
      const i = out.findIndex((o) => o.id === it.id);
      if (i >= 0) out[i] = it;
      else out.unshift(it);
      if (out.length > max) out = out.slice(0, max);
      return { out };
    }
    case 'delete':
      return { out: list.filter((o) => o.id !== body.id) };
    case 'edit': {
      const i = list.findIndex((o) => o.id === body.id);
      if (i < 0) return { error: '元の決め事が見つかりません' };
      const title = String(body.title || '').trim();
      if (!title) return { error: 'タイトルがありません' };
      const out = list.slice();
      out[i] = Object.assign({}, out[i], {
        title,
        category: String(body.category || 'other'),
        body: String(body.body || ''),
        author: String(body.author || ''),
        updatedTs: Date.now(),
      });
      return { out };
    }
    case 'pin': {
      const i = list.findIndex((o) => o.id === body.id);
      if (i < 0) return { error: '元の決め事が見つかりません' };
      const out = list.slice();
      out[i] = Object.assign({}, out[i], { pinned: !!body.pinned });
      return { out };
    }
    case 'order':
      return { out: reorder(list, body.ids, 'id') };
    default:
      return { error: '不明な操作です: ' + body.action };
  }
}

/* ---- 大会予定（id で見分ける）。members は { name, status } の配列。
   status は yes（参加）/ maybe（未定）/ no（不参加）。 ---- */
const STATUS = ['yes', 'maybe', 'no'];
function eventsOp(body, list, max) {
  const find = (id) => list.findIndex((o) => o.id === id);
  switch (body.action) {
    case 'save': {
      const it = body.item;
      if (!it || !it.id || !String(it.name || '').trim()) return { error: '大会名がありません' };
      let out = list.slice();
      const i = out.findIndex((o) => o.id === it.id);
      if (i >= 0) out[i] = it;
      else out.unshift(it);
      if (out.length > max) out = out.slice(0, max);
      return { out };
    }
    case 'delete':
      return { out: list.filter((o) => o.id !== body.id) };
    case 'edit': {
      const i = find(body.id);
      if (i < 0) return { error: '大会が見つかりません' };
      const name = String(body.name || '').trim();
      if (!name) return { error: '大会名がありません' };
      const out = list.slice();
      out[i] = Object.assign({}, out[i], {
        name,
        date: String(body.date || ''),
        place: String(body.place || ''),
        memo: String(body.memo || ''),
      });
      return { out };
    }
    /* 参加メンバーの追加・状態変更・削除。大会ごとの配列をその場で更新する。 */
    case 'member': {
      const i = find(body.id);
      if (i < 0) return { error: '大会が見つかりません' };
      const name = String(body.name || '').trim().slice(0, 12);
      if (!name) return { error: '名前がありません' };
      const members = (list[i].members || []).slice();
      const k = members.findIndex((m) => m.name === name);
      if (body.op === 'remove') {
        if (k >= 0) members.splice(k, 1);
      } else {
        const status = STATUS.includes(body.status) ? body.status : 'yes';
        if (k >= 0) members[k] = { name, status };
        else if (members.length >= 40) return { error: 'メンバーは40人までです' };
        else members.push({ name, status });
      }
      const out = list.slice();
      out[i] = Object.assign({}, list[i], { members });
      return { out };
    }
    default:
      return { error: '不明な操作です: ' + body.action };
  }
}

/* 送られてきた並び順（キーの配列）で並べ替える。
   リストに無いキーは無視し、並びに含まれなかったものは後ろに回す。 */
function reorder(list, order, field) {
  const keys = Array.isArray(order) ? order : [];
  const used = new Set();
  const out = [];
  for (const key of keys) {
    const k = list.findIndex((o, idx) => !used.has(idx) && o[field] === key);
    if (k >= 0) { out.push(list[k]); used.add(k); }
  }
  list.forEach((o, idx) => { if (!used.has(idx)) out.push(o); });
  return out;
}

/* KVには { rev, patterns } の形で入れる（種類ごとに別キー）。
   rev は保存のたびに1つ増える版番号で、同時保存の検出に使う。
   配列がそのまま入っている古い形式も読めるようにしてある。 */
async function readAll(env, collection, idField) {
  const raw = await env.PATTERNS.get(collection);
  if (!raw) return { rev: 0, patterns: [] };
  try {
    const v = JSON.parse(raw);
    const ok = (o) => o && o[idField];
    if (Array.isArray(v)) return { rev: 0, patterns: v.filter(ok) };
    return {
      rev: Number(v.rev) || 0,
      patterns: Array.isArray(v.patterns) ? v.patterns.filter(ok) : [],
    };
  } catch (err) {
    return { rev: 0, patterns: [] };
  }
}

async function writeAll(env, collection, rev, patterns) {
  await env.PATTERNS.put(collection, JSON.stringify({ rev, patterns }));
}

function normColl(v) {
  return v === 'rules' || v === 'events' ? v : 'patterns';
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS),
  });
}
