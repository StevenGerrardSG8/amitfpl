import { state, escapeHtml, statusInfo } from './state.js';
import { teamBadge, inlinePhoto, fixtureChips } from './ui.js';
import { t, playerName, teamName } from './i18n.js';

export function takers(players, orderKey) {
  return players
    .filter((p) => p[orderKey] != null)
    .sort((a, b) => a[orderKey] - b[orderKey]);
}

const flagOf = (p) => {
  const st = statusInfo(p);
  return st ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>` : '';
};

function takerCell(list) {
  if (!list.length) return '<span class="sp-alt">-</span>';
  // Highlight whoever could actually take it right now, not blindly the
  // API's nominal #1 - a first-choice taker who's injured, suspended or
  // out on loan (i/s/u/n) isn't walking onto the pitch to take it. The
  // skipped name still shows up in "then ..." below, with its own flag,
  // so nothing is hidden - just correctly not the headline pick.
  const primaryIdx = list.findIndex((p) => !['i', 's', 'u', 'n'].includes(p.status));
  const primary = primaryIdx === -1 ? list[0] : list[primaryIdx];
  const rest = list.filter((p) => p !== primary);
  const alt = rest.length
    ? `<div class="sp-alt">${t('sp.then', { names: rest.slice(0, 2).map((p) => `${escapeHtml(playerName(p))}${flagOf(p)}`).join(', ') })}</div>`
    : '';
  return `<div><span class="sp-primary clickable" data-pid="${primary.id}">${inlinePhoto(primary)} ${escapeHtml(playerName(primary))}</span>${flagOf(primary)}${alt}</div>`;
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
