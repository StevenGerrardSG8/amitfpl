// Market tab: price changes and transfer momentum.
import { state, fmtPrice, num } from './state.js';
import { fixtureChips, posBadge, playerCell, signed, fmtCount } from './ui.js';

const COLUMNS = [
  { key: 'web_name', label: 'Player', numeric: false },
  { key: 'position', label: 'Pos', numeric: false },
  { key: 'now_cost', label: 'Price', numeric: true },
  { key: 'cost_change_event', label: 'Δ GW', numeric: true, title: 'Price change this gameweek' },
  { key: 'cost_change_start', label: 'Δ Season', numeric: true, title: 'Price change since season start' },
  { key: 'transfers_in_event', label: 'In (GW)', numeric: true, title: 'Transfers in this gameweek' },
  { key: 'transfers_out_event', label: 'Out (GW)', numeric: true, title: 'Transfers out this gameweek' },
  { key: 'net_event', label: 'Net', numeric: true, title: 'Net transfers this gameweek' },
  { key: 'selected_by_percent', label: 'Sel %', numeric: true },
];

const view = { sortKey: 'transfers_in_event', sortDir: 'desc', limit: 50 };

function val(p, key) {
  if (key === 'web_name') return p.web_name.toLowerCase();
  if (key === 'position') return p.element_type;
  if (key === 'net_event') return p.transfers_in_event - p.transfers_out_event;
  const raw = p[key];
  return typeof raw === 'number' ? raw : num(raw);
}

export function renderMarket(root) {
  const els = state.bootstrap.elements;
  const dir = view.sortDir === 'asc' ? 1 : -1;
  const list = [...els].sort((a, b) => {
    const va = val(a, view.sortKey);
    const vb = val(b, view.sortKey);
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  const shown = list.slice(0, view.limit);

  const anyMovement = els.some(
    (p) => p.cost_change_event || p.transfers_in_event || p.transfers_out_event
  );

  const header = COLUMNS.map((c) => {
    const sorted = view.sortKey === c.key;
    const arrow = sorted ? `<span class="arrow">${view.sortDir === 'asc' ? '▲' : '▼'}</span>` : '';
    return `<th class="${c.numeric ? 'num' : ''} ${sorted ? 'sorted' : ''}" data-key="${c.key}" title="${c.title || ''}">${c.label}${arrow}</th>`;
  }).join('');

  const rows = shown
    .map((p) => `<tr>
      <td>${playerCell(p)}</td>
      <td>${posBadge(p)}</td>
      <td class="num">${fmtPrice(p.now_cost)}</td>
      <td class="num">${signed(p.cost_change_event / 10)}</td>
      <td class="num">${signed(p.cost_change_start / 10)}</td>
      <td class="num">${fmtCount(p.transfers_in_event)}</td>
      <td class="num">${fmtCount(p.transfers_out_event)}</td>
      <td class="num">${signed(p.transfers_in_event - p.transfers_out_event, 0)}</td>
      <td class="num">${p.selected_by_percent}%</td>
    </tr>`)
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <span class="result-count">Price moves and transfer momentum - spot rises before they happen. Click headers to sort.</span>
        ${anyMovement ? '' : '<span class="spacer"></span><span class="result-count">⏳ All zeros for now - this comes alive once the season starts.</span>'}
      </div>
      <div class="table-wrap" style="max-height: 75vh; overflow-y: auto;">
        <table class="data">
          <thead><tr>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${list.length > view.limit ? `<div class="note" style="text-align:center"><button class="link-btn" id="mk-more">Show more</button></div>` : ''}
    </div>`;

  root.querySelectorAll('thead th[data-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (view.sortKey === key) view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
      else { view.sortKey = key; view.sortDir = key === 'web_name' ? 'asc' : 'desc'; }
      renderMarket(root);
    });
  });
  root.querySelector('#mk-more')?.addEventListener('click', () => {
    view.limit += 50;
    renderMarket(root);
  });
}
