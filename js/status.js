// Status tab: injuries & doubts, suspension watch.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { fixtureChips, posBadge, playerCell } from './ui.js';

// FPL bans: 5 yellows by GW19, 10 by GW32, 15 all season.
function yellowThreshold(gw) {
  if (gw == null || gw <= 19) return 5;
  if (gw <= 32) return 10;
  return 15;
}

const STATUS_LABEL = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not in squad',
};

let onlyDoubtful = false;

export function renderStatus(root) {
  const els = state.bootstrap.elements;
  const gw = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const threshold = yellowThreshold(gw);

  const flagged = els
    .filter((p) => (onlyDoubtful ? p.status === 'd' : p.status !== 'a') && num(p.selected_by_percent) >= 0)
    .sort((a, b) => num(b.selected_by_percent) - num(a.selected_by_percent))
    .slice(0, 60);

  const flaggedRows = flagged
    .map((p) => {
      const chance = p.chance_of_playing_next_round;
      return `<tr>
        <td>${playerCell(p)}</td>
        <td>${posBadge(p)}</td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td class="num">${p.selected_by_percent}%</td>
        <td><span class="status-flag status-${p.status}" style="margin:0">${STATUS_LABEL[p.status] || p.status}</span>
            ${chance != null ? `<span class="muted"> · ${chance}%</span>` : ''}</td>
        <td class="news-cell">${escapeHtml(p.news || '')}</td>
      </tr>`;
    })
    .join('');

  // yellow_cards holds last season's totals until GW1 finishes -
  // showing them as ban risk would be misleading.
  const seasonLive = state.currentEvent != null;
  const bookings = (seasonLive ? els : [])
    .filter((p) => p.yellow_cards >= Math.max(1, threshold - 2))
    .sort((a, b) => b.yellow_cards - a.yellow_cards || num(b.selected_by_percent) - num(a.selected_by_percent))
    .slice(0, 30);

  const bookingRows = bookings
    .map((p) => {
      const left = threshold - p.yellow_cards;
      const risk = left <= 0 ? '<span class="lo">Banned</span>'
        : left === 1 ? '<span class="lo">1 away!</span>'
        : `${left} away`;
      return `<tr>
        <td>${playerCell(p)}</td>
        <td>${posBadge(p)}</td>
        <td class="num">${p.yellow_cards} 🟨</td>
        <td>${risk}</td>
        <td class="num">${p.selected_by_percent}%</td>
        <td><div class="fdr-cell" style="flex-direction:row">${fixtureChips(p.team)}</div></td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar" style="border-bottom:none">
        <span class="section-title" style="padding:0">Injuries &amp; doubts - official FPL flags, sorted by ownership</span>
        <span class="spacer"></span>
        <label class="chk"><input type="checkbox" id="st-doubt" ${onlyDoubtful ? 'checked' : ''}/> Doubtful only</label>
      </div>
      <div class="table-wrap" style="max-height: 45vh; overflow-y: auto;">
        <table class="data">
          <thead><tr>
            <th class="no-sort">Player</th><th class="no-sort">Pos</th>
            <th class="num no-sort">Price</th><th class="num no-sort">Sel %</th>
            <th class="no-sort">Status</th><th class="no-sort">News</th>
          </tr></thead>
          <tbody>${flaggedRows || '<tr><td colspan="6" class="note">No flagged players right now - everyone\'s fit. </td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">Suspension watch - ${threshold} yellows = 1-match ban (through GW${threshold === 5 ? 19 : threshold === 10 ? 32 : 38})</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">Player</th><th class="no-sort">Pos</th>
            <th class="num no-sort">Yellows</th><th class="no-sort">Ban distance</th>
            <th class="num no-sort">Sel %</th><th class="no-sort">Next 3</th>
          </tr></thead>
          <tbody>${bookingRows || `<tr><td colspan="6" class="note">${seasonLive ? 'Nobody near a ban yet.' : 'Card counts reset when the season kicks off - this fills up as yellows pile up.'}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#st-doubt').addEventListener('change', (e) => {
    onlyDoubtful = e.target.checked;
    renderStatus(root);
  });
}
