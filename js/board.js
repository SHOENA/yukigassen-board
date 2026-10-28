/**
 * コートの描画と、駒のドラッグ、ケース／分岐の切り替え。
 * SVG は文字列で組み立てて innerHTML で流し込む（要素数が少ないのでこれで十分速い）。
 */
import {
  W, L, CENTER, BACK_OURS, BACK_OPP,
  SHELTERS, FLAGS, COACH, OUT_A, OUT_B, RES_A,
  IDS, PRESETS, team, isFW, outZone,
} from './court.js';
import { state, slotKey, ensureBoard, isOut, markDirty } from './state.js';

const svg = document.getElementById('court');
const VIEW_BOX = '-4.3 -0.5 16.9 37';

/* 属性に入れる前に最低限の無害化をする */
export function esc(s) {
  return String(s).replace(/[<>&"]/g, '');
}

/* ---- 動かない部分（ライン・シェルター・各エリア）---- */
export function drawStatic() {
  const g = [];

  g.push('<rect x="' + COACH.x0 + '" y="' + CENTER + '" width="' + (COACH.x1 - COACH.x0) +
    '" height="' + (L - CENTER) + '" rx="0.18" fill="var(--accent-soft)" opacity="0.75"/>');
  g.push('<text x="' + ((COACH.x0 + COACH.x1) / 2) + '" y="' + (CENTER + 1.1) +
    '" text-anchor="middle" font-size="0.5" fill="var(--accent)" font-family="var(--f-disp)">監督エリア</text>');

  [[OUT_A, 'var(--blue)'], [OUT_B, 'var(--red)']].forEach(([r, color]) => {
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    g.push('<rect x="' + r.x0 + '" y="' + (r.y0 - 0.8) + '" width="' + (r.x1 - r.x0) +
      '" height="' + (r.y1 - r.y0 + 1.6) + '" rx="0.18" fill="' + color +
      '" fill-opacity="0.1" stroke="' + color +
      '" stroke-width="0.06" stroke-dasharray="0.4 0.35" stroke-opacity="0.55"/>');
    g.push('<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="0.62" fill="' + color +
      '" fill-opacity="0.75" font-family="var(--f-disp)" font-weight="700" transform="rotate(90 ' +
      cx + ' ' + cy + ')">アウト選手待機</text>');
  });

  g.push('<rect x="' + RES_A.x0 + '" y="' + (RES_A.y0 - 0.8) + '" width="' + (RES_A.x1 - RES_A.x0) +
    '" height="' + (RES_A.y1 - RES_A.y0 + 1.6) +
    '" rx="0.18" fill="var(--muted)" fill-opacity="0.08" stroke="var(--muted)" stroke-width="0.06" stroke-dasharray="0.4 0.35" stroke-opacity="0.5"/>');

  g.push('<rect x="0" y="0" width="' + W + '" height="' + L +
    '" rx="0.25" fill="var(--snow)" stroke="var(--snow-edge)" stroke-width="0.13"/>');
  g.push('<line x1="0" y1="' + CENTER + '" x2="' + W + '" y2="' + CENTER +
    '" stroke="var(--snow-edge)" stroke-width="0.14"/>');
  [BACK_OURS, BACK_OPP].forEach((y) => {
    g.push('<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y +
      '" stroke="var(--snow-edge)" stroke-width="0.08" stroke-dasharray="0.5 0.4" opacity="0.8"/>');
  });
  g.push('<text x="0.35" y="' + (CENTER - 0.35) + '" font-size="0.52" fill="var(--snow-edge)" font-family="var(--f-disp)">センターライン</text>');
  g.push('<text x="0.35" y="' + (BACK_OURS + 0.85) + '" font-size="0.52" fill="var(--snow-edge)" font-family="var(--f-disp)">バックライン</text>');
  g.push('<text x="0.35" y="' + (BACK_OPP + 0.85) + '" font-size="0.52" fill="var(--snow-edge)" font-family="var(--f-disp)">バックライン</text>');

  SHELTERS.forEach((s) => {
    g.push('<rect x="' + (s.x - s.w / 2) + '" y="' + (s.y - s.h / 2) +
      '" width="' + s.w + '" height="' + s.h + '" rx="0.08" fill="var(--shelter)"/>');
  });
  FLAGS.forEach((f) => {
    g.push('<circle cx="' + f.x + '" cy="' + f.y + '" r="0.17" fill="var(--snow-edge)"/>');
    g.push('<path d="M' + f.x + ' ' + (f.y - 0.17) + ' L' + (f.x + 0.95) + ' ' + (f.y - 0.52) +
      ' L' + f.x + ' ' + (f.y - 0.87) + ' Z" fill="var(--accent)"/>');
  });

  svg.innerHTML = g.join('') + '<g id="reserves"></g><g id="tokens"></g>';
  svg.setAttribute('viewBox', VIEW_BOX);
}

/* ---- リザーブ（名前が入っている控えだけ表示）---- */
function drawReserves() {
  const host = svg.querySelector('#reserves');
  const out = [];
  const cx = (RES_A.x0 + RES_A.x1) / 2;
  let shown = 0;

  ['R1', 'R2', 'R3'].forEach((id, k) => {
    let nm = (state.names[id] || '').trim();
    if (!nm) return;
    if (nm.length > 5) nm = nm.slice(0, 5) + '…';
    const cy = RES_A.y0 + 1.2 + (shown++) * 4.6;
    out.push('<g transform="rotate(90 ' + cx + ' ' + cy + ')">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="0.6" fill="var(--muted)" fill-opacity="0.45"/>' +
      '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="0.5" font-family="var(--f-disp)" font-weight="700" fill="var(--snow)">控' + (k + 1) + '</text>' +
      '<text x="' + (cx + 0.95) + '" y="' + cy + '" dominant-baseline="central" font-size="0.68" font-family="var(--f-disp)" font-weight="700" fill="var(--ink)" paint-order="stroke" stroke="var(--bg)" stroke-width="0.22" stroke-linejoin="round">' + esc(nm) + '</text>' +
      '</g>');
  });

  if (!shown) {
    const my = (RES_A.y0 + RES_A.y1) / 2;
    out.push('<text x="' + cx + '" y="' + my +
      '" text-anchor="middle" font-size="0.62" fill="var(--muted)" font-family="var(--f-disp)" font-weight="700" transform="rotate(90 ' +
      cx + ' ' + my + ')">リザーブ待機</text>');
  }
  host.innerHTML = out.join('');
}

/* ---- 選手の駒 ---- */
function drawTokens() {
  const pos = state.pos;
  const host = svg.querySelector('#tokens');
  const out = [];

  IDS.forEach((id) => {
    const p = pos[id];
    const coach = id === 'C1';
    const dead = !coach && isOut(id);
    const fw = isFW(id);
    const color = coach ? 'var(--accent)'
      : (team(id) === 'A'
        ? (fw ? 'var(--blue-fw)' : 'var(--blue-bk)')
        : (fw ? 'var(--red-fw)' : 'var(--red-bk)'));
    const opacity = dead ? 0.22 : 1;
    const ink = coach ? '#fff' : (fw ? 'var(--num-fw)' : 'var(--num-bk)');
    const label = coach ? '監' : id.charAt(1);
    const sel = state.sel === id;
    const nm = (team(id) === 'A' || coach) ? (state.names[id] || '').trim() : '';

    out.push('<g class="token' + (sel ? ' sel' : '') + '" data-id="' + id +
      '" transform="translate(' + p.x + ' ' + p.y + ')">' +
      '<circle r="1.15" fill="transparent"/>' +
      '<circle class="body" r="0.68" fill="' + color + '" fill-opacity="' + opacity +
      '" stroke="' + (sel ? 'var(--accent)' : (dead ? color : 'var(--snow)')) +
      '" stroke-width="' + (sel ? 0.22 : 0.13) + '"' + (dead ? ' stroke-opacity="0.6"' : '') + '/>' +
      '<text y="0.01" text-anchor="middle" dominant-baseline="central" font-size="' + (coach ? 0.62 : 0.72) +
      '" font-family="' + (coach ? 'var(--f-disp)' : 'var(--f-num)') +
      '" font-weight="700" fill="' + (dead ? color : ink) + '" fill-opacity="' + (dead ? 0.75 : 1) + '">' + label + '</text>' +
      (nm ? '<text y="1.62" text-anchor="middle" font-size="0.62" font-family="var(--f-disp)" font-weight="700" fill="var(--ink)" fill-opacity="' +
        (dead ? 0.45 : 1) + '" paint-order="stroke" stroke="var(--snow)" stroke-width="0.22" stroke-linejoin="round">' + esc(nm) + '</text>' : '') +
      '</g>');
  });

  host.innerHTML = out.join('');
}

/* ---- ルール上の注意と残り人数 ---- */
function drawStatus() {
  const pos = state.pos;
  const bar = document.getElementById('status');
  const msgs = [];
  const back = [];

  for (let i = 1; i <= 4; i++) {
    if (!isOut('A' + i) && pos['A' + i].y > BACK_OURS) back.push(i);
  }
  if (back.length) msgs.push('FW ' + back.join('・') + ' がバックラインより後ろです');

  let over = 0;
  let liveA = 0;
  let liveB = 0;
  for (let j = 1; j <= 7; j++) {
    if (!isOut('A' + j)) { liveA++; if (pos['A' + j].y < CENTER) over++; }
    if (!isOut('B' + j)) liveB++;
  }
  if (over >= 4) msgs.push('相手コートに' + over + '人（4人目でセットを失います）');

  if (msgs.length) {
    bar.className = 'bar warn';
    bar.textContent = '⚠ ' + msgs.join(' / ');
  } else {
    bar.className = 'bar';
    const picked = state.sel
      ? '・' + (state.sel === 'C1' ? '監督' : state.sel.charAt(1) + '番') + 'を選択中'
      : '';
    bar.textContent = '自' + liveA + '人 対 相手' + liveB + '人・相手コートに' + over + '人' + picked;
  }
}

export function render() {
  svg.setAttribute('viewBox', VIEW_BOX);
  drawReserves();
  drawTokens();
  drawStatus();
}

/* ---- ケースと分岐 ---- */
export function renderBranch() {
  const preset = PRESETS[state.caseKey];
  const variant = (preset.vars || [])[0];

  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.classList.toggle('on', b.dataset.preset === state.caseKey);
  });

  document.getElementById('branchRow').innerHTML =
    '<span class="blabel">初手で落ちた場合</span>' +
    '<button data-branch="full"' + (state.branch === 'full' ? ' class="on"' : '') + '>7名そのまま</button>' +
    (variant ? '<button data-branch="out1"' + (state.branch === 'out1' ? ' class="on"' : '') + '>' + variant.label + '</button>' : '');

  document.getElementById('branchNote').textContent =
    (state.branch === 'out1' && variant)
      ? preset.label + '／' + variant.label + '：' + variant.note + '。落ちた選手は右の待機エリアに置いてあります。'
      : preset.label + 'の配置。選手を動かすとこのケースの配置として保持され、「保存」でフォーメーションにまとめて記録されます。';
}

