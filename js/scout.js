// Scout tab: captaincy shortlist, differentials, best value.
import { state, fmtPrice, num } from './state.js';
import { fixtureChips, posBadge, playerCell } from './ui.js';

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

export function renderScout(root) {
  const els = state.bootstrap.elements;

  const captains = [...els]
    .filter(available)
    .sort((a, b) => num(b.ep_next) - num(a.ep_next))
    .slice(0, 8);

  const diffs = [...els]
    .filter((p) => available(p) && num(p.selected_by_percent) < view.diffMax)
    .sort((a, b) => num(b.ep_next) - num(a.ep_next))
    .slice(0, 15);

  const value = [...els]
    .filter((p) => available(p) && p.total_points > 0)
    .sort((a, b) => num(b.value_season) - num(a.value_season))
    .slice(0, 15);

  root.innerHTML = `
    <div class="card">
      <div class="section-title">⭐ Captaincy shortlist — highest expected points next GW</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${HEAD}<th class="num no-sort">Form</th><th class="no-sort">Next 3</th></tr></thead>
          <tbody>${rowsHtml(captains, (p) => `<td class="num">${p.form}</td>`)}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="toolbar">
        <span class="section-title" style="padding:0">💎 Differentials — high xP, low ownership</span>
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
      <div class="section-title">🧮 Best value — points per £1M</div>
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
