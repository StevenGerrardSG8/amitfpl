// Small shared rendering helpers used across tabs.
import { state, statusInfo, escapeHtml } from './state.js';
import { t, haMark, gwLabel, posShort } from './i18n.js';

// Fixture difficulty 1-5. When ClubElo ratings are loaded the buckets
// come from the opponent's venue-adjusted Elo (sharper than the flat
// FDR, which lumps all promoted sides together); FDR is the fallback.
export function fixtureDifficulty(f) {
  const oppElo = state.elo?.[f.opponent];
  if (!oppElo) return f.difficulty;
  const adj = oppElo + (f.isHome ? -60 : 60); // opponent is away when we're home
  if (adj >= 1960) return 5;
  if (adj >= 1880) return 4;
  if (adj >= 1795) return 3;
  if (adj >= 1700) return 2;
  return 1;
}

export function fixtureChips(teamId, count = 3) {
  const fx = (state.upcomingByTeam[teamId] || []).slice(0, count);
  if (!fx.length) return '<span class="fdr-chip fdr-blank">-</span>';
  return fx
    .map((f) => {
      const opp = state.teamsById[f.opponent].short_name;
      const ha = haMark(f.isHome);
      return `<span class="fdr-chip fdr-${fixtureDifficulty(f)}" title="${gwLabel(f.event)}">${teamBadge(f.opponent, 'chip-badge')}${opp} (${ha})</span>`;
    })
    .join(' ');
}

// Tiny inline headshot for use next to a player's name in running text.
export function inlinePhoto(p) {
  return playerPhoto(p, 'inline-photo');
}

export function posBadge(p) {
  const pos = state.positionsById[p.element_type].singular_name_short;
  return `<span class="pos-badge pos-${pos}">${posShort(pos)}</span>`;
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
  return `<div class="player-flex clickable" data-pid="${p.id}" title="${t('common.playerProfile')}">
    ${playerPhoto(p, 'row-photo')}
    <div class="player-cell">
      <span class="player-name">${escapeHtml(p.web_name)}${flag}</span>
      <span class="player-meta">${teamBadge(p.team, 'meta-badge')} ${team.short_name}</span>
    </div>
  </div>`;
}

// Signed number with color, e.g. +0.2 in green / -0.3 in red.
// dir="ltr" keeps the sign in front of the number in RTL layouts too.
export function signed(n, digits = 1, suffix = '') {
  if (!n) return '<span class="muted">0</span>';
  const cls = n > 0 ? 'hi' : 'lo';
  const sign = n > 0 ? '+' : '';
  return `<span class="${cls}" dir="ltr">${sign}${n.toFixed(digits)}${suffix}</span>`;
}

export const fmtCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

// Set-piece duty badges: first-choice penalty / free-kick / corner taker.
export function spBadges(p) {
  let out = '';
  if (p.penalties_order === 1) out += `<span class="sp-tag" title="${t('sp.penTitle')}">P</span>`;
  if (p.direct_freekicks_order === 1) out += `<span class="sp-tag" title="${t('sp.fkTitle')}">FK</span>`;
  if (p.corners_and_indirect_freekicks_order === 1) out += `<span class="sp-tag" title="${t('sp.cornerTitle')}">C</span>`;
  return out;
}

// Joined the club recently (summer signing / winter window).
export const isNewSigning = (p) =>
  !!p.team_join_date && Date.now() - Date.parse(p.team_join_date) < 150 * 86400000;

// Official player headshot. Fallback handling lives in the photo
// watchdog (app.js): headshot → team kit → initials circle. The
// watchdog also catches requests that hang without firing onerror.
export function playerPhoto(p, cls = 'pp-photo') {
  const shirt = `${p.team_code}${p.element_type === 1 ? '_1' : ''}`;
  const attrs = `loading="lazy" alt="" data-shirt="${shirt}" data-init="${escapeHtml((p.web_name || '?')[0].toUpperCase())}"`;
  const faceId = state.faces?.[p.id];
  if (faceId) {
    // Proper face image (transparent background, face-cropped).
    return `<span class="face-wrap ${cls}"><img class="face-img ff" ${attrs}
      src="https://images.fotmob.com/image_resources/playerimages/${faceId}.png" /></span>`;
  }
  // No face image mapped - zoom-crop the official portrait so only the
  // face shows, no kit/shoulders.
  return `<span class="face-wrap ${cls}"><img class="face-img" ${attrs}
    src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${p.code}.png" /></span>`;
}
