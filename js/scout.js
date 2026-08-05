// Scout tab: captaincy shortlist, differentials, best value.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { fixtureChips, posBadge, playerCell, inlinePhoto, teamBadge } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { t, haMark, gwLabel, playerName, teamShort } from './i18n.js';

const view = { diffMax: 10 };

function available(p) {
  return p.status === 'a' || p.status === 'd';
}

let xpOf = (p) => num(p.ep_next); // replaced with the model in renderScout

function rowsHtml(players, extraCols) {
  return players
    .map((p) => `<tr>
      <td>${playerCell(p)}</td>
      <td>${posBadge(p)}</td>
      <td class="num">${fmtPrice(p.now_cost)}</td>
      <td class="num">${p.selected_by_percent}%</td>
      <td class="num ${xpOf(p) >= 4 ? 'hi' : ''}">${xpOf(p).toFixed(1)}</td>
      ${extraCols(p)}
      <td><div class="fdr-cell" style="flex-direction:row">${fixtureChips(p.team)}</div></td>
    </tr>`)
    .join('');
}

const HEAD = () => `<th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
  <th class="num no-sort">${t('common.price')}</th><th class="num no-sort">${t('common.sel')}</th>
  <th class="num no-sort" title="${t('scout.xpTitle')}">${t('stat.xp')}</th>`;

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
            .map((f) => `${teamBadge(f.opponent, 'meta-badge')} ${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})`)
            .join(', ');
          return `<td><span class="clickable" data-pid="${p.id}">${inlinePhoto(p)} ${i === 0 ? '<strong>' : ''}${escapeHtml(playerName(p))}${i === 0 ? '</strong>' : ''}</span>
            <span class="muted">${xp.toFixed(1)} · ${opp || '-'}</span></td>`;
        })
        .join('');
      return `<tr><td class="team-cell">${gwLabel(e)}</td>${cells}</tr>`;
    })
    .join('');

  xpOf = (p) => model.xp(p.id, model.gws[0]);
  const diffs = [...els]
    .filter((p) => available(p) && num(p.selected_by_percent) < view.diffMax)
    .sort((a, b) => xpOf(b) - xpOf(a))
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
  const creators = [...els]
    .filter(available)
    .map((p) => ({ p, prob: model.assistChance(p.id, nextGw) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 10);
  const creatorRows = creators
    .map(({ p, prob }, i) => {
      const fx = (state.upcomingByTeam[p.team] || []).filter((f) => f.event === nextGw)
        .map((f) => `${teamBadge(f.opponent, 'meta-badge')} ${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})`)
        .join(', ');
      const pct = Math.round(prob * 100);
      return `<tr>
        <td class="num" style="font-weight:800">${i + 1}</td>
        <td>${playerCell(p)}</td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td>${fx || '-'}</td>
        <td class="num"><span class="cs-pill ${pct >= 35 ? 'cs-hi' : ''}">${pct}%</span></td>
      </tr>`;
    })
    .join('');

  const scorerRows = scorers
    .map(({ p, prob }, i) => {
      const fx = (state.upcomingByTeam[p.team] || []).filter((f) => f.event === nextGw)
        .map((f) => `${teamBadge(f.opponent, 'meta-badge')} ${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})`)
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
      <div class="section-title">${t('scout.scorersTitle', { gw: gwLabel(nextGw) })}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th class="num no-sort">#</th><th class="no-sort">${t('common.player')}</th>
          <th class="num no-sort">${t('common.price')}</th><th class="no-sort">${t('common.fixture')}</th>
          <th class="num no-sort" title="${t('scout.toScoreTitle')}">${t('scout.toScore')}</th></tr></thead>
          <tbody>${scorerRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">${t('scout.creatorsTitle', { gw: gwLabel(nextGw) })}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th class="num no-sort">#</th><th class="no-sort">${t('common.player')}</th>
          <th class="num no-sort">${t('common.price')}</th><th class="no-sort">${t('common.fixture')}</th>
          <th class="num no-sort" title="${t('scout.toAssistTitle')}">${t('scout.toAssist')}</th></tr></thead>
          <tbody>${creatorRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="section-title">${t('scout.capTitle')}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.gw')}</th><th class="no-sort">${t('scout.topPick')}</th>
            <th class="no-sort">${t('scout.backup')}</th><th class="no-sort">${t('scout.punt')}</th>
          </tr></thead>
          <tbody>${capRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="toolbar">
        <span class="section-title" style="padding:0">${t('scout.diffTitle')}</span>
        <span class="spacer"></span>
        <label>${t('scout.ownedLess')}</label>
        <select id="sc-diff">
          ${[5, 10, 15, 20].map((n) => `<option value="${n}" ${view.diffMax === n ? 'selected' : ''}>${n}%</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${HEAD()}<th class="num no-sort">${t('common.form')}</th><th class="no-sort">${t('common.next3')}</th></tr></thead>
          <tbody>${rowsHtml(diffs, (p) => `<td class="num">${p.form}</td>`)}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">${t('scout.valueTitle')}</div>
      <div class="note" style="padding-top:2px">${t('scout.valueNote')}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${HEAD()}<th class="num no-sort" title="${t('scout.ptsPerMTitle')}">${t('scout.ptsPerM')}</th><th class="no-sort">${t('common.next3')}</th></tr></thead>
          <tbody>${rowsHtml(value, (p) => `<td class="num hi">${p.value_season}</td>`)}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#sc-diff').addEventListener('change', (e) => {
    view.diffMax = +e.target.value;
    renderScout(root);
  });
}
