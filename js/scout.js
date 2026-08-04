// Scout tab: captaincy shortlist, differentials, best value.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { fixtureChips, posBadge, playerCell, inlinePhoto, teamBadge } from './ui.js';
import { loadBaseline, buildModel } from './model.js';

const view = { diffMax: 10 };

function available(p) {
  return p.status === 'a' || p.status === 'd';
}

function rowsHtml(players, extraCols) {
  return players
    .map((p) => `<tr>
      <td>${playerCell(p)}</td>
      <td>${posBadge(p)}</td>
      <td class="num">${fmtPrice(p.now_cost)}</td>
      <td class="num">${p.selected_by_percent}%</td>
      <td class="num ${num(p.ep_next) >= 4 ? 'hi' : ''}">${num(p.ep_next).toFixed(1)}</td>
      ${extraCols(p)}
      <td><div class="fdr-cell" style="flex-direction:row">${fixtureChips(p.team)}</div></td>
    </tr>`)
    .join('');
}

const HEAD = `<th class="no-sort">Player</th><th class="no-sort">Pos</th>
  <th class="num no-sort">Price</th><th class="num no-sort">Sel %</th>
  <th class="num no-sort" title="FPL expected points, next GW">xP</th>`;

export async function renderScout(root) {
  const els = state.bootstrap.elements;
  await loadBaseline();
  const model = buildModel(5);

  // Best captain options per upcoming gameweek (model xP, doubled pick).
  const capRows = model.gws
    .map((e) => {
      const top = els
        .filter(available)
        .map((p) => ({ p, xp: model.xp(p.id, e) }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 3);
      const cells = top
        .map(({ p, xp }, i) => {
          const opp = (state.upcomingByTeam[p.team] || []).filter((f) => f.event === e)
            .map((f) => `${teamBadge(f.opponent, 'meta-badge')} ${state.teamsById[f.opponent].short_name} (${f.isHome ? 'H' : 'A'})`)
            .join(', ');
          return `<td><span class="clickable" data-pid="${p.id}">${inlinePhoto(p)} ${i === 0 ? '<strong>' : ''}${escapeHtml(p.web_name)}${i === 0 ? '</strong>' : ''}</span>
            <span class="muted">${xp.toFixed(1)} · ${opp || '-'}</span></td>`;
        })
        .join('');
      return `<tr><td class="team-cell">GW${e}</td>${cells}</tr>`;
    })
    .join('');

  const diffs = [...els]
    .filter((p) => available(p) && num(p.selected_by_percent) < view.diffMax)
    .sort((a, b) => num(b.ep_next) - num(a.ep_next))
    .slice(0, 15);

  const value = [...els]
    .filter((p) => available(p) && p.total_points > 0)
    .sort((a, b) => num(b.value_season) - num(a.value_season))
    .slice(0, 15);

  const nextGw = model.gws[0];
  const scorers = [...els]
    .filter(available)
    .map((p) => ({ p, prob: model.goalChance(p.id, nextGw) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 10);
  const scorerRows = scorers
    .map(({ p, prob }, i) => {
      const fx = (state.upcomingByTeam[p.team] || []).filter((f) => f.event === nextGw)
        .map((f) => `${teamBadge(f.opponent, 'meta-badge')} ${state.teamsById[f.opponent].short_name} (${f.isHome ? 'H' : 'A'})`)
        .join(', ');
      const pct = Math.round(prob * 100);
      return `<tr>
        <td class="num" style="font-weight:800">${i + 1}</td>
        <td>${playerCell(p)}</td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td>${fx || '-'}</td>
        <td class="num"><span class="cs-pill ${pct >= 45 ? 'cs-hi' : ''}">${pct}%</span></td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">🎯 Scoring chances - most likely to find the net in GW${nextGw}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th class="num no-sort">#</th><th class="no-sort">Player</th>
          <th class="num no-sort">Price</th><th class="no-sort">Fixture</th>
          <th class="num no-sort" title="Chance of scoring at least once">To score</th></tr></thead>
          <tbody>${scorerRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="section-title">⭐ Captaincy planner - best armband pick per gameweek (amitfpl model)</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">GW</th><th class="no-sort">Top pick</th>
            <th class="no-sort">Backup</th><th class="no-sort">Punt</th>
          </tr></thead>
          <tbody>${capRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="toolbar">
        <span class="section-title" style="padding:0">💎 Differentials - high xP, low ownership</span>
        <span class="spacer"></span>
        <label>Owned by less than</label>
        <select id="sc-diff">
          ${[5, 10, 15, 20].map((n) => `<option value="${n}" ${view.diffMax === n ? 'selected' : ''}>${n}%</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${HEAD}<th class="num no-sort">Form</th><th class="no-sort">Next 3</th></tr></thead>
          <tbody>${rowsHtml(diffs, (p) => `<td class="num">${p.form}</td>`)}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">🧮 Best value - points per £1M</div>
      <div class="note" style="padding-top:2px">Based on total points (last season's, until this season gets going).</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${HEAD}<th class="num no-sort" title="Total points per £1M">Pts/£M</th><th class="no-sort">Next 3</th></tr></thead>
          <tbody>${rowsHtml(value, (p) => `<td class="num hi">${p.value_season}</td>`)}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#sc-diff').addEventListener('change', (e) => {
    view.diffMax = +e.target.value;
    renderScout(root);
  });
}
