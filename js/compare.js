// Compare tab: 2–3 players side by side.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { fixtureChips, playerPhoto, teamBadge } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { t, posShort } from './i18n.js';

let model = null;
const modelXp = (p) => (model ? model.xp(p.id, model.gws[0]) : num(p.ep_next));

const STORAGE_KEY = 'amitfpl:compare';
const SLOTS = 3;

const METRICS = [
  { label: () => t('common.team'), fn: (p) => `${teamBadge(p.team, 'meta-badge')} ${escapeHtml(state.teamsById[p.team].name)}` },
  { label: () => t('cmp.position'), fn: (p) => posShort(state.positionsById[p.element_type].singular_name_short) },
  { label: () => t('common.price'), fn: (p) => fmtPrice(p.now_cost) },
  { label: () => t('cmp.selectedBy'), fn: (p) => `${p.selected_by_percent}%` },
  { label: () => t('cmp.xpNextGw'), fn: (p) => modelXp(p).toFixed(1), best: (p) => modelXp(p) },
  { label: () => t('common.form'), fn: (p) => p.form, best: (p) => num(p.form) },
  { label: () => t('cmp.totalPoints'), fn: (p) => p.total_points, best: (p) => p.total_points },
  { label: () => t('cmp.ppg'), fn: (p) => p.points_per_game, best: (p) => num(p.points_per_game) },
  { label: () => t('cmp.minutes'), fn: (p) => p.minutes, best: (p) => p.minutes },
  { label: () => t('cmp.goals'), fn: (p) => p.goals_scored, best: (p) => p.goals_scored },
  { label: () => t('cmp.assists'), fn: (p) => p.assists, best: (p) => p.assists },
  { label: () => 'xG', fn: (p) => p.expected_goals, best: (p) => num(p.expected_goals) },
  { label: () => 'xA', fn: (p) => p.expected_assists, best: (p) => num(p.expected_assists) },
  { label: () => 'xGI', fn: (p) => p.expected_goal_involvements, best: (p) => num(p.expected_goal_involvements) },
  { label: () => t('cmp.xgPer90'), fn: (p) => p.expected_goals_per_90, best: (p) => num(p.expected_goals_per_90) },
  { label: () => t('cmp.bonus'), fn: (p) => p.bonus, best: (p) => p.bonus },
  { label: () => t('cmp.value'), fn: (p) => p.value_season, best: (p) => num(p.value_season) },
  { label: () => t('cmp.next5'), fn: (p) => `<div class="fdr-cell">${fixtureChips(p.team, 5)}</div>` },
];

function load() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return Array.from({ length: SLOTS }, (_, i) => ids[i] ?? null);
  } catch {
    return Array(SLOTS).fill(null);
  }
}

const save = (ids) => localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

function findPlayer(text) {
  if (!text) return null;
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const els = state.bootstrap.elements;
  return (
    els.find((p) => `${p.web_name} (${state.teamsById[p.team].short_name})`.toLowerCase() === q) ||
    els.find((p) => p.web_name.toLowerCase() === q) ||
    els.find((p) => p.web_name.toLowerCase().startsWith(q)) ||
    els.find((p) => `${p.first_name} ${p.second_name}`.toLowerCase().includes(q)) ||
    null
  );
}

export async function renderCompare(root) {
  if (!model) {
    await loadBaseline();
    model = buildModel(1);
  }
  const ids = load();
  const players = ids.map((id) => state.playersById[id] || null);
  const chosen = players.filter(Boolean);

  const datalist = `<datalist id="cmp-players">${state.bootstrap.elements
    .map((p) => `<option value="${escapeHtml(p.web_name)} (${state.teamsById[p.team].short_name})"></option>`)
    .join('')}</datalist>`;

  const inputs = players
    .map((p, i) => `<span class="cmp-slot"><input type="text" list="cmp-players" data-slot="${i}" class="cmp-input"
        placeholder="${t('cmp.playerN', { n: i + 1 })}${i === 2 ? t('cmp.optional') : ''}"
        value="${p ? `${escapeHtml(p.web_name)} (${state.teamsById[p.team].short_name})` : ''}" />${p ? `<button class="cmp-x" data-slot="${i}" title="${t('common.clear')}">✕</button>` : ''}</span>`)
    .join('');

  let table = '';
  if (chosen.length >= 2) {
    const head = chosen
      .map((p) => `<th class="num cmp-head clickable" data-pid="${p.id}">
        ${playerPhoto(p, 'cmp-photo')}<br>
        ${escapeHtml(p.web_name)}<br>
        <span class="muted" style="font-weight:500">${teamBadge(p.team, 'meta-badge')} ${state.teamsById[p.team].short_name}</span>
      </th>`)
      .join('');
    const rows = METRICS.map((m) => {
      const vals = chosen.map((p) => m.fn(p));
      let bestIdx = -1;
      if (m.best) {
        const scores = chosen.map((p) => m.best(p));
        const max = Math.max(...scores);
        if (scores.filter((s) => s === max).length === 1) bestIdx = scores.indexOf(max);
      }
      const cells = vals
        .map((v, i) => `<td class="num ${i === bestIdx ? 'hi' : ''}">${v}</td>`)
        .join('');
      return `<tr><td style="font-weight:600">${m.label()}</td>${cells}</tr>`;
    }).join('');
    table = `
      <div class="table-wrap">
        <table class="data cmp-table">
          <thead><tr><th class="no-sort">${t('cmp.metric')}</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="note">${t('cmp.note')}</div>`;
  } else {
    table = `<div class="note" style="padding:24px 16px">${t('cmp.pickTwo')}</div>`;
  }

  root.innerHTML = `
    <div class="card">
      <div class="toolbar" style="gap:8px">
        ${inputs}
        <button class="link-btn" id="cmp-clear">${t('common.clear')}</button>
      </div>
      ${table}
    </div>
    ${datalist}`;

  root.querySelectorAll('.cmp-input').forEach((input) => {
    input.addEventListener('change', () => {
      const slot = +input.dataset.slot;
      const p = findPlayer(input.value);
      const next = load();
      next[slot] = p ? p.id : null;
      save(next);
      renderCompare(root);
    });
  });
  root.querySelectorAll('.cmp-x').forEach((b) =>
    b.addEventListener('click', () => {
      const next = load();
      next[+b.dataset.slot] = null;
      save(next);
      renderCompare(root);
    })
  );
  root.querySelector('#cmp-clear').addEventListener('click', () => {
    save([]);
    renderCompare(root);
  });
}
