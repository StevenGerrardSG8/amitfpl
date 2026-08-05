import { getEntry, getPicks, fetchTeamSnapshot, fetchConfig } from './api.js';
import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { playerPhoto, teamBadge, fixtureDifficulty } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { t, haMark, gwLabel, posShort, playerName, teamShort } from './i18n.js';

let model = null;
const modelXp = (p) => (model ? model.xp(p.id, model.gws[0]) : num(p.ep_next));

const STORAGE_KEY = 'amitfpl:teamId';

const getTeamId = () => localStorage.getItem(STORAGE_KEY) || '';
const setTeamId = (id) => localStorage.setItem(STORAGE_KEY, id);
const clearTeamId = () => localStorage.removeItem(STORAGE_KEY);

function renderSetup(root, message = '') {
  root.innerHTML = `
    <div class="card myteam-setup">
      <h2>${t('myteam.connectTitle')}</h2>
      ${message ? `<div class="error-box">${escapeHtml(message)}</div>` : ''}
      <p>${t('myteam.intro')}</p>
      <ol>
        <li>${t('myteam.step1')}</li>
        <li>${t('myteam.step2')}</li>
        <li>${t('myteam.step3')}</li>
      </ol>
      <p class="note" style="padding:0">${t('myteam.preseason')}</p>
      <div class="id-row">
        <input type="text" id="mt-id" inputmode="numeric" placeholder="${t('myteam.placeholder')}" value="${escapeHtml(getTeamId())}" />
        <button class="btn" id="mt-save">${t('myteam.connect')}</button>
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
    ? `<span class="captain-badge" title="${t('common.captain')}">${t('badge.c')}</span>`
    : pick.is_vice_captain
      ? `<span class="captain-badge vice" title="${t('common.viceCaptain')}">${t('badge.v')}</span>`
      : '';
  const fx = (state.upcomingByTeam[p.team] || []).slice(0, 3)
    .map((f) => `<span class="fdr-chip fdr-${fixtureDifficulty(f)}">${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})</span>`)
    .join(' ') || '-';
  return `<tr>
    <td><div class="player-flex">
      ${playerPhoto(p, 'row-photo')}
      <div class="player-cell">
        <span class="player-name">${escapeHtml(playerName(p))}${cap}${flag}</span>
        <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${teamShort(team)}</span>
      </div>
    </div></td>
    <td><span class="pos-badge pos-${pos}">${posShort(pos)}</span></td>
    <td class="num">${fmtPrice(p.now_cost)}</td>
    <td class="num">${modelXp(p).toFixed(1)}</td>
    <td class="num">${p.form}</td>
    <td class="num">${p.event_points}</td>
    <td><div class="fdr-cell" style="flex-direction:row">${fx}</div></td>
  </tr>`;
}

export async function renderMyTeam(root) {
  if (!model) {
    await loadBaseline();
    model = buildModel(1);
  }
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

  root.innerHTML = `<div class="loading"><div class="spinner"></div><p>${t('myteam.loading')}</p></div>`;

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
        renderSetup(root, t('myteam.notFound', { id: teamId }));
      } else {
        renderSetup(root, t('myteam.noLive', { id: teamId }));
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
    { k: t('myteam.overallPts'), v: entry.summary_overall_points ?? '-' },
    { k: t('myteam.overallRank'), v: entry.summary_overall_rank?.toLocaleString() ?? '-' },
    { k: t('myteam.gwPts', { gw: gw != null ? gwLabel(gw) : '–' }), v: entry.summary_event_points ?? '-' },
    { k: t('myteam.teamValue'), v: entry.last_deadline_value ? fmtPrice(entry.last_deadline_value) : '-' },
    { k: t('myteam.inBank'), v: entry.last_deadline_bank != null ? fmtPrice(entry.last_deadline_bank) : '-' },
    { k: t('myteam.transfers'), v: entry.last_deadline_total_transfers ?? '-' },
  ];

  let squadHtml = '';
  if (picks?.picks?.length) {
    const starters = picks.picks.filter((p) => p.position <= 11);
    const bench = picks.picks.filter((p) => p.position > 11);
    squadHtml = `
      <div class="section-title">${t('myteam.squadGw', { gw: gwLabel(gw) })}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
            <th class="num no-sort">${t('common.price')}</th><th class="num no-sort" title="${t('common.xpNextTitle')}">${t('common.xpNext')}</th>
            <th class="num no-sort">${t('common.form')}</th><th class="num no-sort">${t('myteam.gwPtsCol')}</th><th class="no-sort">${t('common.next3')}</th>
          </tr></thead>
          <tbody>
            ${starters.map(pickRow).join('')}
            <tr class="bench-divider"><td colspan="7">${t('common.bench')}</td></tr>
            ${bench.map(pickRow).join('')}
          </tbody>
        </table>
      </div>`;
  } else {
    squadHtml = `<div class="note">${t('myteam.squadSoon')}</div>`;
  }

  root.innerHTML = `
    <div class="card">
      <div class="mt-header">
        <h2>${escapeHtml(entry.name)} <span class="player-meta" style="font-weight:500">· ${escapeHtml(entry.player_first_name)} ${escapeHtml(entry.player_last_name)}</span></h2>
        <button class="link-btn" id="mt-change">${t('myteam.changeId')}</button>
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
