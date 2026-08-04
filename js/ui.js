// Small shared rendering helpers used across tabs.
import { state, statusInfo, escapeHtml } from './state.js';

export function fixtureChips(teamId, count = 3) {
  const fx = (state.upcomingByTeam[teamId] || []).slice(0, count);
  if (!fx.length) return '<span class="fdr-chip fdr-blank">—</span>';
  return fx
    .map((f) => {
      const opp = state.teamsById[f.opponent].short_name;
      const ha = f.isHome ? 'H' : 'A';
      return `<span class="fdr-chip fdr-${f.difficulty}" title="GW${f.event}">${opp} (${ha})</span>`;
    })
    .join(' ');
}

export function posBadge(p) {
  const pos = state.positionsById[p.element_type].singular_name_short;
  return `<span class="pos-badge pos-${pos}">${pos}</span>`;
}

// Official club crest.
export function teamBadge(teamId, cls = 'team-badge') {
  const t = state.teamsById[teamId];
  return `<img class="${cls}" loading="lazy" alt=""
    src="https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png"
    onerror="this.style.opacity=0" />`;
}

export function playerCell(p) {
  const team = state.teamsById[p.team];
  const st = statusInfo(p);
  const flag = st
    ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>`
    : '';
  return `<div class="player-flex">
    ${playerPhoto(p, 'row-photo')}
    <div class="player-cell">
      <span class="player-name">${escapeHtml(p.web_name)}${flag}</span>
      <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${team.short_name}</span>
    </div>
  </div>`;
}

// Signed number with color, e.g. +0.2 in green / -0.3 in red.
export function signed(n, digits = 1, suffix = '') {
  if (!n) return '<span class="muted">0</span>';
  const cls = n > 0 ? 'hi' : 'lo';
  const sign = n > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${n.toFixed(digits)}${suffix}</span>`;
}

export const fmtCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

// Set-piece duty badges: first-choice penalty / free-kick / corner taker.
export function spBadges(p) {
  let out = '';
  if (p.penalties_order === 1) out += '<span class="sp-tag" title="First-choice penalty taker">P</span>';
  if (p.direct_freekicks_order === 1) out += '<span class="sp-tag" title="First-choice direct free kicks">FK</span>';
  if (p.corners_and_indirect_freekicks_order === 1) out += '<span class="sp-tag" title="First-choice corners &amp; indirect FKs">C</span>';
  return out;
}

// Joined the club recently (summer signing / winter window).
export const isNewSigning = (p) =>
  !!p.team_join_date && Date.now() - Date.parse(p.team_join_date) < 150 * 86400000;

// Official player headshot. Players without a photo yet (youth/new
// signings) fall back to their team's shirt; goalkeepers get the GK kit.
export function playerPhoto(p, cls = 'pp-photo') {
  const shirt = `${p.team_code}${p.element_type === 1 ? '_1' : ''}`;
  return `<img class="${cls}" loading="lazy" alt="" data-shirt="${shirt}"
    src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${p.code}.png"
    onerror="if(!this.dataset.f){this.dataset.f=1;this.src='https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_'+this.dataset.shirt+'-66.png';this.classList.add('shirt-img');}else{this.style.opacity=0;}" />`;
}
