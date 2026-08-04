import { state, escapeHtml } from './state.js';
import { teamForecast } from './model.js';

const view = { horizon: 6, sortByEase: true, forecastGw: null };

function forecastCard() {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const gws = [];
  for (let e = fromEvent; e < fromEvent + 6 && e <= 38; e++) gws.push(e);
  const gw = view.forecastGw && gws.includes(view.forecastGw) ? view.forecastGw : gws[0];

  const rows = teamForecast(gw)
    .map(({ team, opp, isHome, xg, cs }) => {
      const csPct = Math.round(cs * 100);
      return `<tr>
        <td class="team-cell">${escapeHtml(team.name)}</td>
        <td>${escapeHtml(opp.short_name)} (${isHome ? 'H' : 'A'})</td>
        <td class="num"><span class="xg-pill">${xg.toFixed(2)}</span></td>
        <td class="num"><span class="cs-pill ${csPct >= 40 ? 'cs-hi' : csPct <= 20 ? 'cs-lo' : ''}">${csPct}%</span></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <span class="section-title" style="padding:0">⚽ Goals &amp; clean sheet forecast</span>
        <select id="fx-fc-gw">
          ${gws.map((e) => `<option value="${e}" ${e === gw ? 'selected' : ''}>GW${e}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="result-count">amitfpl model · sorted by expected goals</span>
      </div>
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
      for (const f of byGw[e] || []) { sum += f.difficulty; count++; }
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
              return `<span class="fdr-chip fdr-${f.difficulty}">${opp} (${f.isHome ? 'H' : 'A'})</span>`;
            })
            .join('');
          return `<td><div class="fdr-cell">${chips}</div></td>`;
        })
        .join('');
      return `<tr>
        <td class="team-cell">${escapeHtml(team.name)}</td>
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
    </div>`;

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
