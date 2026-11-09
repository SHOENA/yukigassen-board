# SnowBall Fight

スポーツ雪合戦（36m×10m／シェルター5基＋シャトー2基）のチームツール。
2つのページを上部のナビで行き来する。

- **フォーメーション**（index.html）ケースごとに選手を並べ、フォーメーションとして保存・共有
- **決め事**（rules.html）チームの申し合わせをカテゴリごとに貯める

どちらも同じ Cloudflare Worker + KV に保存し、全員の画面で共有される。

## 構成

```
index.html            フォーメーションのページ
rules.html            決め事のページ
css/style.css         スタイル（色は :root のトークンで定義、ダークモード対応）
js/
  main.js             フォーメーションの起動と配線
  rules.js            決め事のページ一式（追加・一覧・編集・並び替え・リンク）
  config.js           共有先URL・localStorage のキー
  court.js            コート寸法とケースごとの初期配置
  state.js            画面の状態（表示中のケース・配置・メンバー名）
  board.js            コートの描画／ドラッグ／ケース切り替え
  roster.js           メンバー欄
  store.js            保存先（Cloudflare Worker または localStorage）。collection で種類を切替
  formations.js       一覧カード・保存・読み込み・編集・並び替え・リンク
  views.js            画面切り替えと未保存の確認帯
worker/
  yukigassen-api.js   チーム共有の保存先（Cloudflare Worker + KV）
                      フォーメーション(patterns)と決め事(rules)を別キーで保存
```

ビルドは不要。ブラウザのESモジュールをそのまま使う。

## 動かす

ESモジュールは `file://` では読み込めないので、ローカルでは簡易サーバーを立てる。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

## チーム共有の設定

1. `worker/yukigassen-api.js` の冒頭の手順どおりに Cloudflare Worker + KV を用意する
2. 発行された Worker の URL を `js/config.js` の `SHARE_URL` に入れる

空のままなら、保存はその端末のブラウザの中だけになる。

## 公開（GitHub Pages）

リポジトリの Settings → Pages で Source を「Deploy from a branch」、Branch を `main / (root)` にする。
`index.html` がトップページとして配信される。
