import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { fixtureChips, playerPhoto, teamBadge, spBadges, isNewSigning } from './ui.js';

const COLUMNS = [
  { key: 'web_name', label: 'Player', numeric: false },
  { key: 'position', label: 'Pos', numeric: false },
  { key: 'now_cost', label: 'Price', numeric: true },
  { key: 'selected_by_percent', label: 'Sel %', numeric: true },
  { key: 'ep_next', label: 'xP Next', numeric: true, title: 'FPL expected points, next gameweek' },
  { key: 'form', label: 'Form', numeric: true },
  { key: 'total_points', label: 'Pts', numeric: true },
  { key: 'points_per_game', label: 'PPG', numeric: true },
  { key: 'expected_goals', label: 'xG', numeric: true },
  { key: 'expected_assists', label: 'xA', numeric: true },
  { key: 'expected_goal_involvements', label: 'xGI', numeric: true },
  { key: 'minutes', label: 'Min', numeric: true },
  { key: 'fixtures', label: 'Next 3', numeric: false, noSort: true },
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

function playerValue(p, key) {
  if (key === 'web_name') return p.web_name.toLowerCase();
  if (key === 'position') return p.element_type;
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
      const hay = `${p.first_name} ${p.second_name} ${p.web_name}`.toLowerCase();
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
    return `<th class="${cls}" data-key="${c.noSort ? '' : c.key}" title="${c.title || ''}">${c.label}${arrow}</th>`;
  }).join('');

  const rows = shown
    .map((p) => {
      const team = state.teamsById[p.team];
      const pos = state.positionsById[p.element_type].singular_name_short;
      const st = statusInfo(p);
      const flag = st
        ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>`
        : '';
      const ep = num(p.ep_next);
      return `<tr>
        <td><div class="player-flex">
          ${playerPhoto(p, 'row-photo')}
          <div class="player-cell">
            <span class="player-name">${escapeHtml(p.web_name)}${flag}${spBadges(p)}</span>
            <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${team.short_name}${isNewSigning(p) ? ' <span class="new-tag">NEW</span>' : ''}</span>
          </div>
        </div></td>
        <td><span class="pos-badge pos-${pos}">${pos}</span></td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td class="num">${p.selected_by_percent}%</td>
        <td class="num ${ep >= 4 ? 'hi' : ''}">${ep.toFixed(1)}</td>
        <td class="num">${p.form}</td>
        <td class="num">${p.total_points}</td>
        <td class="num">${p.points_per_game}</td>
        <td class="num">${p.expected_goals}</td>
        <td class="num">${p.expected_assists}</td>
        <td class="num">${p.expected_goal_involvements}</td>
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
        <input type="search" id="pl-search" placeholder="Search player…" value="${escapeHtml(view.search)}" />
        <select id="pl-pos">
          <option value="all">All positions</option>
          ${state.bootstrap.element_types.map((et) => `<option value="${et.id}" ${view.position == et.id ? 'selected' : ''}>${et.plural_name}</option>`).join('')}
        </select>
        <select id="pl-team">
          <option value="all">All teams</option>
          ${teamOptions}
        </select>
        <input type="number" id="pl-price" placeholder="Max £" step="0.5" min="3.5" max="16" style="width:90px" value="${view.maxPrice}" />
        <label class="chk"><input type="checkbox" id="pl-new" ${view.newOnly ? 'checked' : ''} /> 🆕 New signings</label>
        <span class="spacer"></span>
        <span class="result-count">${list.length} players${list.length > view.limit ? ` · showing top ${view.limit}` : ''}</span>
      </div>
      <div class="table-wrap" style="max-height: 70vh; overflow-y: auto;">
        <table class="data">
          <thead><tr>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${list.length > view.limit ? `<div class="note" style="text-align:center"><button class="link-btn" id="pl-more">Show ${Math.min(100, list.length - view.limit)} more</button></div>` : ''}
    </div>`;

  root.querySelector('#pl-search').addEventListener('input', (e) => {
    view.search = e.target.value;
    view.limit = 100;
    renderPreservingFocus(root, '#pl-search');
  });
  root.querySelector('#pl-pos').addEventListener('change', (e) => { view.position = e.target.value; render(root); });
  root.querySelector('#pl-team').addEventListener('change', (e) => { view.team = e.target.value; render(root); });
  root.querySelector('#pl-price').addEventListener('change', (e) => { view.maxPrice = e.target.value; render(root); });
  root.querySelector('#pl-new').addEventListener('change', (e) => { view.newOnly = e.target.checked; render(root); });
  root.querySelector('#pl-more')?.addEventListener('click', () => { view.limit += 100; render(root); });

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

export function renderPlayers(root) {
  render(root);
}
