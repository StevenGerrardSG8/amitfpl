// Market tab: price changes and transfer momentum.
import { state, fmtPrice, num } from './state.js';
import { fixtureChips, posBadge, playerCell, signed, fmtCount } from './ui.js';
import { t } from './i18n.js';

const COLUMNS = [
  { key: 'web_name', label: () => t('common.player'), numeric: false },
  { key: 'position', label: () => t('common.pos'), numeric: false },
  { key: 'now_cost', label: () => t('common.price'), numeric: true },
  { key: 'cost_change_event', label: () => t('market.dGw'), numeric: true, title: () => t('market.dGwTitle') },
  { key: 'cost_change_start', label: () => t('market.dSeason'), numeric: true, title: () => t('market.dSeasonTitle') },
  { key: 'transfers_in_event', label: () => t('market.in'), numeric: true, title: () => t('market.inTitle') },
  { key: 'transfers_out_event', label: () => t('market.out'), numeric: true, title: () => t('market.outTitle') },
  { key: 'net_event', label: () => t('market.net'), numeric: true, title: () => t('market.netTitle') },
  { key: 'selected_by_percent', label: () => t('common.sel'), numeric: true },
];

const view = { sortKey: 'transfers_in_event', sortDir: 'desc', limit: 50 };
try { Object.assign(view, JSON.parse(localStorage.getItem('amitfpl:market:sort')) || {}); } catch { /* defaults */ }
const saveSort = () => { try { localStorage.setItem('amitfpl:market:sort', JSON.stringify({ sortKey: view.sortKey, sortDir: view.sortDir })); } catch { /* private mode */ } };

let trendsCache;
async function fetchTrends() {
  if (trendsCache !== undefined) return trendsCache;
  try {
    const res = await fetch('data/trends.json');
    trendsCache = res.ok ? await res.json() : null;
  } catch {
    trendsCache = null;
  }
  return trendsCache;
}

// Movement since we started sampling daily (price in £, ownership in pp).
function moversCard(trends) {
  if (!trends) return '';
  const days = Object.keys(trends).sort();
  if (days.length < 2) {
    return `<div class="card" style="margin-bottom:16px">
      <div class="section-title">${t('market.movers')}</div>
      <div class="note">${t('market.trackingNote', { date: days[0] || t('market.today') })}</div>
    </div>`;
  }
  const first = trends[days[0]];
  const last = trends[days[days.length - 1]];
  const moves = [];
  for (const id of Object.keys(last)) {
    if (!first[id]) continue;
    const p = state.playersById[+id];
    if (!p) continue;
    moves.push({
      p,
      dPrice: (last[id][0] - first[id][0]) / 10,
      dOwn: (parseFloat(last[id][1]) || 0) - (parseFloat(first[id][1]) || 0),
    });
  }
  const row = (m, val) => `<tr><td>${playerCell(m.p)}</td><td class="num">${val}</td></tr>`;
  const priceMoves = moves.filter((m) => m.dPrice !== 0).sort((a, b) => b.dPrice - a.dPrice);
  const ownMoves = [...moves].sort((a, b) => b.dOwn - a.dOwn);
  const section = (title, rows) => `<div>
    <div class="section-title" style="padding-inline-start:0">${title}</div>
    <table class="data">${rows || `<tr><td class="note">${t('market.noneYet')}</td></tr>`}</table>
  </div>`;
  return `<div class="card" style="margin-bottom:16px">
    <div class="toolbar" style="border-bottom:none;padding-bottom:0">
      <span class="section-title" style="padding:0">${t('market.moversSince', { date: days[0] })}</span>
    </div>
    <div class="trend-grid" style="padding:4px 16px 14px">
      ${section(t('market.priceRisers'), priceMoves.slice(0, 5).map((m) => row(m, signed(m.dPrice, 1))).join(''))}
      ${section(t('market.priceFallers'), priceMoves.slice(-5).reverse().filter((m) => m.dPrice < 0).map((m) => row(m, signed(m.dPrice, 1))).join(''))}
      ${section(t('market.ownClimbers'), ownMoves.slice(0, 5).map((m) => row(m, signed(m.dOwn, 1, 'pp'))).join(''))}
      ${section(t('market.ownDrops'), ownMoves.slice(-5).reverse().filter((m) => m.dOwn < 0).map((m) => row(m, signed(m.dOwn, 1, 'pp'))).join(''))}
    </div>
  </div>`;
}

function val(p, key) {
  if (key === 'web_name') return p.web_name.toLowerCase();
  if (key === 'position') return p.element_type;
  if (key === 'net_event') return p.transfers_in_event - p.transfers_out_event;
  const raw = p[key];
  return typeof raw === 'number' ? raw : num(raw);
}

export async function renderMarket(root) {
  const trends = await fetchTrends();
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
    return `<th class="${c.numeric ? 'num' : ''} ${sorted ? 'sorted' : ''}" data-key="${c.key}" title="${c.title ? c.title() : ''}">${c.label()}${arrow}</th>`;
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
    ${moversCard(trends)}
    <div class="card">
      <div class="toolbar">
        <span class="result-count">${t('market.blurb')}</span>
        ${anyMovement ? '' : `<span class="spacer"></span><span class="result-count">${t('market.allZeros')}</span>`}
      </div>
      <div class="table-wrap" style="max-height: 75vh; overflow-y: auto;">
        <table class="data">
          <thead><tr>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${list.length > view.limit ? `<div class="note" style="text-align:center"><button class="link-btn" id="mk-more">${t('common.showMore')}</button></div>` : ''}
    </div>`;

  root.querySelectorAll('thead th[data-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (view.sortKey === key) view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
      else { view.sortKey = key; view.sortDir = key === 'web_name' ? 'asc' : 'desc'; }
      saveSort();
      renderMarket(root);
    });
  });
  root.querySelector('#mk-more')?.addEventListener('click', () => {
    view.limit += 50;
    renderMarket(root);
  });
}
