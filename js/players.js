import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { fixtureChips, playerPhoto, teamBadge, spBadges, isNewSigning } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { t, posShort, posPlural } from './i18n.js';

let model = null; // built once in renderPlayers, reused on every re-render

// Labels/titles resolve at render time so a language switch re-renders
// with the right strings. xG/xA/xGI/PPG stay Latin in both languages.
const COLUMNS = [
  { key: 'web_name', label: () => t('common.player'), numeric: false },
  { key: 'position', label: () => t('common.pos'), numeric: false },
  { key: 'now_cost', label: () => t('common.price'), numeric: true },
  { key: 'selected_by_percent', label: () => t('common.sel'), numeric: true },
  { key: 'ep_next', label: () => t('common.xpNext'), numeric: true, title: () => t('common.xpNextTitle') },
  { key: 'form', label: () => t('common.form'), numeric: true },
  { key: 'total_points', label: () => t('common.pts'), numeric: true },
  { key: 'points_per_game', label: () => 'PPG', numeric: true },
  { key: 'expected_goals', label: () => 'xG', numeric: true },
  { key: 'expected_assists', label: () => 'xA', numeric: true },
  { key: 'expected_goal_involvements', label: () => 'xGI', numeric: true },
  { key: 'defensive_contribution', label: () => 'DC', numeric: true, title: () => t('players.dcTitle') },
  { key: 'minutes', label: () => t('common.min'), numeric: true },
  { key: 'fixtures', label: () => t('common.next3'), numeric: false, noSort: true },
];

const view = {
  search: '',
  position: 'all',
  team: 'all',
  maxPrice: '',
  newOnly: false,
  sortKey: 'ep_next',
  sortDir: 'desc',
  limit: 100,
};

const modelXp = (p) => (model ? model.xp(p.id, model.gws[0]) : num(p.ep_next));

function playerValue(p, key) {
  if (key === 'web_name') return p.web_name.toLowerCase();
  if (key === 'position') return p.element_type;
  if (key === 'ep_next') return modelXp(p);
  const raw = p[key];
  return typeof raw === 'number' ? raw : num(raw);
}

