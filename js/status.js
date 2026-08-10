// Status tab: injuries & doubts, suspension watch.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { fixtureChips, posBadge, playerCell, infoNote } from './ui.js';
import { t, translateNews } from './i18n.js';

// FPL bans: 5 yellows by GW19, 10 by GW32, 15 all season.
function yellowThreshold(gw) {
  if (gw == null || gw <= 19) return 5;
  if (gw <= 32) return 10;
  return 15;
}

const statusLabel = (s) => (['d', 'i', 's', 'u', 'n'].includes(s) ? t(`status.${s}`) : s);

// How stale is this flag? A "75% chance of playing" posted this
// morning reads very differently from the same line sitting there
// since last week.
function newsAge(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.oneDayAgo');
  return t('time.daysAgo', { n: days });
}

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
        <td><span class="status-flag status-${p.status}" style="margin:0">${statusLabel(p.status)}</span>
            ${chance != null ? `<span class="muted"> · ${chance}%</span>` : ''}</td>
        <td class="news-cell">${escapeHtml(translateNews(p.news) || '')}${p.news_added ? `<br><span class="muted" style="font-size:11px">${newsAge(p.news_added)}</span>` : ''}</td>
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
      const risk = left <= 0 ? `<span class="lo">${t('statusTab.banned')}</span>`
        : left === 1 ? `<span class="lo">${t('statusTab.oneAway')}</span>`
        : t('statusTab.nAway', { n: left });
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
        <span class="section-title" style="padding:0">${t('statusTab.title')} ${infoNote('info.status')}</span>
        <span class="spacer"></span>
        <label class="chk"><input type="checkbox" id="st-doubt" ${onlyDoubtful ? 'checked' : ''}/> ${t('statusTab.doubtOnly')}</label>
      </div>
      <div class="table-wrap" style="max-height: 45vh; overflow-y: auto;">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
            <th class="num no-sort">${t('common.price')}</th><th class="num no-sort">${t('common.sel')}</th>
            <th class="no-sort">${t('statusTab.status')}</th><th class="no-sort">${t('statusTab.news')}</th>
          </tr></thead>
          <tbody>${flaggedRows || `<tr><td colspan="6" class="note">${t('statusTab.noneFlagged')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">${t('statusTab.suspTitle', { n: threshold, gw: threshold === 5 ? 19 : threshold === 10 ? 32 : 38 })}</div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th class="no-sort">${t('common.player')}</th><th class="no-sort">${t('common.pos')}</th>
            <th class="num no-sort">${t('statusTab.yellows')}</th><th class="no-sort">${t('statusTab.banDistance')}</th>
            <th class="num no-sort">${t('common.sel')}</th><th class="no-sort">${t('common.next3')}</th>
          </tr></thead>
          <tbody>${bookingRows || `<tr><td colspan="6" class="note">${seasonLive ? t('statusTab.nobodyNear') : t('statusTab.cardsReset')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#st-doubt').addEventListener('change', (e) => {
    onlyDoubtful = e.target.checked;
    renderStatus(root);
  });
}
