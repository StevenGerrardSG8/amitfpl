import { state, escapeHtml } from './state.js';
import { teamBadge, fixtureDifficulty } from './ui.js';
import { teamForecast } from './model.js';

const view = { horizon: 6, sortByEase: true, forecastGw: null };

function forecastCard() {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const gws = [];
  for (let e = fromEvent; e < fromEvent + 6 && e <= 38; e++) gws.push(e);
  const gw = view.forecastGw && gws.includes(view.forecastGw) ? view.forecastGw : gws[0];

  const forecast = teamForecast(gw);
  // Shootout watch: matches with the highest combined expected goals.
  const xgByTeam = Object.fromEntries(forecast.map((r) => [r.team.id, r.xg]));
  const shootouts = forecast
    .filter((r) => r.isHome)
    .map((r) => ({ ...r, total: r.xg + (xgByTeam[r.opp.id] || 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((r) => `<span class="fdr-chip fdr-3" title="Combined expected goals">
      ${teamBadge(r.team.id, 'chip-badge')}${r.team.short_name} - ${teamBadge(r.opp.id, 'chip-badge')}${r.opp.short_name}
      <strong>${r.total.toFixed(1)}</strong></span>`)
    .join(' ');

  const rows = forecast
    .map(({ team, opp, isHome, xg, cs }) => {
      const csPct = Math.round(cs * 100);
      return `<tr>
        <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(team.name)}</td>
        <td>${teamBadge(opp.id, 'meta-badge')} ${escapeHtml(opp.short_name)} (${isHome ? 'H' : 'A'})</td>
        <td class="num"><span class="xg-pill">${xg.toFixed(2)}</span></td>
        <td class="num"><span class="cs-pill ${csPct >= 40 ? 'cs-hi' : csPct <= 20 ? 'cs-lo' : ''}">${csPct}%</span></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <span class="section-title" style="padding:0">Goals &amp; clean sheet forecast</span>
        <select id="fx-fc-gw">
          ${gws.map((e) => `<option value="${e}" ${e === gw ? 'selected' : ''}>GW${e}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="result-count">amitfpl model · sorted by expected goals</span>
      </div>
      ${shootouts ? `<div class="toolbar" style="border-bottom:none;padding-top:0"><span class="chips-label">Shootout watch</span> ${shootouts}</div>` : ''}
      <div class="table-wrap" style="max-height:50vh;overflow-y:auto">
        <table class="data">
          <thead><tr>
            <th class="no-sort">Team</th><th class="no-sort">Fixture</th>
            <th class="num no-sort" title="Expected goals scored">Goals</th>
            <th class="num no-sort" title="Clean sheet probability">Clean sheet</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// GWs where teams have no fixture (blank) or two+ (double) - chip fuel.
function blanksDoublesCard() {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const counts = {};
  for (const t of state.bootstrap.teams) {
    counts[t.id] = {};
    for (const f of state.upcomingByTeam[t.id] || []) {
      counts[t.id][f.event] = (counts[t.id][f.event] || 0) + 1;
    }
  }
  const rows = [];
  for (let e = fromEvent; e <= 38; e++) {
    const blanks = [];
    const doubles = [];
    for (const t of state.bootstrap.teams) {
      const c = counts[t.id][e] || 0;
      if (c === 0) blanks.push(t);
      if (c >= 2) doubles.push({ t, c });
    }
    // A GW where nobody plays isn't scheduled yet - skip the noise.
    if (blanks.length >= state.bootstrap.teams.length) continue;
    if (blanks.length || doubles.length) {
      rows.push(`<tr>
        <td class="team-cell">GW${e}</td>
        <td>${doubles.length ? doubles.map(({ t, c }) => `<span class="fdr-chip fdr-1">${teamBadge(t.id, 'chip-badge')}${t.short_name} ×${c}</span>`).join(' ') : '<span class="muted">-</span>'}</td>
        <td>${blanks.length ? blanks.map((t) => `<span class="fdr-chip fdr-blank">${teamBadge(t.id, 'chip-badge')}${t.short_name}</span>`).join(' ') : '<span class="muted">-</span>'}</td>
      </tr>`);
    }
  }
  return `
    <div class="card" style="margin-top:16px">
      <div class="section-title">Blanks &amp; doubles - chip planning radar</div>
      <div class="table-wrap" style="max-height:40vh;overflow-y:auto">
        <table class="data">
          <thead><tr><th class="no-sort">GW</th><th class="no-sort">Double gameweek</th><th class="no-sort">Blank gameweek</th></tr></thead>
          <tbody>${rows.join('') || '<tr><td colspan="3" class="note">None detected yet - blanks and doubles usually appear mid-season when cup games force postponements.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// Teams whose schedule flips difficulty after the next 3 GWs.
function swingsCard() {
  const scored = state.bootstrap.teams.map((t) => {
    const byGw = {};
    for (const f of state.upcomingByTeam[t.id] || []) {
      (byGw[f.event] = byGw[f.event] || []).push(fixtureDifficulty(f));
    }
    const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
    const avg = (a, b) => {
      let s = 0;
      let n = 0;
      for (let e = fromEvent + a; e < fromEvent + b && e <= 38; e++) {
        const ds = byGw[e] || [5];
        for (const d of ds) { s += d; n++; }
      }
      return n ? s / n : 5;
    };
    const early = avg(0, 3);
    const later = avg(3, 8);
    return { t, early, later, delta: later - early };
  });
  const easing = [...scored].sort((a, b) => a.delta - b.delta).slice(0, 5);
  const toughening = [...scored].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const row = ({ t, early, later }) => `<tr>
    <td class="team-cell">${teamBadge(t.id)} ${escapeHtml(t.name)}</td>
    <td class="num">${early.toFixed(2)}</td>
    <td class="num">${later.toFixed(2)}</td>
  </tr>`;
  return `
    <div class="card" style="margin-top:16px">
      <div class="section-title">Fixture swings - when to buy in / sell out</div>
      <div class="swing-grid">
        <div>
          <div class="note" style="padding:8px 16px 0"><strong class="hi">↗ Gets easier</strong> after the next 3 GWs - buy their assets early</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th class="no-sort">Team</th><th class="num no-sort">Next 3</th><th class="num no-sort">GW +4–8</th></tr></thead>
            <tbody>${easing.map(row).join('')}</tbody>
          </table></div>
        </div>
        <div>
          <div class="note" style="padding:8px 16px 0"><strong class="lo">↘ Gets harder</strong> - enjoy them now, plan the exit</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th class="no-sort">Team</th><th class="num no-sort">Next 3</th><th class="num no-sort">GW +4–8</th></tr></thead>
            <tbody>${toughening.map(row).join('')}</tbody>
          </table></div>
        </div>
      </div>
    </div>`;
}

// Two cheap teams that cover each other's hard fixtures - classic
// budget GK/DEF rotation.
function rotationCard() {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const teams = state.bootstrap.teams;
  const diffAt = {};
  for (const t of teams) {
    diffAt[t.id] = {};
    for (const f of state.upcomingByTeam[t.id] || []) {
      diffAt[t.id][f.event] = Math.min(diffAt[t.id][f.event] ?? 9, fixtureDifficulty(f));
    }
  }
  const pairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      let s = 0;
      let n = 0;
      for (let e = fromEvent; e < fromEvent + 8 && e <= 38; e++) {
        const a = diffAt[teams[i].id][e] ?? 5;
        const b = diffAt[teams[j].id][e] ?? 5;
        s += Math.min(a, b);
        n++;
      }
      pairs.push({ a: teams[i], b: teams[j], score: s / n });
    }
  }
  pairs.sort((x, y) => x.score - y.score);
  const rows = pairs.slice(0, 8)
    .map(({ a, b, score }) => `<tr>
      <td class="team-cell">${teamBadge(a.id)} ${escapeHtml(a.name)} + ${teamBadge(b.id)} ${escapeHtml(b.name)}</td>
      <td class="num"><span class="avg-pill">${score.toFixed(2)}</span></td>
    </tr>`)
    .join('');
  return `
    <div class="card" style="margin-top:16px">
      <div class="section-title">Rotation pairs - always play the easier fixture (next 8 GWs)</div>
      <div class="note" style="padding-top:2px">Best duos for budget goalkeepers and defenders: pick one of each, start whoever has the friendlier match.</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th class="no-sort">Pair</th><th class="num no-sort" title="Average difficulty when always choosing the easier fixture">Avg best FDR</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderFixtures(root) {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const maxEvent = Math.min(fromEvent + view.horizon - 1, 38);
  const gws = [];
  for (let e = fromEvent; e <= maxEvent; e++) gws.push(e);

  const rows = state.bootstrap.teams.map((t) => {
    const byGw = {};
    for (const f of state.upcomingByTeam[t.id] || []) {
      if (f.event > maxEvent) break;
      (byGw[f.event] = byGw[f.event] || []).push(f);
    }
    let sum = 0;
    let count = 0;
    for (const e of gws) {
      for (const f of byGw[e] || []) { sum += fixtureDifficulty(f); count++; }
      if (!(byGw[e] || []).length) { sum += 5; count++; } // blank GW ≈ hardest
    }
    return { team: t, byGw, avg: sum / count };
  });

  if (view.sortByEase) rows.sort((a, b) => a.avg - b.avg);
  else rows.sort((a, b) => a.team.name.localeCompare(b.team.name));

  const head = gws.map((e) => `<th style="text-align:center">GW${e}</th>`).join('');

  const body = rows
    .map(({ team, byGw, avg }) => {
      const cells = gws
        .map((e) => {
          const fx = byGw[e] || [];
          if (!fx.length) return `<td><div class="fdr-cell"><span class="fdr-chip fdr-blank">blank</span></div></td>`;
          const chips = fx
            .map((f) => {
              const opp = state.teamsById[f.opponent].short_name;
              return `<span class="fdr-chip fdr-${fixtureDifficulty(f)}">${teamBadge(f.opponent, 'chip-badge')}${opp} (${f.isHome ? 'H' : 'A'})</span>`;
            })
            .join('');
          return `<td><div class="fdr-cell">${chips}</div></td>`;
        })
        .join('');
      return `<tr>
        <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(team.name)}</td>
        <td class="num"><span class="avg-pill">${avg.toFixed(2)}</span></td>
        ${cells}
      </tr>`;
    })
    .join('');

  root.innerHTML = `
    ${forecastCard()}
    <div class="card">
      <div class="toolbar">
        <label>Horizon</label>
        <select id="fx-horizon">
          ${[3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}" ${view.horizon === n ? 'selected' : ''}>${n} GWs</option>`).join('')}
        </select>
        <select id="fx-sort">
          <option value="ease" ${view.sortByEase ? 'selected' : ''}>Sort: easiest run first</option>
          <option value="name" ${!view.sortByEase ? 'selected' : ''}>Sort: team name</option>
        </select>
        <span class="spacer"></span>
        <div class="legend">
          <span>Difficulty:</span>
          <span class="fdr-chip fdr-1">1</span>
          <span class="fdr-chip fdr-2">2</span>
          <span class="fdr-chip fdr-3">3</span>
          <span class="fdr-chip fdr-4">4</span>
          <span class="fdr-chip fdr-5">5</span>
        </div>
      </div>
      <div class="table-wrap" style="max-height: 75vh; overflow-y: auto;">
        <table class="data">
          <thead><tr><th class="no-sort">Team</th><th class="num no-sort" title="Average difficulty over horizon (blanks count as 5)">Avg</th>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
    ${swingsCard()}
    ${rotationCard()}
    ${blanksDoublesCard()}`;

  root.querySelector('#fx-fc-gw').addEventListener('change', (e) => {
    view.forecastGw = +e.target.value;
    renderFixtures(root);
  });
  root.querySelector('#fx-horizon').addEventListener('change', (e) => {
    view.horizon = +e.target.value;
    renderFixtures(root);
  });
  root.querySelector('#fx-sort').addEventListener('change', (e) => {
    view.sortByEase = e.target.value === 'ease';
    renderFixtures(root);
  });
}