function filtered() {
  const q = view.search.trim().toLowerCase();
  let list = state.bootstrap.elements.filter((p) => {
    if (view.position !== 'all' && p.element_type !== +view.position) return false;
    if (view.team !== 'all' && p.team !== +view.team) return false;
    if (view.maxPrice && p.now_cost / 10 > +view.maxPrice) return false;
    if (view.newOnly && !isNewSigning(p)) return false;
    if (q) {
      const team = state.teamsById[p.team];
      const hay = `${p.first_name} ${p.second_name} ${p.web_name} ${team.name} ${team.short_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const dir = view.sortDir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const va = playerValue(a, view.sortKey);
    const vb = playerValue(b, view.sortKey);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

function render(root) {
  const list = filtered();
  const shown = list.slice(0, view.limit);

  const header = COLUMNS.map((c) => {
    const sorted = view.sortKey === c.key;
    const arrow = sorted ? `<span class="arrow">${view.sortDir === 'asc' ? '▲' : '▼'}</span>` : '';
    const cls = [c.numeric ? 'num' : '', sorted ? 'sorted' : '', c.noSort ? 'no-sort' : ''].join(' ');
    return `<th class="${cls}" data-key="${c.noSort ? '' : c.key}" title="${c.title ? c.title() : ''}">${c.label()}${arrow}</th>`;
  }).join('');

  const rows = shown
    .map((p) => {
      const team = state.teamsById[p.team];
      const pos = state.positionsById[p.element_type].singular_name_short;
      const st = statusInfo(p);
      const flag = st
        ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>`
        : '';
      const ep = modelXp(p);
      return `<tr>
        <td><div class="player-flex clickable" data-pid="${p.id}" title="${t('common.playerProfile')}">
          ${playerPhoto(p, 'row-photo')}
          <div class="player-cell">
            <span class="player-name">${escapeHtml(p.web_name)}${flag}${spBadges(p)}</span>
            <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${team.short_name}${isNewSigning(p) ? ` <span class="new-tag">${t('players.newTag')}</span>` : ''}</span>
          </div>
        </div></td>
        <td><span class="pos-badge pos-${pos}">${posShort(pos)}</span></td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td class="num">${p.selected_by_percent}%</td>
        <td class="num ${ep >= 4 ? 'hi' : ''}">${ep.toFixed(1)}</td>
        <td class="num">${p.form}</td>
        <td class="num">${p.total_points}</td>
        <td class="num">${p.points_per_game}</td>
        <td class="num">${p.expected_goals}</td>
        <td class="num">${p.expected_assists}</td>
        <td class="num">${p.expected_goal_involvements}</td>
        <td class="num">${p.defensive_contribution}</td>
        <td class="num">${p.minutes}</td>
        <td><div class="fdr-cell" style="flex-direction:row">${fixtureChips(p.team)}</div></td>
      </tr>`;
    })
    .join('');

  const teamOptions = state.bootstrap.teams
    .map((t) => `<option value="${t.id}" ${view.team == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input type="search" id="pl-search" placeholder="${t('common.searchPlayer')}" value="${escapeHtml(view.search)}" />
        <div class="seg" id="pl-pos">
          <button class="seg-btn ${view.position === 'all' ? 'on' : ''}" data-v="all">${t('common.all')}</button>
          ${state.bootstrap.element_types.map((et) => `<button class="seg-btn ${view.position == et.id ? 'on' : ''}" data-v="${et.id}">${posPlural(et.plural_name_short)}</button>`).join('')}
        </div>
        <select id="pl-team">
          <option value="all">${t('players.allTeams')}</option>
          ${teamOptions}
        </select>
        <input type="number" id="pl-price" placeholder="${t('common.maxPrice')}" step="0.5" min="3.5" max="16" style="width:90px" value="${view.maxPrice}" />
        <label class="chk"><input type="checkbox" id="pl-new" ${view.newOnly ? 'checked' : ''} /> ${t('players.newSignings')}</label>
        <span class="spacer"></span>
        <button class="link-btn" id="pl-csv" title="${t('players.exportTitle')}">${t('players.exportCsv')}</button>
        <span class="result-count">${t('players.count', { n: list.length })}${list.length > view.limit ? t('players.showingTop', { n: view.limit }) : ''}</span>
      </div>
      <div class="table-wrap" style="max-height: 70vh; overflow-y: auto;">
        <table class="data sticky-first">
          <thead><tr>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${list.length > view.limit ? `<div class="note" style="text-align:center"><button class="link-btn" id="pl-more">${t('players.showMore', { n: Math.min(100, list.length - view.limit) })}</button></div>` : ''}
    </div>`;

  root.querySelector('#pl-search').addEventListener('input', (e) => {
    view.search = e.target.value;
    view.limit = 100;
    renderPreservingFocus(root, '#pl-search');
  });
  root.querySelectorAll('#pl-pos .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { view.position = b.dataset.v; render(root); })
  );
  root.querySelector('#pl-team').addEventListener('change', (e) => { view.team = e.target.value; render(root); });
  root.querySelector('#pl-price').addEventListener('change', (e) => { view.maxPrice = e.target.value; render(root); });
  root.querySelector('#pl-new').addEventListener('change', (e) => { view.newOnly = e.target.checked; render(root); });
  root.querySelector('#pl-more')?.addEventListener('click', () => { view.limit += 100; render(root); });

  root.querySelector('#pl-csv').addEventListener('click', () => {
    const cols = ['web_name', 'position', 'team', 'now_cost', 'selected_by_percent', 'ep_next', 'form',
      'total_points', 'points_per_game', 'expected_goals', 'expected_assists',
      'expected_goal_involvements', 'defensive_contribution', 'minutes'];
    const header = 'name,pos,team,price,sel%,xp_next,form,pts,ppg,xg,xa,xgi,dc,min';
    const lines = filtered().map((p) => [
      `"${p.web_name.replace(/"/g, '""')}"`,
      state.positionsById[p.element_type].singular_name_short,
      state.teamsById[p.team].short_name,
      (p.now_cost / 10).toFixed(1),
      p.selected_by_percent, modelXp(p).toFixed(1), p.form, p.total_points, p.points_per_game,
      p.expected_goals, p.expected_assists, p.expected_goal_involvements,
      p.defensive_contribution, p.minutes,
    ].join(','));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'amitfpl-players.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  root.querySelectorAll('thead th[data-key]').forEach((th) => {
    const key = th.dataset.key;
    if (!key) return;
    th.addEventListener('click', () => {
      if (view.sortKey === key) {
        view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        view.sortKey = key;
        view.sortDir = key === 'web_name' ? 'asc' : 'desc';
      }
      render(root);
    });
  });
}

function renderPreservingFocus(root, selector) {
  const el = root.querySelector(selector);
  const pos = el ? el.selectionStart : null;
  render(root);
  const again = root.querySelector(selector);
  if (again) {
    again.focus();
    if (pos != null) again.setSelectionRange(pos, pos);
  }
}

export async function renderPlayers(root) {
  if (!model) {
    await loadBaseline();
    model = buildModel(1);
  }
  render(root);
}
