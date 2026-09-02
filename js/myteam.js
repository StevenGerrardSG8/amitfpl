import { getEntry, getPicks, fetchTeamSnapshot, fetchConfig } from './api.js';
import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { playerPhoto, teamBadge, fixtureDifficulty, infoNote } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { importSquad } from './planner.js';
import { analyzeSquad, analysisHtml } from './analyze.js';
import { t, haMark, gwLabel, posShort, playerName, teamShort } from './i18n.js';

let model = null;
// xpNext(), not xp(gws[0]): mid-gameweek, a squad member whose fixture
// already kicked off has nothing left in the shared "current" event even
// though he clearly has a real next match the following week - see
// model.js's xpNext() for why this needs its own per-player resolution.
const modelXp = (p) => (model ? model.xpNext(p.id) : num(p.ep_next));

const STORAGE_KEY = 'amitfpl:teamId';
const MANUAL_KEY = 'amitfpl:manualSquad';

// getEntry/getPicks only resolve through dev-server.py's /api/fpl proxy,
// which only runs locally - on the hosted site every lookup 404s
// regardless of whether the ID is real, so a 404 there must not be
// read as "bad ID."
const hasLiveProxy = () => ['localhost', '127.0.0.1'].includes(location.hostname);

const getTeamId = () => localStorage.getItem(STORAGE_KEY) || '';
const setTeamId = (id) => localStorage.setItem(STORAGE_KEY, id);
const clearTeamId = () => localStorage.removeItem(STORAGE_KEY);

function getManual() {
  try {
    const ids = JSON.parse(localStorage.getItem(MANUAL_KEY));
    return Array.isArray(ids) ? ids.filter((id) => state.playersById[id]) : [];
  } catch {
    return [];
  }
}
const setManual = (ids) => localStorage.setItem(MANUAL_KEY, JSON.stringify(ids));

// Loading placeholder for the AI squad-analysis card - identical for
// a manually-picked squad and a connected team.
const analysisPlaceholderHtml = () => `
  <div class="an-card" id="mt-analysis">
    <div class="skel skel-block" style="height:120px"></div>
  </div>`;

