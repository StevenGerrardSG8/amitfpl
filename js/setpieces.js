import { state, escapeHtml, statusInfo } from './state.js';
import { teamBadge, inlinePhoto } from './ui.js';

function takers(players, orderKey) {
  return players
    .filter((p) => p[orderKey] != null)
    .sort((a, b) => a[orderKey] - b[orderKey]);
}

function takerCell(list) {
  if (!list.length) return '<span class="sp-alt">-</span>';
  const [first, ...rest] = list;
  const alt = rest.length
    ? `<div class="sp-alt">then ${rest.slice(0, 2).map((p) => escapeHtml(p.web_name)).join(', ')}</div>`
    : '';
  const st = statusInfo(first);
  const flag = st ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>` : '';
  return `<div><span class="sp-primary clickable" data-pid="${first.id}">${inlinePhoto(first)} ${escapeHtml(first.web_name)}</span>${flag}${alt}</div>`;
}

export function renderSetPieces(root) {
  const byTeam = {};
  for (const p of state.bootstrap.elements) {
    (byTeam[p.team] = byTeam[p.team] || []).push(p);
  }

  const rows = state.bootstrap.teams
    .map((t) => {
      const squad = byTeam[t.id] || [];
      return `<tr>
        <td class="team-cell">${teamBadge(t.id)} ${escapeHtml(t.name)}</td>
        <td>${takerCell(takers(squad, 'penalties_order'))}</td>
        <td>${takerCell(takers(squad, 'direct_freekicks_order'))}</td>
        <td>${takerCell(takers(squad, 'corners_and_indirect_freekicks_order'))}</td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <span class="result-count">Official FPL scout data - first-choice taker, then backups. Updates as the season goes.</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">Team</th>
            <th class="no-sort">Penalties</th>
            <th class="no-sort">Direct free kicks</th>
            <th class="no-sort">Corners &amp; indirect FKs</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
