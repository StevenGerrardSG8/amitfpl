import { getEntry, getPicks, fetchTeamSnapshot, fetchConfig } from './api.js';
import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { playerPhoto, teamBadge, fixtureDifficulty } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { importSquad } from './planner.js';
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

// Live per-player GW points: proxy first (local dev), snapshot second
// (hosted; refreshed every 30 min by the Action). Returns {id: [min, pts]}.
async function fetchLive(gw) {
  for (const url of [`/api/fpl/event/${gw}/live/`, 'data/live.json']) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (url.endsWith('live.json')) {
        if (data?.gw !== gw) return null;
        return data.e || null;
      }
      const map = {};
      for (const el of data.elements || []) {
        map[el.id] = [el.stats?.minutes || 0, el.stats?.total_points || 0];
      }
      return map;
    } catch { /* try next source */ }
  }
  return null;
}

async function fetchLeagues() {
  try {
    const res = await fetch('data/leagues.json');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// League standings tables (from the Action's snapshot); falls back to a
// simple list of the entry's private leagues when no snapshot exists.
function leaguesHtml(entry, leagues, teamId) {
  const mine = ((entry.leagues || {}).classic || []).filter((l) => l.league_type === 'x');
  if (!mine.length && !leagues?.length) return '';
  if (leagues?.length) {
    return leagues.map((lg) => `
      <div class="section-title">${t('myteam.leagues')} · ${escapeHtml(lg.name)}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th class="num no-sort">${t('myteam.leagueRank')}</th><th class="no-sort">${t('myteam.leagueTeam')}</th>
          <th class="no-sort">${t('myteam.leagueManager')}</th><th class="num no-sort">${t('common.gw')}</th>
          <th class="num no-sort">${t('myteam.leagueTotal')}</th>
        </tr></thead>
        <tbody>${(lg.standings || []).map((r) => `
          <tr class="${String(r.entry) === String(teamId) ? 'league-me' : ''}">
            <td class="num">${r.rank}${r.last_rank && r.last_rank !== r.rank ? (r.rank < r.last_rank ? ' <span class="hi">▲</span>' : ' <span class="lo">▼</span>') : ''}</td>
            <td style="font-weight:600">${escapeHtml(r.entry_name)}</td>
            <td class="muted">${escapeHtml(r.player_name)}</td>
            <td class="num">${r.event_total ?? '-'}</td>
            <td class="num" style="font-weight:700">${r.total}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`).join('');
  }
  return `
    <div class="section-title">${t('myteam.leagues')}</div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th class="no-sort">${t('myteam.leagueName')}</th><th class="num no-sort">${t('myteam.leagueRank')}</th></tr></thead>
      <tbody>${mine.map((l) => `<tr><td style="font-weight:600">${escapeHtml(l.name)}</td><td class="num">${l.entry_rank ?? '-'}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

function pickRow(pick, live) {
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
    <td class="num">${live?.[p.id]
      ? `<span class="hi" title="${live[p.id][0]}${t('myteam.liveMin')}">${live[p.id][1]}${pick.multiplier > 1 ? `<span class="muted">×${pick.multiplier}</span>` : ''}</span>`
      : p.event_points}</td>
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

  // Live points while the GW is running (games in progress).
  let live = null;
  if (gw && state.currentEvent?.id === gw && !state.currentEvent.finished) {
    live = await fetchLive(gw);
  }
  const liveTotal = live && picks?.picks?.length
    ? picks.picks.reduce((s, pk) => s + (live[pk.element]?.[1] || 0) * pk.multiplier, 0)
    : null;
  const leagues = await fetchLeagues();

  const stats = [
    { k: t('myteam.overallPts'), v: entry.summary_overall_points ?? '-' },
    { k: t('myteam.overallRank'), v: entry.summary_overall_rank?.toLocaleString() ?? '-' },
    liveTotal != null
      ? { k: `🔴 ${t('myteam.livePts', { gw: gwLabel(gw) })}`, v: liveTotal, live: true }
      : { k: t('myteam.gwPts', { gw: gw != null ? gwLabel(gw) : '–' }), v: entry.summary_event_points ?? '-' },
    { k: t('myteam.teamValue'), v: entry.last_deadline_value ? fmtPrice(entry.last_deadline_value) : '-' },
    { k: t('myteam.inBank'), v: entry.last_deadline_bank != null ? fmtPrice(entry.last_deadline_bank) : '-' },
    { k: t('myteam.transfers'), v: entry.last_deadline_total_transfers ?? '-' },
  ];

  let squadHtml = '';
  if (picks?.picks?.length) {
    const starters = picks.picks.filter((p) => p.position <= 11);
    const bench = picks.picks.filter((p) => p.position > 11);
    squadHtml = `
      <div class="section-title">${t('myteam.squadGw', { gw: gwLabel(gw) })}
        <button class="link-btn" id="mt-import" title="${t('myteam.importTitle')}">${t('myteam.import')}</button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
            <th class="num no-sort">${t('common.price')}</th><th class="num no-sort" title="${t('common.xpNextTitle')}">${t('common.xpNext')}</th>
            <th class="num no-sort">${t('common.form')}</th><th class="num no-sort">${t('myteam.gwPtsCol')}</th><th class="no-sort">${t('common.next3')}</th>
          </tr></thead>
          <tbody>
            ${starters.map((pk) => pickRow(pk, live)).join('')}
            <tr class="bench-divider"><td colspan="7">${t('common.bench')}</td></tr>
            ${bench.map((pk) => pickRow(pk, live)).join('')}
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
        ${stats.map((s) => `<div class="stat-tile ${s.live ? 'live' : ''}"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join('')}
      </div>
      ${squadHtml}
      ${leaguesHtml(entry, leagues, teamId)}
    </div>`;

  root.querySelector('#mt-change').addEventListener('click', () => {
    clearTeamId();
    renderSetup(root);
  });

  // One click copies the real squad into the planner's active draft.
  root.querySelector('#mt-import')?.addEventListener('click', () => {
    importSquad({
      squad: picks.picks.map((x) => x.element),
      starters: picks.picks.filter((x) => x.position <= 11).map((x) => x.element),
      captain: picks.picks.find((x) => x.is_captain)?.element || null,
    });
    document.querySelector('.tab[data-tab="planner"]')?.click();
  });
}