export function switchBoard(key, branch) {
  state.caseKey = key;
  state.branch = branch;
  state.pos = ensureBoard(slotKey());
  state.sel = null;
  render();
  renderBranch();
}

/* ---- ドラッグ ---- */
let drag = null;

/* 画面座標をコート座標に直し、置ける範囲に丸める */
function toCourt(ev, id) {
  const m = svg.getScreenCTM().inverse();
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const q = pt.matrixTransform(m);

  if (id === 'C1') {
    return {
      x: Math.min(COACH.x1, Math.max(COACH.x0, q.x)),
      y: Math.min(COACH.y1, Math.max(COACH.y0, q.y)),
    };
  }
  if (q.x > W + 0.2) {          // 右の待機エリアに置いたらアウト扱い
    const z = outZone(id);
    return {
      x: Math.min(z.x1, Math.max(z.x0, q.x)),
      y: Math.min(z.y1, Math.max(z.y0, q.y)),
    };
  }
  return {
    x: Math.min(W - 0.3, Math.max(0.3, q.x)),
    y: Math.min(L - 0.3, Math.max(0.3, q.y)),
  };
}

export function initBoard() {
  svg.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest('.token');
    if (!g) return;
    const id = g.dataset.id;
    state.sel = state.sel === id ? null : id;
    drag = { id };
    svg.setPointerCapture(ev.pointerId);
    render();
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const q = toCourt(ev, drag.id);
    state.pos[drag.id] = { x: +q.x.toFixed(2), y: +q.y.toFixed(2) };
    markDirty();
    render();
  });

  const endDrag = () => { drag = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  document.getElementById('presetRow').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-preset]');
    if (!b) return;
    switchBoard(b.dataset.preset, state.branch);
  });

  document.getElementById('branchRow').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-branch]');
    if (!b) return;
    switchBoard(state.caseKey, b.dataset.branch);
  });
}
