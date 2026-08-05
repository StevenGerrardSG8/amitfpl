import { state, escapeHtml, statusInfo } from './state.js';
import { teamBadge, inlinePhoto, fixtureChips } from './ui.js';
import { t, playerName, teamName } from './i18n.js';

function takers(players, orderKey) {
  return players
    .filter((p) => p[orderKey] != null)
    .sort((a, b) => a[orderKey] - b[orderKey]);
}

function takerCell(list) {
  if (!list.length) return '<span class="sp-alt">-</span>';
  const [first, ...rest] = list;
  const alt = rest.length
    ? `<div class="sp-alt">${t('sp.then', { names: rest.slice(0, 2).map((p) => escapeHtml(playerName(p))).join(', ') })}</div>`
    : '';
  const st = statusInfo(first);
  const flag = st ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>` : '';
  return `<div><span class="sp-primary clickable" data-pid="${first.id}">${inlinePhoto(first)} ${escapeHtml(playerName(first))}</span>${flag}${alt}</div>`;
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
        <td class="team-cell">${teamBadge(t.id)} ${escapeHtml(teamName(t))}</td>
        <td>${takerCell(takers(squad, 'penalties_order'))}</td>
        <td>${takerCell(takers(squad, 'direct_freekicks_order'))}</td>
        <td>${takerCell(takers(squad, 'corners_and_indirect_freekicks_order'))}</td>
        <td><div class="fdr-cell" style="flex-direction:row">${fixtureChips(t.id, 1)}</div></td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <span class="result-count">${t('sp.blurb')}</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.team')}</th>
            <th class="no-sort">${t('sp.penalties')}</th>
            <th class="no-sort">${t('sp.freeKicks')}</th>
            <th class="no-sort">${t('sp.corners')}</th>
            <th class="no-sort">${t('common.next')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
