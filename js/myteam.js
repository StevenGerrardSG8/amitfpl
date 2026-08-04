import { getEntry, getPicks, fetchTeamSnapshot, fetchConfig } from './api.js';
import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { playerPhoto, teamBadge } from './ui.js';

const STORAGE_KEY = 'amitfpl:teamId';

const getTeamId = () => localStorage.getItem(STORAGE_KEY) || '';
const setTeamId = (id) => localStorage.setItem(STORAGE_KEY, id);
const clearTeamId = () => localStorage.removeItem(STORAGE_KEY);

function renderSetup(root, message = '') {
  root.innerHTML = `
    <div class="card myteam-setup">
      <h2>Connect your FPL team</h2>
      ${message ? `<div class="error-box">${escapeHtml(message)}</div>` : ''}
      <p>All it takes is your <strong>Team ID</strong> - no password needed. To find it:</p>
      <ol>
        <li>Log in at <strong>fantasy.premierleague.com</strong></li>
        <li>Go to the <strong>Points</strong> page</li>
        <li>Look at the address bar: <code>…/entry/<strong>1234567</strong>/event/1</code> - that number is your Team ID</li>
      </ol>
      <p class="note" style="padding:0">Season hasn't started yet? Create your squad on the official site first, then come back here after the GW1 deadline - your ID appears once the season kicks off.</p>
      <div class="id-row">
        <input type="text" id="mt-id" inputmode="numeric" placeholder="e.g. 1234567" value="${escapeHtml(getTeamId())}" />
        <button class="btn" id="mt-save">Connect</button>
      </div>
    </div>`;

  const connect = () => {
    const id = root.querySelector('#mt-id').value.trim().replace(/\D/g, '');
    if (!id) return;
    setTeamId(id);
    renderMyTeam(root);
  };
  root.querySelector('#mt-save').addEventListener('click', connect);
  root.querySelector('#mt-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connect();
  });
}

function pickRow(pick) {
  const p = state.playersById[pick.element];
  if (!p) return '';
  const team = state.teamsById[p.team];
  const pos = state.positionsById[p.element_type].singular_name_short;
  const st = statusInfo(p);
  const flag = st
    ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>`
    : '';
  const cap = pick.is_captain
    ? '<span class="captain-badge" title="Captain">C</span>'
    : pick.is_vice_captain
      ? '<span class="captain-badge vice" title="Vice captain">V</span>'
      : '';
  const fx = (state.upcomingByTeam[p.team] || []).slice(0, 3)
    .map((f) => `<span class="fdr-chip fdr-${f.difficulty}">${state.teamsById[f.opponent].short_name} (${f.isHome ? 'H' : 'A'})</span>`)
    .join(' ') || '-';
  return `<tr>
    <td><div class="player-flex">
      ${playerPhoto(p, 'row-photo')}
      <div class="player-cell">
        <span class="player-name">${escapeHtml(p.web_name)}${cap}${flag}</span>
        <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${team.short_name}</span>
      </div>
    </div></td>
    <td><span class="pos-badge pos-${pos}">${pos}</span></td>
    <td class="num">${fmtPrice(p.now_cost)}</td>
    <td class="num">${num(p.ep_next).toFixed(1)}</td>
    <td class="num">${p.form}</td>
    <td class="num">${p.event_points}</td>
    <td><div class="fdr-cell" style="flex-direction:row">${fx}</div></td>
  </tr>`;
}

export async function renderMyTeam(root) {
  let teamId = getTeamId();
  if (!teamId) {
    // Fall back to the id configured in config.json (used by the
    // GitHub Action that snapshots the team every 30 min).
    const config = await fetchConfig();
    if (config.teamId) {
      teamId = String(config.teamId);
      setTeamId(teamId);
    } else {
      renderSetup(root);
      return;
    }
  }

  root.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading your team…</p></div>';

  // Snapshot first (works on GitHub Pages), live API as fallback
  // (works locally through dev-server.py's proxy).
  let entry = null;
  let picks = null;
  const snap = await fetchTeamSnapshot();
  if (snap?.entry && String(snap.entry.id) === teamId) {
    entry = snap.entry;
    picks = snap.picks;
  } else {
    try {
      entry = await getEntry(teamId);
    } catch (e) {
      if (e.status === 404) {
        clearTeamId();
        renderSetup(root, `Team ID ${teamId} was not found. Double-check the number and try again.`);
      } else {
        renderSetup(root,
          `Live team lookup isn't available on the hosted site. Set "teamId": ${teamId} in config.json ` +
          `in the GitHub repo - the data refresher will pick it up within 30 minutes.`);
      }
      return;
    }
  }

  const gw = entry.current_event ?? state.currentEvent?.id ?? null;
  if (gw && picks == null) {
    try {
      picks = await getPicks(teamId, gw);
    } catch { /* picks not available yet (pre-season or private) */ }
  }

  const stats = [
    { k: 'Overall points', v: entry.summary_overall_points ?? '-' },
    { k: 'Overall rank', v: entry.summary_overall_rank?.toLocaleString() ?? '-' },
    { k: `GW${gw ?? '–'} points`, v: entry.summary_event_points ?? '-' },
    { k: 'Team value', v: entry.last_deadline_value ? fmtPrice(entry.last_deadline_value) : '-' },
    { k: 'In the bank', v: entry.last_deadline_bank != null ? fmtPrice(entry.last_deadline_bank) : '-' },
    { k: 'Total transfers', v: entry.last_deadline_total_transfers ?? '-' },
  ];

  let squadHtml = '';
  if (picks?.picks?.length) {
    const starters = picks.picks.filter((p) => p.position <= 11);
    const bench = picks.picks.filter((p) => p.position > 11);
    squadHtml = `
      <div class="section-title">Squad - GW${gw}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">Player</th><th class="no-sort">Pos</th>
            <th class="num no-sort">Price</th><th class="num no-sort" title="FPL expected points, next GW">xP Next</th>
            <th class="num no-sort">Form</th><th class="num no-sort">GW Pts</th><th class="no-sort">Next 3</th>
          </tr></thead>
          <tbody>
            ${starters.map(pickRow).join('')}
            <tr class="bench-divider"><td colspan="7">Bench</td></tr>
            ${bench.map(pickRow).join('')}
          </tbody>
        </table>
      </div>`;
  } else {
    squadHtml = `<div class="note">Your squad will appear here once the season starts (picks are public after the GW1 deadline, Aug 21).</div>`;
  }

  root.innerHTML = `
    <div class="card">
      <div class="mt-header">
        <h2>${escapeHtml(entry.name)} <span class="player-meta" style="font-weight:500">· ${escapeHtml(entry.player_first_name)} ${escapeHtml(entry.player_last_name)}</span></h2>
        <button class="link-btn" id="mt-change">Change team ID</button>
      </div>
      <div class="summary-grid">
        ${stats.map((s) => `<div class="stat-tile"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join('')}
      </div>
      ${squadHtml}
    </div>`;

  root.querySelector('#mt-change').addEventListener('click', () => {
    clearTeamId();
    renderSetup(root);
  });
}
