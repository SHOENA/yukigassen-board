/**
 * メンバー欄（FW・BK・監督・リザーブの名前）。
 * 名前はチームで1組のものとして state.names に持ち、コートの表示にも使う。
 */
import { ROSTER } from './court.js';
import { state } from './state.js';
import { render } from './board.js';

const host = document.getElementById('roster');

export function buildRoster() {
  host.innerHTML = ROSTER.map((row) => {
    const [id, role] = row;
    const coach = id === 'C1';
    const reserve = id.charAt(0) === 'R';
    const cls = coach ? ' coach' : (reserve ? ' res' : (role === 'BK' ? ' bk' : ''));
    const badge = coach ? '監督' : (reserve ? '控' + id.charAt(1) : id.charAt(1));
    const placeholder = coach ? '監督の名前' : (reserve ? 'リザーブの名前' : role + ' の名前');
    return '<div class="rrow' + cls + '">' +
      '<i class="rbadge">' + badge + '</i>' +
      '<input id="rname-' + id + '" data-name="' + id +
      '" type="text" autocomplete="off" maxlength="12" placeholder="' + placeholder + '">' +
      '</div>';
  }).join('');
}

export function fillRoster() {
  ROSTER.forEach(([id]) => {
    const input = document.getElementById('rname-' + id);
    if (input) input.value = state.names[id] || '';
  });
}

export function initRoster() {
  host.addEventListener('input', (ev) => {
    const input = ev.target.closest('[data-name]');
    if (!input) return;
    state.names[input.dataset.name] = input.value;
    render();
  });
}
