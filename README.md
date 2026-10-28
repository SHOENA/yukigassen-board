# 雪合戦フォーメーションボード

スポーツ雪合戦（36m×10m／シェルター5基＋シャトー2基）のフォーメーション検討ボード。
ケースごとに選手を並べ、フォーメーションとして保存してチーム全員で共有する。

## 構成

```
index.html            画面のマークアップ
css/style.css         スタイル（色は :root のトークンで定義、ダークモード対応）
js/
  main.js             起動とモジュールの配線
  config.js           共有先URL・localStorage のキー
  court.js            コート寸法とケースごとの初期配置
  state.js            画面の状態（表示中のケース・配置・メンバー名）
  board.js            コートの描画／ドラッグ／ケース切り替え
  roster.js           メンバー欄
  store.js            保存先（Cloudflare Worker または localStorage）
  formations.js       一覧カード・保存・読み込み・編集・並び替え・リンク
  views.js            画面切り替えと未保存の確認帯
worker/
  yukigassen-api.js   チーム共有の保存先（Cloudflare Worker + KV）
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