// The squad table's header is the same 7 columns whether the squad
// came from manual entry or a connected team - only the rows differ.
const squadTableHtml = (rowsHtml) => `
  <div class="table-wrap">
    <table class="data">
      <thead><tr>
        <th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
        <th class="num no-sort">${t('common.price')}</th><th class="num no-sort" title="${t('common.xpNextTitle')}">${t('common.xpNext')}</th>
        <th class="num no-sort">${t('common.form')}</th><th class="num no-sort">${t('myteam.gwPtsCol')}</th><th class="no-sort">${t('common.next3')}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;

function renderSetup(root, message = '') {
  root.innerHTML = `
    <div class="card myteam-setup">
      <h2>${t('mp.title')}</h2>
      ${message ? `<div class="error-box">${escapeHtml(message)}</div>` : ''}
      <p>${t('mp.lead')}</p>
      <button class="btn" id="mt-manual">${t('mp.start')}</button>
      <div class="mt-or">${t('mp.or')}</div>
      <div class="section-title" style="padding:0">${t('myteam.connectTitle')}</div>
      <p>${t('myteam.intro')}</p>
      <ol>
        <li>${t('myteam.step1')}</li>
        <li>${t('myteam.step2')}</li>
        <li>${t('myteam.step3')}</li>
      </ol>
      <p class="note" style="padding:0">${t('myteam.preseason')}</p>
      <div class="id-row">
        <input type="text" id="mt-id" inputmode="numeric" placeholder="${t('myteam.placeholder')}" value="${escapeHtml(getTeamId())}" />
        <button class="btn ghost" id="mt-save">${t('myteam.connect')}</button>
      </div>
    </div>`;

  root.querySelector('#mt-manual').addEventListener('click', () => renderManualPicker(root));
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

/* ---------------- manual squad: the simple upload path ----------------
   Type a name, tap to add, analyze - no team id, works pre-season. */

const MP_QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 };

// Whether My Team can actually render an analysis right now - a
// connected team ID, or a manual squad that's actually complete (not
// just "something was picked before the user hit Back").
export function hasConnectedSquad() {
  return !!getTeamId() || manualReady(getManual());
}

// Enough players to form a legal XI - the analysis can run from here.
function manualReady(ids) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const id of ids) c[state.playersById[id].element_type]++;
  return ids.length >= 11 && c[1] >= 1 && c[2] >= 3 && c[3] >= 2 && c[4] >= 1;
}

function renderManualPicker(root, sel = getManual(), query = '') {
  const posC = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const clubC = {};
  for (const id of sel) {
    const p = state.playersById[id];
    posC[p.element_type]++;
    clubC[p.team] = (clubC[p.team] || 0) + 1;
  }

  const q = query.trim().toLowerCase();
  const matches = q.length < 2 ? [] : state.bootstrap.elements
    .filter((p) => p.status !== 'u' && !sel.includes(p.id))
    .filter((p) =>
      playerName(p).toLowerCase().includes(q) ||
      p.web_name.toLowerCase().includes(q) ||
      teamShort(state.teamsById[p.team]).toLowerCase().includes(q))
    .sort((a, b) => parseFloat(b.selected_by_percent || 0) - parseFloat(a.selected_by_percent || 0))
    .slice(0, 8);

  const rowsHtml = matches.map((p) => {
    const pos = state.positionsById[p.element_type].singular_name_short;
    const full = posC[p.element_type] >= MP_QUOTA[p.element_type] || (clubC[p.team] || 0) >= 3;
    return `<button class="mp-row" data-add="${p.id}" ${full ? 'disabled' : ''}>
      <span class="mp-name">${escapeHtml(playerName(p))}</span>
      <span class="mp-meta"><span class="pos-badge pos-${pos}">${posShort(pos)}</span> ${teamShort(state.teamsById[p.team])} · ${fmtPrice(p.now_cost)}</span>
      <span class="mp-add">${full ? '·' : '+'}</span>
    </button>`;
  }).join('');

  const selHtml = [1, 2, 3, 4].map((pos) => {
    const chips = sel
      .filter((id) => state.playersById[id].element_type === pos)
      .map((id) => `<button class="mp-chip" data-del="${id}">${escapeHtml(playerName(state.playersById[id]))} ✕</button>`)
      .join('');
    const label = posShort(state.positionsById[pos].singular_name_short);
    return `<div class="mp-sel-row"><span class="an-xi-pos">${label}</span>${chips || `<span class="mp-empty">–</span>`}<span class="mp-quota">${posC[pos]}/${MP_QUOTA[pos]}</span></div>`;
  }).join('');

  const ready = manualReady(sel);
  root.innerHTML = `
    <div class="card myteam-setup">
      <h2>${t('mp.title')}</h2>
      <p>${t('mp.sub')}</p>
      <input type="text" id="mp-search" placeholder="${t('mp.searchPh')}" value="${escapeHtml(query)}" autocomplete="off" />
      <div class="mp-results">${rowsHtml}</div>
      <div class="mp-selected">${selHtml}</div>
      <div class="id-row" style="margin-top:14px">
        <button class="btn" id="mp-analyze" ${ready ? '' : 'disabled'}>${t('mp.analyze')}</button>
        <span class="note" style="padding:0">${ready ? t('mp.count', { n: sel.length }) : t('mp.need')}</span>
        <span class="spacer"></span>
        <button class="link-btn" id="mp-back">${t('mp.back')}</button>
      </div>
    </div>`;

  const input = root.querySelector('#mp-search');
  const redraw = (nextSel, nextQ) => {
    renderManualPicker(root, nextSel, nextQ);
    const el = root.querySelector('#mp-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };
  input.addEventListener('input', () => redraw(sel, input.value));
  root.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => redraw([...sel, +b.dataset.add], '')));
  root.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => redraw(sel.filter((id) => id !== +b.dataset.del), query)));
  root.querySelector('#mp-analyze').addEventListener('click', () => {
    setManual(sel);
    renderMyTeam(root);
  });
  root.querySelector('#mp-back').addEventListener('click', () => {
    if (sel.length) setManual(sel);
    renderSetup(root);
  });
}

// A manually entered squad gets the same analysis card and squad table
// as a connected team - just without the account stats and leagues.
function renderManualAnalysis(root) {
  const ids = getManual();
  const model5sorted = [...ids].sort((a, b) => {
    const pa = state.playersById[a];
    const pb = state.playersById[b];
    return pa.element_type - pb.element_type || pb.now_cost - pa.now_cost;
  });
  root.innerHTML = `
    <div class="card">
      <div class="mt-header">
        <h2>${t('mm.title')}</h2>
        <span style="display:flex;gap:12px">
          <button class="link-btn" id="mm-edit">${t('mm.edit')}</button>
          <button class="link-btn" id="mm-connect">${t('mm.connect')}</button>
        </span>
      </div>
      ${analysisPlaceholderHtml()}
      <div class="section-title">${t('mm.squad')} ${infoNote('info.model')}</div>
      ${squadTableHtml(model5sorted.map((id) => pickRow({ element: id, multiplier: 1 }, null)).join(''))}
    </div>`;

  root.querySelector('#mm-edit').addEventListener('click', () => renderManualPicker(root));
  root.querySelector('#mm-connect').addEventListener('click', () => renderSetup(root));

  analyzeSquad({ squad: ids, starters: [], captain: null, bank: 0 })
    .then((a) => {
      const mount = root.querySelector('#mt-analysis');
      if (mount) mount.innerHTML = analysisHtml(a);
    })
    .catch(() => root.querySelector('#mt-analysis')?.remove());
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

// The snapshot is generated for one team (config.json's teamId) - only
// use it when it actually belongs to the team currently connected in
// this browser, otherwise a differently-connected team would see
// somebody else's private league standings under "My leagues".
async function fetchLeagues(teamId) {
  try {
    const res = await fetch('data/leagues.json');
    if (!res.ok) return null;
    const data = await res.json();
    return data && String(data.teamId) === String(teamId) ? data.leagues : null;
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
    } else if (manualReady(getManual())) {
      renderManualAnalysis(root);
      return;
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
      if (hasLiveProxy() && e.status === 404) {
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
  const leagues = await fetchLeagues(teamId);

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
    squadHtml = analysisPlaceholderHtml();
    squadHtml += `
      <div class="section-title">${t('myteam.squadGw', { gw: gwLabel(gw ?? state.nextEvent?.id) })} ${infoNote('info.model')}
        <button class="link-btn" id="mt-import" title="${t('myteam.importTitle')}">${t('myteam.import')}</button>
      </div>
      ${squadTableHtml(`
        ${starters.map((pk) => pickRow(pk, live)).join('')}
        <tr class="bench-divider"><td colspan="7">${t('common.bench')}</td></tr>
        ${bench.map((pk) => pickRow(pk, live)).join('')}
      `)}`;
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

  // The AI read of the squad - fills in async so the page never waits.
  const anMount = root.querySelector('#mt-analysis');
  if (anMount) {
    analyzeSquad({
      squad: picks.picks.map((x) => x.element),
      starters: picks.picks.filter((x) => x.position <= 11).map((x) => x.element),
      captain: picks.picks.find((x) => x.is_captain)?.element || null,
      bank: entry.last_deadline_bank || 0,
    }).then((a) => {
      anMount.innerHTML = analysisHtml(a);
    }).catch(() => anMount.remove());
  }
}
