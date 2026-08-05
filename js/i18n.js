// i18n: EN/HE strings dictionary + language state.
// Every value is [english, hebrew]. t(key, params) picks by the active
// language and interpolates {name} params. In Hebrew, player and club
// names are localised too (js/names-he.js + the team maps below).
import { PLAYER_NAMES_HE } from './names-he.js';

const LANG_KEY = 'amitfpl:lang';

// Explicit choice wins; otherwise first visits follow the browser
// language (Hebrew browsers open in Hebrew).
let lang = 'en';
try {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored) lang = stored === 'he' ? 'he' : 'en';
  else if ((navigator.language || '').toLowerCase().startsWith('he')) lang = 'he';
} catch { /* private mode */ }

export const getLang = () => lang;
export const isHe = () => lang === 'he';

export function setLang(l) {
  lang = l === 'he' ? 'he' : 'en';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
  applyDir();
}

// <html> dir/lang - also applied before first paint by the inline
// script in index.html <head> to avoid a layout flash.
export function applyDir() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

// Locale for every date/time the app renders.
export const locale = () => (lang === 'he' ? 'he-IL' : 'en-GB');
export const fmtDT = (d, opts) => new Date(d).toLocaleString(locale(), opts);

// "Gameweek 12" (API data) -> "מחזור 12" in Hebrew.
export function gwName(name) {
  if (!isHe()) return name;
  const m = /(\d+)/.exec(name || '');
  return m ? `מחזור ${m[1]}` : name;
}

// Compact gameweek label: GW12 / מחזור 12.
export const gwLabel = (n) => (isHe() ? `מחזור ${n}` : `GW${n}`);

// Home/away marker used inside fixture chips: (H)/(A) or (ב)/(ח).
export const haMark = (isHome) => (isHe() ? (isHome ? 'ב' : 'ח') : (isHome ? 'H' : 'A'));

// Player display name: Hebrew when active (mapped by web_name; new
// signings that miss the map fall back to English).
export const playerName = (p) => (isHe() ? PLAYER_NAMES_HE[p.web_name] || p.web_name : p.web_name);

// Club names, full and compact (keyed by API name / short_name).
const TEAM_NAMES_HE = {
  'Arsenal': 'ארסנל', 'Aston Villa': 'אסטון וילה', 'Bournemouth': 'בורנמות׳',
  'Brentford': 'ברנטפורד', 'Brighton': 'ברייטון', 'Chelsea': 'צ׳לסי',
  'Coventry City': 'קובנטרי סיטי', 'Crystal Palace': 'קריסטל פאלאס',
  'Everton': 'אברטון', 'Fulham': 'פולהאם', 'Hull City': 'האל סיטי',
  'Ipswich Town': 'איפסוויץ׳ טאון', 'Leeds': 'לידס', 'Liverpool': 'ליברפול',
  'Man City': 'מנצ׳סטר סיטי', 'Man Utd': 'מנצ׳סטר יונייטד', 'Newcastle': 'ניוקאסל',
  "Nott'm Forest": 'נוטינגהאם פורסט', 'Spurs': 'טוטנהאם', 'Sunderland': 'סאנדרלנד',
};
const TEAM_SHORT_HE = {
  ARS: 'ארסנל', AVL: 'וילה', BOU: 'בורנמות׳', BRE: 'ברנטפורד', BHA: 'ברייטון',
  CHE: 'צ׳לסי', COV: 'קובנטרי', CRY: 'פאלאס', EVE: 'אברטון', FUL: 'פולהאם',
  HUL: 'האל', IPS: 'איפסוויץ׳', LEE: 'לידס', LIV: 'ליברפול', MCI: 'מנ׳ סיטי',
  MUN: 'מנ׳ יונייטד', NEW: 'ניוקאסל', NFO: 'פורסט', TOT: 'טוטנהאם', SUN: 'סאנדרלנד',
};
export const teamName = (team) => (isHe() ? TEAM_NAMES_HE[team.name] || team.name : team.name);
export const teamShort = (team) => (isHe() ? TEAM_SHORT_HE[team.short_name] || team.short_name : team.short_name);

// Position labels. The API's GKP/DEF/MID/FWD codes stay as CSS class
// names; only the visible text is localised.
const POS_SHORT = { GKP: 'שוער', DEF: 'מגן', MID: 'קשר', FWD: 'חלוץ' };
const POS_PLURAL = { GKP: 'שוערים', DEF: 'מגנים', MID: 'קשרים', FWD: 'חלוצים' };
export const posShort = (code) => (isHe() ? POS_SHORT[code] || code : code);
export const posPlural = (code) => (isHe() ? POS_PLURAL[code] || code : code);

// FPL news strings are English API data ("Knee injury - Expected back
// 22 Aug"). Translate the common patterns; anything unrecognised falls
// through in English.
const NEWS_PARTS = {
  Foot: 'כף הרגל', Shin: 'השוק', Groin: 'המפשעה', Hamstring: 'ההמסטרינג',
  Knee: 'הברך', Calf: 'התאומים', Thigh: 'הירך', Ankle: 'הקרסול',
  Back: 'הגב', Hip: 'המותן', Shoulder: 'הכתף', Head: 'הראש', Neck: 'הצוואר',
  Toe: 'הבוהן', Heel: 'העקב', Rib: 'הצלעות', Hand: 'כף היד', Wrist: 'שורש כף היד',
  Face: 'הפנים', Eye: 'העין', Achilles: 'גיד אכילס', Muscle: 'שריר', Muscular: 'שריר',
  Leg: 'הרגל', Knock: 'חבלה',
};
const NEWS_MONTHS = {
  Jan: 'ינו׳', Feb: 'פבר׳', Mar: 'מרץ', Apr: 'אפר׳', May: 'מאי', Jun: 'יוני',
  Jul: 'יולי', Aug: 'אוג׳', Sep: 'ספט׳', Oct: 'אוק׳', Nov: 'נוב׳', Dec: 'דצמ׳',
};
const heDate = (d, mo) => `${d} ב${NEWS_MONTHS[mo] || mo}`;
// Destination clubs mentioned in loan/transfer news (non-PL sides too).
const NEWS_CLUBS = {
  'Getafe CF': 'חטאפה',
  'Grimsby Town': 'גרימסבי טאון',
  'KVC Westerlo': 'וסטרלו',
  'Leicester City': 'לסטר סיטי',
  'New England Revolution': 'ניו אינגלנד רבולושן',
  'Sheffield Wednesday': 'שפילד וונסדיי',
  'Sheffield United': 'שפילד יונייטד',
};
const newsClub = (c) => NEWS_CLUBS[c] || TEAM_NAMES_HE[c] || c;
export function translateNews(news) {
  if (!isHe() || !news) return news;
  let s = news;
  s = s.replace(/^Unspecified injury/i, 'פציעה לא מוגדרת');
  s = s.replace(/^([A-Za-z]+) injury/i, (m, part) => {
    const p = part[0].toUpperCase() + part.slice(1).toLowerCase();
    return NEWS_PARTS[p] ? `פציעה ב${NEWS_PARTS[p]}` : m;
  });
  s = s.replace(/^Illness|^Ilness/i, 'מחלה');
  s = s.replace(/^Knock/i, 'חבלה');
  s = s.replace(/^Lack of match fitness/i, 'חוסר כושר משחק');
  s = s.replace(/ - Unknown return date/i, ' - מועד החזרה לא ידוע');
  s = s.replace(/ - Expected back (\d+) ([A-Za-z]{3})\w*/i, (m, d, mo) => ` - צפוי לחזור ב-${heDate(d, mo)}`);
  s = s.replace(/ - (\d+)% chance of playing/i, ' - $1% סיכוי לשחק');
  s = s.replace(/^Suspended until (\d+) ([A-Za-z]{3})\w*/i, (m, d, mo) => `מורחק עד ${heDate(d, mo)}`);
  s = s.replace(/^Suspended/i, 'מורחק');
  s = s.replace(/^Has joined (.+?) on loan for the rest of the season\.?$/i, (m, c) => `הושאל ל-${newsClub(c)} עד סוף העונה`);
  s = s.replace(/^Has joined (.+?) on loan\.?$/i, (m, c) => `הושאל ל-${newsClub(c)}`);
  s = s.replace(/^Has joined (.+?) permanently\.?$/i, (m, c) => `הצטרף ל-${newsClub(c)} באופן קבוע`);
  s = s.replace(/^Has joined (.+?)\.?$/i, (m, c) => `הצטרף ל-${newsClub(c)}`);
  s = s.replace(/^has returned to (.+?)\.?$/i, (m, c) => `חזר ל-${newsClub(c)}`);
  s = s.replace(/^has departed the club as a free agent\.?$/i, 'עזב את המועדון כשחקן חופשי');
  s = s.replace(/^Has left the club(?: by mutual consent)?\.?$/i, 'עזב את המועדון');
  s = s.replace(/^Transferred to (.+?)\.?$/i, 'הועבר ל-$1');
  return s;
}

export function t(key, params) {
  const entry = STRINGS[key];
  let s = entry ? (lang === 'he' && entry[1] != null ? entry[1] : entry[0]) : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  }
  return s;
}

const STRINGS = {
  /* ---- chrome / header ---- */
  'brand.sub': ['FPL Toolkit', 'ערכת כלים ל-FPL'],
  'chrome.refreshTitle': ['Refresh data now', 'רענון נתונים עכשיו'],
  'chrome.refreshAria': ['Refresh data', 'רענון נתונים'],
  'chrome.themeTitle': ['Toggle dark mode', 'החלפת מצב כהה'],
  'chrome.helpTitle': ['Help & glossary', 'עזרה ומילון מונחים'],
  'chrome.langTitle': ['עברית', 'English'],
  'chrome.loading': ['Loading FPL data…', 'טוען נתוני FPL…'],
  'chrome.offline': ['Offline - showing saved data', 'אין חיבור - מוצגים נתונים שמורים'],
  'chrome.toTop': ['Back to top', 'חזרה למעלה'],
  'chrome.loadError': ["Couldn't load FPL data ({msg}). Refresh to retry.", 'טעינת נתוני FPL נכשלה ({msg}). רעננו כדי לנסות שוב.'],
  'chrome.updatedNow': ['Updated just now', 'עודכן ממש עכשיו'],
  'chrome.updatedMin': ['Updated {m}m ago', 'עודכן לפני {m} דקות'],
  'chrome.updatedHr': ['Updated {h}h {m}m ago', 'עודכן לפני {h} שעות ו-{m} דקות'],
  'chrome.refreshFailed': ['refresh failed', 'הרענון נכשל'],
  'chrome.deadline': ['{gw} deadline', 'דדליין {gw}'],
  'chrome.inTime': ['in {count}', 'בעוד {count}'],
  'chrome.locked': ['locked', 'ננעל'],
  'time.dh': ['{d}d {h}h', '{d} ימים ו-{h} שעות'],
  'time.hm': ['{h}h {m}m', '{h} שעות ו-{m} דקות'],
  'time.m': ['{m}m', '{m} דקות'],
  'footer.text': ['amitfpl v2 · data: official Fantasy Premier League API + ClubElo · refreshes every 30 min · ', 'amitfpl v2 · נתונים: FPL הרשמי + ClubElo · מתעדכן כל 30 דקות · '],
  'footer.source': ['source', 'קוד מקור'],

  /* ---- tabs ---- */
  'tab.home': ['Home', 'בית'],
  'tab.players': ['Players', 'שחקנים'],
  'tab.planner': ['Planner', 'מתכנן'],
  'tab.scout': ['Scout', 'סקאוט'],
  'tab.market': ['Market', 'שוק'],
  'tab.status': ['Status', 'כשירות'],
  'tab.compare': ['Compare', 'השוואה'],
  'tab.fixtures': ['Fixtures', 'לוח משחקים'],
  'tab.lineups': ['Lineups', 'הרכבים'],
  'tab.matches': ['Matches', 'תוצאות'],
  'tab.setpieces': ['Set Pieces', 'מצבים נייחים'],
  'tab.myteam': ['My Team', 'הקבוצה שלי'],
  'tab.more': ['More', 'עוד'],

  /* ---- shared table/UI bits ---- */
  'common.player': ['Player', 'שחקן'],
  'common.pos': ['Pos', 'עמדה'],
  'common.price': ['Price', 'מחיר'],
  'common.sel': ['Sel %', '% בעלות'],
  'common.form': ['Form', 'כושר'],
  'common.pts': ['Pts', 'נק׳'],
  'common.min': ['Min', 'דק׳'],
  'common.next3': ['Next 3', '3 הבאים'],
  'common.next': ['Next', 'הבא'],
  'common.team': ['Team', 'קבוצה'],
  'common.fixture': ['Fixture', 'משחק'],
  'common.gw': ['GW', 'מחזור'],
  'common.bench': ['Bench', 'ספסל'],
  'common.clear': ['Clear', 'ניקוי'],
  'common.cancel': ['Cancel', 'ביטול'],
  'common.close': ['Close', 'סגירה'],
  'common.vs': ['vs', 'נגד'],
  'common.blank': ['blank', 'בלנק'],
  'common.searchPlayer': ['Search player…', 'חיפוש שחקן…'],
  'common.maxPrice': ['Max £', 'מקס׳ £'],
  'common.all': ['All', 'הכל'],
  'common.playerProfile': ['Player profile', 'פרופיל שחקן'],
  'common.nGws': ['{n} GWs', '{n} מחזורים'],
  'common.showMore': ['Show more', 'הצג עוד'],
  'common.horizon': ['Horizon', 'טווח תכנון'],
  'common.xpNext': ['xP Next', 'צפי הבא'],
  'common.xpNextTitle': ['amitfpl model - expected points next gameweek', 'מודל amitfpl - נקודות צפויות במחזור הבא'],
  'common.captain': ['Captain', 'קפטן'],
  'common.viceCaptain': ['Vice captain', 'סגן קפטן'],
  'common.noFixture': ['no fixture', 'אין משחק'],

  /* ---- stat codes & compact badges ---- */
  'stat.xp': ['xP', 'צפי'],
  'stat.xg': ['xG', 'צפי שערים'],
  'stat.xa': ['xA', 'צפי בישולים'],
  'stat.xgi': ['xGI', 'צפי מעורבות'],
  'stat.ppg': ['PPG', 'נק׳/משחק'],
  'stat.dc': ['DC', 'הגנה'],
  'stat.xg90': ['xG per 90', 'צפי שערים ל-90'],
  'badge.c': ['C', 'ק'],
  'badge.v': ['V', 'ס'],
  'badge.in': ['IN', 'נכנס'],
  'badge.out': ['OUT', 'הוצא'],
  'badge.gk': ['GK', 'שוער'],
  'badge.sub': ['S', 'ס'],
  'badge.pen': ['P', 'פ'],
  'badge.fk': ['FK', 'ח'],
  'badge.corner': ['C', 'ק'],
  'badge.ft': ['FT', 'חינם'],
  'unit.pp': ['pp', ' נק׳ אחוז'],
  'draft.A': ['A', 'א'],
  'draft.B': ['B', 'ב'],
  'draft.C': ['C', 'ג'],
  'chipShort.WC': ['WC', 'וויילד'],
  'chipShort.FH': ['FH', 'פרי'],
  'chipShort.BB': ['BB', 'בנץ׳'],
  'chipShort.TC': ['TC', 'טריפל'],
  'pl.capLabel': ['C', 'ק'],
  'pl.copyHead': ['amitfpl plan · {gw} squad · {cost}', 'תוכנית amitfpl · סגל {gw} · {cost}'],
  'pl.copyXi': ['XI:', 'הרכב:'],
  'pl.copyTransfers': ['Transfers:', 'העברות:'],

  /* ---- status flags (state.js) ---- */
  'status.chance': ['{chance}% chance of playing', '{chance}% סיכוי לשחק'],
  'status.unavailable': ['Unavailable', 'לא זמין'],
  'status.d': ['Doubtful', 'מוטל בספק'],
  'status.i': ['Injured', 'פצוע'],
  'status.s': ['Suspended', 'מורחק'],
  'status.u': ['Unavailable', 'לא זמין'],
  'status.n': ['Not in squad', 'לא בסגל'],

  /* ---- set-piece badges (ui.js) ---- */
  'sp.penTitle': ['First-choice penalty taker', 'בועט פנדלים ראשון'],
  'sp.fkTitle': ['First-choice direct free kicks', 'בועט בעיטות חופשיות ישירות ראשון'],
  'sp.cornerTitle': ['First-choice corners & indirect FKs', 'מרים קרנות ובעיטות עקיפות ראשון'],

  /* ---- home ---- */
  'home.fixtures': ['{n} fixtures', '{n} משחקים'],
  'home.deadline': ['deadline {when}', 'דדליין {when}'],
  'home.toGo': ['{d}d {h}h to go', 'נותרו {d} ימים ו-{h} שעות'],
  'home.fixturesTitle': ['{gw} fixtures - your local time', 'משחקי {gw} - בשעון המקומי שלך'],
  'home.xgTitle': ['Expected goals - {gw}', 'שערים צפויים - {gw}'],
  'home.csTitle': ['Clean sheet chances', 'סיכויי שער נקי'],
  'home.capTitle': ['Captain picks', 'בחירות קפטן'],
  'home.scorersTitle': ['Likely scorers', 'מועמדים להבקיע'],
  'home.watchTitle': ['My watchlist', 'רשימת המעקב שלי'],
  'home.fullForecast': ['Full forecast', 'תחזית מלאה'],
  'home.gotoScout': ['Scout', 'סקאוט'],
  'home.gotoPlayers': ['Players', 'שחקנים'],
  'home.watchEmpty': ["Star players from their profile (open any player, tap Watch) and they'll show up here.", 'סמנו שחקנים למעקב מתוך הפרופיל שלהם (פתחו שחקן ולחצו "מעקב") והם יופיעו כאן.'],

  /* ---- players ---- */
  'players.dcTitle': ['Defensive contribution points (tackles, blocks, interceptions, clearances)', 'נקודות תרומה הגנתית (תיקולים, חסימות, חטיפות, הרחקות)'],
  'players.allTeams': ['All teams', 'כל הקבוצות'],
  'players.newSignings': ['New signings', 'רכשים חדשים'],
  'players.newTag': ['NEW', 'חדש'],
  'players.exportCsv': ['Export CSV', 'ייצוא CSV'],
  'players.exportTitle': ['Download the current filtered list as CSV', 'הורדת הרשימה המסוננת כקובץ CSV'],
  'players.count': ['{n} players', '{n} שחקנים'],
  'players.showingTop': [' · showing top {n}', ' · מוצגים {n} הראשונים'],
  'players.showMore': ['Show {n} more', 'הצג עוד {n}'],

  /* ---- scout ---- */
  'scout.topXpTitle': ['Expected points - the model\'s top picks for {gw}', 'נקודות צפויות - הבחירות המובילות של המודל ל{gw}'],
  'scout.topXpCol': ['xP', 'צפי נק׳'],
  'scout.topXpColTitle': ['Expected points in the upcoming gameweek (amitfpl model)', 'נקודות צפויות במחזור הקרוב (מודל amitfpl)'],
  'scout.scorersTitle': ['Scoring chances - most likely to find the net in {gw}', 'סיכויי הבקעה - הסבירים ביותר לכבוש ב{gw}'],
  'scout.creatorsTitle': ['Creators - most likely to assist in {gw}', 'יוצרי מצבים - הסבירים ביותר לבשל ב{gw}'],
  'scout.toScore': ['To score', 'להבקיע'],
  'scout.toScoreTitle': ['Chance of scoring at least once', 'סיכוי להבקיע לפחות פעם אחת'],
  'scout.toAssist': ['To assist', 'לבשל'],
  'scout.toAssistTitle': ['Chance of at least one assist', 'סיכוי לפחות לבישול אחד'],
  'scout.capTitle': ['Captaincy planner - best armband pick per gameweek (amitfpl model v2 · Elo-powered)', 'מתכנן קפטן - הבחירה הטובה ביותר לסרט לכל מחזור (מודל amitfpl v2 · מבוסס Elo)'],
  'scout.topPick': ['Top pick', 'בחירה ראשונה'],
  'scout.backup': ['Backup', 'גיבוי'],
  'scout.punt': ['Punt', 'הימור'],
  'scout.diffTitle': ['Differentials - high xP, low ownership', 'דיפרנציאלים - צפי גבוה, בעלות נמוכה'],
  'scout.ownedLess': ['Owned by less than', 'בבעלות פחות מ-'],
  'scout.valueTitle': ['Best value - points per £1M', 'התמורה הטובה ביותר - נקודות לכל מיליון £'],
  'scout.valueNote': ["Based on total points (last season's, until this season gets going).", 'מבוסס על סך הנקודות (של העונה שעברה, עד שהעונה הנוכחית תתקדם).'],
  'scout.ptsPerM': ['Pts/£M', 'נק׳/מיליון'],
  'scout.ptsPerMTitle': ['Total points per £1M', 'סך נקודות לכל מיליון £'],
  'scout.xpTitle': ['FPL expected points, next GW', 'נקודות צפויות, המחזור הבא'],

  /* ---- market ---- */
  'market.dGw': ['Δ GW', 'Δ מחזור'],
  'market.dGwTitle': ['Price change this gameweek', 'שינוי מחיר במחזור הנוכחי'],
  'market.dSeason': ['Δ Season', 'Δ עונה'],
  'market.dSeasonTitle': ['Price change since season start', 'שינוי מחיר מתחילת העונה'],
  'market.in': ['In (GW)', 'נכנסו (מחזור)'],
  'market.inTitle': ['Transfers in this gameweek', 'העברות פנימה במחזור הנוכחי'],
  'market.out': ['Out (GW)', 'יצאו (מחזור)'],
  'market.outTitle': ['Transfers out this gameweek', 'העברות החוצה במחזור הנוכחי'],
  'market.net': ['Net', 'נטו'],
  'market.netTitle': ['Net transfers this gameweek', 'מאזן העברות במחזור הנוכחי'],
  'market.movers': ['Movers', 'תזוזות'],
  'market.moversSince': ['Movers - since {date}', 'תזוזות - מאז {date}'],
  'market.trackingNote': ['Daily price & ownership tracking started {date} - risers and fallers appear here from tomorrow.', 'מעקב יומי אחרי מחירים ובעלות התחיל ב-{date} - עולים ויורדים יופיעו כאן החל ממחר.'],
  'market.today': ['today', 'היום'],
  'market.priceRisers': ['Price risers', 'עליות מחיר'],
  'market.priceFallers': ['Price fallers', 'ירידות מחיר'],
  'market.ownClimbers': ['Ownership climbers', 'עלייה בבעלות'],
  'market.ownDrops': ['Ownership drops', 'ירידה בבעלות'],
  'market.noneYet': ['none yet', 'אין עדיין'],
  'market.blurb': ['Price moves and transfer momentum - spot rises before they happen. Click headers to sort.', 'תנועות מחירים ומומנטום העברות - זהו עליות לפני שהן קורות. לחצו על כותרות למיון.'],
  'market.predTitle': ['Price-change radar (beta)', 'רדאר שינויי מחירים (ניסיוני)'],
  'market.predRise': ['Likely to rise tonight', 'צפויים לעלות הלילה'],
  'market.predFall': ['Likely to fall tonight', 'צפויים לרדת הלילה'],
  'market.predProgress': ['Progress', 'התקדמות'],
  'market.predProgressTitle': ['Estimated progress toward a price change, from net transfers vs. owner count', 'התקדמות משוערת לקראת שינוי מחיר, לפי מאזן העברות מול מספר המחזיקים'],
  'market.predQuiet': ['No meaningful transfer momentum right now - the radar wakes up once transfers start flowing.', 'אין מומנטום העברות משמעותי כרגע - הרדאר מתעורר כשההעברות מתחילות לזרום.'],
  'market.predBeta': ['net transfers vs. owners · an indication, not a promise', 'מאזן העברות מול מחזיקים · אינדיקציה, לא הבטחה'],
  'market.allZeros': ['All zeros for now - this comes alive once the season starts.', 'הכל אפסים בינתיים - זה מתעורר לחיים כשהעונה מתחילה.'],

  /* ---- status tab ---- */
  'statusTab.title': ['Injuries & doubts - official FPL flags, sorted by ownership', 'פציעות וספקות - דגלים רשמיים של FPL, ממוין לפי בעלות'],
  'statusTab.doubtOnly': ['Doubtful only', 'רק מוטלים בספק'],
  'statusTab.status': ['Status', 'סטטוס'],
  'statusTab.news': ['News', 'חדשות'],
  'statusTab.noneFlagged': ["No flagged players right now - everyone's fit. ", 'אין שחקנים מסומנים כרגע - כולם כשירים. '],
  'statusTab.suspTitle': ['Suspension watch - {n} yellows = 1-match ban (through GW{gw})', 'מעקב הרחקות - {n} צהובים = מחזור הרחקה (עד מחזור {gw})'],
  'statusTab.yellows': ['Yellows', 'צהובים'],
  'statusTab.banDistance': ['Ban distance', 'מרחק מהרחקה'],
  'statusTab.banned': ['Banned', 'מורחק'],
  'statusTab.oneAway': ['1 away!', 'צהוב אחד מהרחקה!'],
  'statusTab.nAway': ['{n} away', '{n} מהרחקה'],
  'statusTab.nobodyNear': ['Nobody near a ban yet.', 'אף אחד לא קרוב להרחקה עדיין.'],
  'statusTab.cardsReset': ['Card counts reset when the season kicks off - this fills up as yellows pile up.', 'ספירת הכרטיסים מתאפסת עם פתיחת העונה - הטבלה תתמלא ככל שיצטברו צהובים.'],

  /* ---- compare ---- */
  'cmp.position': ['Position', 'עמדה'],
  'cmp.selectedBy': ['Selected by', 'בבעלות'],
  'cmp.xpNextGw': ['xP next GW', 'xP במחזור הבא'],
  'cmp.totalPoints': ['Total points', 'סך נקודות'],
  'cmp.ppg': ['Points per game', 'נקודות למשחק'],
  'cmp.minutes': ['Minutes', 'דקות'],
  'cmp.goals': ['Goals', 'שערים'],
  'cmp.assists': ['Assists', 'בישולים'],
  'cmp.xgPer90': ['xG per 90', 'xG ל-90 דק׳'],
  'cmp.bonus': ['Bonus points', 'נקודות בונוס'],
  'cmp.value': ['Value (pts/£M)', 'תמורה (נק׳/מיליון)'],
  'cmp.next5': ['Next 5 fixtures', '5 המשחקים הבאים'],
  'cmp.playerN': ['Player {n}', 'שחקן {n}'],
  'cmp.optional': [' (optional)', ' (רשות)'],
  'cmp.metric': ['Metric', 'מדד'],
  'cmp.note': ["Green = best of the compared players. Season stats are last season's until this one gets going.", 'ירוק = הטוב מבין המושווים. נתוני העונה הם של העונה שעברה עד שהנוכחית תתקדם.'],
  'cmp.pickTwo': ['Pick at least two players above to compare them. 👆', 'בחרו לפחות שני שחקנים למעלה כדי להשוות ביניהם. 👆'],

  /* ---- fixtures ---- */
  'fx.forecastTitle': ['Goals & clean sheet forecast', 'תחזית שערים ושערים נקיים'],
  'fx.modelNote': ['amitfpl model · sorted by expected goals', 'מודל amitfpl · ממוין לפי שערים צפויים'],
  'fx.shootout': ['Shootout watch', 'צפי למטחי שערים'],
  'fx.shootoutTitle': ['Combined expected goals', 'שערים צפויים משולב'],
  'fx.goals': ['Goals', 'שערים'],
  'fx.goalsTitle': ['Expected goals scored', 'שערים צפויים'],
  'fx.cleanSheet': ['Clean sheet', 'שער נקי'],
  'fx.csTitle': ['Clean sheet probability', 'הסתברות לשער נקי'],
  'fx.blanksTitle': ['Blanks & doubles - chip planning radar', 'בלנקים וכפולים - רדאר לתכנון צ׳יפים'],
  'fx.doubleGw': ['Double gameweek', 'מחזור כפול'],
  'fx.blankGw': ['Blank gameweek', 'מחזור בלנק'],
  'fx.noneDetected': ['None detected yet - blanks and doubles usually appear mid-season when cup games force postponements.', 'לא זוהו עדיין - בלנקים וכפולים מופיעים בדרך כלל באמצע העונה כשמשחקי גביע גורמים לדחיות.'],
  'fx.swingsTitle': ['Fixture swings - when to buy in / sell out', 'תפניות בלוח - מתי לקנות / למכור'],
  'fx.easier': ['↗ Gets easier', '↗ נהיה קל יותר'],
  'fx.easierNote': [' after the next 3 GWs - buy their assets early', ' אחרי 3 המחזורים הבאים - כדאי לקנות מהם מוקדם'],
  'fx.harder': ['↘ Gets harder', '↘ נהיה קשה יותר'],
  'fx.harderNote': [' - enjoy them now, plan the exit', ' - תיהנו מהם עכשיו ותתכננו את היציאה'],
  'fx.gw48': ['GW +4–8', 'מחזור ‎+4–8'],
  'fx.rotationTitle': ['Rotation pairs - always play the easier fixture (next 8 GWs)', 'זוגות רוטציה - לשחק תמיד את המשחק הקל יותר (8 המחזורים הבאים)'],
  'fx.rotationNote': ['Best duos for budget goalkeepers and defenders: pick one of each, start whoever has the friendlier match.', 'הצמדים הטובים ביותר לשוערים ומגנים זולים: קחו אחד מכל קבוצה והציבו את מי שיש לו משחק נוח יותר.'],
  'fx.pair': ['Pair', 'צמד'],
  'fx.avgBestFdr': ['Avg best FDR', 'FDR מיטבי ממוצע'],
  'fx.avgBestFdrTitle': ['Average difficulty when always choosing the easier fixture', 'קושי ממוצע כשבוחרים תמיד את המשחק הקל יותר'],
  'fx.sortEase': ['Sort: easiest run first', 'מיון: הרצף הקל קודם'],
  'fx.sortName': ['Sort: team name', 'מיון: שם קבוצה'],
  'fx.difficulty': ['Difficulty:', 'קושי:'],
  'fx.avg': ['Avg', 'ממוצע'],
  'fx.avgTitle': ['Average difficulty over horizon (blanks count as 5)', 'קושי ממוצע על פני הטווח (בלנק נחשב 5)'],

  /* ---- lineups ---- */
  'lu.note': ["amitfpl projection - from last season's starts, squad pricing and availability flags. Chip on each player = FPL ownership. Expect this to sharpen as real minutes come in; it can't know preseason friendlies or press conferences (yet).", 'תחזית amitfpl - לפי הרכבים של העונה שעברה, תמחור הסגל ודגלי כשירות. התגית על כל שחקן = אחוז בעלות ב-FPL. התחזית תתחדד ככל שיצטברו דקות אמיתיות; היא לא מכירה משחקי הכנה או מסיבות עיתונאים (בינתיים).'],
  'lu.noFixture': ['no fixture scheduled', 'אין משחק מתוכנן'],
  'lu.out': ['Out:', 'בחוץ:'],
  'lu.eloTitle': ['ClubElo rating', 'דירוג ClubElo'],
  'lu.doubtful': ['Doubtful', 'מוטל בספק'],

  /* ---- matches ---- */
  'mt.gameweek': ['Gameweek', 'מחזור'],
  'mt.tbc': ['TBC', 'טרם נקבע'],
  'mt.ft': ['FT', 'סיום'],
  'mt.live': ['LIVE', 'חי'],
  'mt.goals': ['Goals', 'שערים'],
  'mt.assists': ['Assists', 'בישולים'],
  'mt.bonus': ['Bonus', 'בונוס'],
  'mt.blurb': ['Scores and FPL events (goals, assists, bonus) appear as games are played - data refreshes every 30 min.', 'תוצאות ואירועי FPL (שערים, בישולים, בונוס) מופיעים תוך כדי המשחקים - הנתונים מתעדכנים כל 30 דקות.'],
  'mt.noFixtures': ['No fixtures scheduled for this gameweek yet.', 'אין עדיין משחקים מתוכננים למחזור הזה.'],

  /* ---- set pieces ---- */
  'sp.blurb': ['Official FPL scout data - first-choice taker, then backups. Updates as the season goes.', 'נתוני סקאוט רשמיים של FPL - הבועט הראשון, ואחריו הגיבויים. מתעדכן לאורך העונה.'],
  'sp.penalties': ['Penalties', 'פנדלים'],
  'sp.freeKicks': ['Direct free kicks', 'בעיטות חופשיות ישירות'],
  'sp.corners': ['Corners & indirect FKs', 'קרנות ובעיטות עקיפות'],
  'sp.then': ['then {names}', 'אחריו {names}'],

  /* ---- my team ---- */
  'myteam.connectTitle': ['Connect your FPL team', 'חיבור קבוצת ה-FPL שלך'],
  'myteam.intro': ['All it takes is your <strong>Team ID</strong> - no password needed. To find it:', 'כל מה שצריך זה את <strong>מזהה הקבוצה (Team ID)</strong> - בלי סיסמה. איך מוצאים אותו:'],
  'myteam.step1': ['Log in at <strong>fantasy.premierleague.com</strong>', 'היכנסו ל-<strong>fantasy.premierleague.com</strong>'],
  'myteam.step2': ['Go to the <strong>Points</strong> page', 'עברו לעמוד ה-<strong>Points</strong>'],
  'myteam.step3': ['Look at the address bar: <code>…/entry/<strong>1234567</strong>/event/1</code> - that number is your Team ID', 'הביטו בשורת הכתובת: <code>…/entry/<strong>1234567</strong>/event/1</code> - המספר הזה הוא מזהה הקבוצה שלכם'],
  'myteam.preseason': ["Season hasn't started yet? Create your squad on the official site first, then come back here after the GW1 deadline - your ID appears once the season kicks off.", 'העונה עוד לא התחילה? צרו סגל באתר הרשמי קודם, וחזרו לכאן אחרי דדליין מחזור 1 - המזהה יופיע ברגע שהעונה תצא לדרך.'],
  'myteam.placeholder': ['e.g. 1234567', 'למשל 1234567'],
  'myteam.connect': ['Connect', 'חיבור'],
  'myteam.loading': ['Loading your team…', 'טוען את הקבוצה שלך…'],
  'myteam.notFound': ['Team ID {id} was not found. Double-check the number and try again.', 'מזהה הקבוצה {id} לא נמצא. בדקו שוב את המספר ונסו שנית.'],
  'myteam.noLive': ['Live team lookup isn\'t available on the hosted site. Set "teamId": {id} in config.json in the GitHub repo - the data refresher will pick it up within 30 minutes.', 'שליפת קבוצה חיה לא זמינה באתר המתארח. הגדירו ‎"teamId": {id}‎ בקובץ config.json בריפו של GitHub - מרענן הנתונים יקלוט את זה תוך 30 דקות.'],
  'myteam.overallPts': ['Overall points', 'נקודות כולל'],
  'myteam.overallRank': ['Overall rank', 'דירוג כללי'],
  'myteam.gwPts': ['{gw} points', 'נקודות {gw}'],
  'myteam.teamValue': ['Team value', 'שווי קבוצה'],
  'myteam.inBank': ['In the bank', 'בבנק'],
  'myteam.transfers': ['Total transfers', 'סך העברות'],
  'myteam.squadGw': ['Squad - {gw}', 'סגל - {gw}'],
  'myteam.gwPtsCol': ['GW Pts', 'נק׳ מחזור'],
  'myteam.squadSoon': ['Your squad will appear here once the season starts (picks are public after the GW1 deadline, Aug 21).', 'הסגל שלך יופיע כאן כשהעונה תתחיל (הסגלים נחשפים אחרי דדליין מחזור 1, ‏21 באוגוסט).'],
  'myteam.changeId': ['Change team ID', 'החלפת מזהה קבוצה'],
  'myteam.livePts': ['{gw} live', '{gw} בשידור חי'],
  'myteam.liveMin': ["' played", ' דקות משחק'],
  'myteam.leagues': ['My leagues', 'הליגות שלי'],
  'myteam.leagueName': ['League', 'ליגה'],
  'myteam.leagueRank': ['Rank', 'דירוג'],
  'myteam.leagueTeam': ['Team', 'קבוצה'],
  'myteam.leagueManager': ['Manager', 'מנג׳ר'],
  'myteam.leagueTotal': ['Total', 'סה״כ'],

  /* ---- player drawer ---- */
  'dw.noData': ['no data yet', 'אין נתונים עדיין'],
  'dw.trackingToday': ['tracking since today', 'במעקב מהיום'],
  'dw.trends': ['Trends', 'מגמות'],
  'dw.trendsSince': ['· daily since Aug 2026', '· יומי מאז אוג׳ 2026'],
  'dw.price': ['Price', 'מחיר'],
  'dw.ownership': ['Ownership', 'בעלות'],
  'dw.owned': ['owned {pct}%', 'בבעלות {pct}%'],
  'dw.watch': ['☆ Watch', '☆ מעקב'],
  'dw.watching': ['Watching', 'במעקב'],
  'dw.compare': ['Compare', 'השוואה'],
  'dw.ptsLastSzn': ['Pts (last szn)', 'נק׳ (עונה שעברה)'],
  'dw.minutes': ['Minutes', 'דקות'],
  'dw.bonus': ['Bonus', 'בונוס'],
  'dw.defcon': ['DefCon', 'תרומה הגנתית'],
  'dw.yellows': ['Yellows', 'צהובים'],
  'dw.starts': ['Starts', 'הרכבים'],
  'dw.upcoming': ['Upcoming - model forecast', 'המשחקים הבאים - תחזית המודל'],
  'dw.nextN': ['· next {n}: {xp} xP', '· {n} הבאים: {xp} צפי'],
  'dw.thisSeason': ['This season - last {n} GWs', 'העונה - {n} המחזורים האחרונים'],
  'dw.opp': ['Opp', 'יריבה'],
  'dw.g': ['G', 'ש׳'],
  'dw.a': ['A', 'ב׳'],
  'dw.pastSeasons': ['Past seasons', 'עונות קודמות'],
  'dw.season': ['Season', 'עונה'],
  'dw.cs': ['CS', 'ש״נ'],
  'dw.historyNote': ['Detailed history needs the live API - available when running locally.', 'היסטוריה מפורטת דורשת את ה-API החי - זמין בהרצה מקומית.'],

  /* ---- planner ---- */
  'pl.chipWC': ['Wildcard', 'וויילדקארד'],
  'pl.chipFH': ['Free Hit', 'פרי היט'],
  'pl.chipBB': ['Bench Boost', 'בנץ׳ בוסט'],
  'pl.chipTC': ['Triple Captain', 'טריפל קפטן'],
  'pl.autoBuild': ['Auto-build squad', 'בניית סגל אוטומטית'],
  'pl.reOptimize': ['Re-optimize', 'אופטימיזציה מחדש'],
  'pl.optimizing': ['Optimizing…', 'מבצע אופטימיזציה…'],
  'pl.assistant': ['Assistant', 'עוזר'],
  'pl.bank': ['Bank', 'בנק'],
  'pl.planXp': ['Plan xP', 'צפי לתוכנית'],
  'pl.hits': ['(-{n} hits)', '(-{n} קנסות)'],
  'pl.share': ['Share', 'שיתוף'],
  'pl.shareTitle': ['Copy a link that opens this exact plan on any device', 'העתקת קישור שפותח בדיוק את התוכנית הזו בכל מכשיר'],
  'pl.linkCopied': ['Link copied', 'הקישור הועתק'],
  'pl.copy': ['Copy', 'העתקה'],
  'pl.copied': ['Copied', 'הועתק'],
  'pl.draftsTitle': ['Squad drafts - each slot is a separate plan', 'טיוטות סגל - כל משבצת היא תוכנית נפרדת'],
  'pl.picked': ['{n}/11 picked', 'נבחרו {n}/11'],
  'pl.gwForecast': ['{gw} forecast', 'תחזית {gw}'],
  'pl.pts': ['pts', 'נק׳'],
  'pl.autoLineup': ['· auto lineup', '· הרכב אוטומטי'],
  'pl.chipsBar': ['Chips · {gw}', 'צ׳יפים · {gw}'],
  'pl.chipNoteTC': ['Triple Captain active · {name} counts ×3 this GW · +{n} extra pts in the forecast', 'טריפל קפטן פעיל · {name} נספר פי 3 במחזור הזה · תוספת {n} נק׳ לתחזית'],
  'pl.chipNoteBB': ['Bench Boost active · all 4 bench players count this GW · +{n} pts in the forecast', 'בנץ׳ בוסט פעיל · כל 4 שחקני הספסל נספרים במחזור הזה · תוספת {n} נק׳ לתחזית'],
  'pl.chipNoteWC': ['Wildcard active · unlimited free transfers this GW', 'וויילדקארד פעיל · העברות חינם ללא הגבלה במחזור הזה'],
  'pl.chipNoteFH': ['Free Hit active · unlimited free moves this GW; the squad reverts next GW', 'פרי היט פעיל · מהלכים חינם ללא הגבלה במחזור הזה; הסגל חוזר לקדמותו במחזור הבא'],
  'pl.benchCounts': ['counts this GW!', 'נספר במחזור הזה!'],
  'pl.alsoPlanned': ['Also planned: {gws}', 'מתוכנן גם: {gws}'],
  'pl.gwTransfers': ['{gw} transfers', 'העברות {gw}'],
  'pl.ftTitle': ['Free transfers available entering this GW', 'העברות חינם זמינות בכניסה למחזור'],
  'pl.hit': ['-{n} hit', 'קנס {n}-'],
  'pl.movesFree': ['{chip} - moves are free', '{chip} - ההעברות חינם'],
  'pl.noMoves': ['no moves planned - use OUT on a player or + in the list', 'אין העברות מתוכננות - לחצו OUT על שחקן או + ברשימה'],
  'pl.pendingIn': ['Adding {name} - click the squad player to replace (highlighted)', 'מוסיפים את {name} - לחצו על שחקן הסגל שיוחלף (מודגש)'],
  'pl.pendingOut': ['Transferring out {name} - pick a replacement from the list', 'מוציאים את {name} - בחרו מחליף מהרשימה'],
  'pl.cancelLower': ['cancel', 'ביטול'],
  'pl.buildHint': ['Pick your 15 - tap an empty spot to filter the list, or let <strong>Auto-build</strong> do it.', 'בחרו את ה-15 שלכם - הקישו על משבצת ריקה לסינון הרשימה, או תנו ל<strong>בנייה האוטומטית</strong> לעבוד.'],
  'pl.pickedCount': ['{n}/15 picked · max 3 per club', 'נבחרו {n}/15 · מקס׳ 3 ממועדון'],
  'pl.add': ['Add', 'הוספה'],
  'pl.addTitle': ['Pick players from the list', 'בחרו שחקנים מהרשימה'],
  'pl.pickPos': ['Pick a {pos} from the list', 'בחרו {pos} מהרשימה'],
  'pl.makeCaptain': ['Make captain', 'מינוי לקפטן'],
  'pl.swapTitle': ['Swap with bench/pitch', 'החלפה עם הספסל/המגרש'],
  'pl.removeTitle': ['Remove from squad', 'הסרה מהסגל'],
  'pl.transferOutGw': ['Transfer out in {gw}', 'העברה החוצה ב{gw}'],
  'pl.transferredIn': ['Transferred in this GW', 'הועבר פנימה במחזור הזה'],
  'pl.sheetSwap': ['⇄ Swap with bench/pitch', '⇄ החלפה עם הספסל/המגרש'],
  'pl.sheetRemove': ['✕ Remove from squad', '✕ הסרה מהסגל'],
  'pl.swapMode': ['Swap mode: pick a highlighted player, or click ⇄ again to cancel.', 'מצב החלפה: בחרו שחקן מודגש, או לחצו ⇄ שוב לביטול.'],
  'pl.sortXp': ['Sort: xP', 'מיון: צפי'],
  'pl.priceDesc': ['Price ↓', 'מחיר ↓'],
  'pl.priceAsc': ['Price ↑', 'מחיר ↑'],
  'pl.ownedPct': ['Owned %', '% בעלות'],
  'pl.noMatch': ['No players match.', 'אין שחקנים תואמים.'],
  'pl.max3': ['Max 3 per club', 'מקס׳ 3 ממועדון'],
  'pl.overBudget': ['Over budget for this swap', 'חורג מהתקציב להחלפה הזו'],
  'pl.addToSquad': ['Add to squad', 'הוספה לסגל'],
  'pl.transferInFor': ['Transfer in for {name}', 'העברה פנימה במקום {name}'],
  'pl.transferInto': ['Transfer into the {gw} squad', 'העברה פנימה לסגל של {gw}'],
  'pl.sideXpTitle': ['Expected points over the plan horizon', 'נקודות צפויות על פני טווח התכנון'],
  'pl.asIncomplete': ["Your squad has {n}/15 players - hit <strong>Auto-build squad</strong> and I'll take it from there.", 'בסגל שלכם {n}/15 שחקנים - לחצו על <strong>בנייה אוטומטית</strong> ומשם אני ממשיך.'],
  'pl.asSubtitle': ['· amitfpl xP model · {n}-GW plan incl. transfer hits', '· מודל הצפי של amitfpl · תוכנית ל-{n} מחזורים כולל קנסות העברה'],
  'pl.asInFor': ['<strong>{in}</strong> in for <strong>{out}</strong>', '<strong>{in}</strong> נכנס במקום <strong>{out}</strong>'],
  'pl.asBaseChange': ['base squad change', 'שינוי בסגל הבסיס'],
  'pl.asGwTransfer': ['as a {gw} transfer', 'כהעברה ב{gw}'],
  'pl.asApply': ['Apply', 'החלה'],
  'pl.asNoUpgrades': ["✅ No clear upgrades within budget for this GW's squad.", '✅ אין שדרוגים ברורים במסגרת התקציב לסגל של המחזור הזה.'],
  'pl.asBetterXi': ['📋 A different XI scores <span class="hi">+{n} xP</span> in {gw}', '📋 הרכב אחר משיג <span class="hi">‎+{n} xP</span> ב{gw}'],
  'pl.asBestArmband': ['Best armband for {gw}: <strong>{name}</strong>', 'הסרט הטוב ביותר ל{gw}: <strong>{name}</strong>'],
  'pl.asSetCaptain': ['Set captain', 'מינוי קפטן'],
  'pl.asTcWindow': ['Best Triple Captain window: <strong>{gw}</strong> <span class="muted">captain projects {n} → ×3</span>', 'החלון הטוב ביותר לטריפל קפטן: <strong>{gw}</strong> <span class="muted">הקפטן צפוי ל-{n} ‏← ×3</span>'],
  'pl.asPlanTc': ['Plan TC', 'תכנון TC'],
  'pl.asBbWindow': ['Best Bench Boost window: <strong>{gw}</strong> <span class="muted">bench projects +{n}</span>', 'החלון הטוב ביותר לבנץ׳ בוסט: <strong>{gw}</strong> <span class="muted">הספסל צפוי ל-‎+{n}</span>'],
  'pl.asPlanBb': ['Plan BB', 'תכנון BB'],

  /* ---- draft comparison & team import ---- */
  'pl.cmpTitle': ['Compare drafts', 'השוואת טיוטות'],
  'pl.cmpDraft': ['Draft', 'טיוטה'],
  'pl.cmpValue': ['Value', 'שווי'],
  'pl.cmpChips': ['Chips', 'צ׳יפים'],
  'pl.cmpDiff': ['Differences vs active draft', 'הבדלים מול הטיוטה הפעילה'],
  'pl.cmpActive': ['the active draft', 'הטיוטה הפעילה'],
  'pl.cmpEmpty': ['empty', 'ריקה'],
  'pl.cmpSame': ['identical squad', 'סגל זהה'],
  'pl.cmpNote': ['● marks the active draft. Switch drafts with the A/B/C buttons in the toolbar.', '● מסמן את הטיוטה הפעילה. מחליפים טיוטה עם כפתורי א/ב/ג בסרגל.'],
  // Home: upload-your-squad strip
  'home.acTitle': ['Upload your squad - get an instant AI read', 'העלו את הסגל שלכם - קבלו ניתוח AI מיידי'],
  'home.acSub': ['Connect your FPL team ID once; captain call, transfer ideas and injury warnings come automatically.', 'מתחברים עם מזהה הקבוצה פעם אחת - קפטן מומלץ, רעיונות להעברות והתראות פציעה מגיעים אוטומטית.'],
  'home.acBtn': ['Analyze my squad', 'נתחו את הסגל שלי'],
  'home.acReadyTitle': ['Your squad analysis is ready', 'ניתוח הסגל שלכם מוכן'],
  'home.acReadySub': ['Captain call, transfer ideas and lineup checks for the coming gameweek.', 'קפטן מומלץ, רעיונות להעברות ובדיקת הרכב למחזור הקרוב.'],
  'home.acReadyBtn': ['See my analysis', 'לניתוח שלי'],

  // My Team: AI squad analysis card
  'an.title': ['🧠 AI squad analysis', '🧠 ניתוח AI של הסגל'],
  'an.grade.top': ['Elite squad', 'סגל מצוין'],
  'an.grade.good': ['Strong squad', 'סגל חזק'],
  'an.grade.ok': ['Decent squad', 'סגל סביר'],
  'an.grade.work': ['Needs work', 'דורש עבודה'],
  'an.outlook': ['Your XI projects to <strong>{pts} pts</strong> in {gw} (captain counted twice).', 'ההרכב שלך צפוי להביא <strong>{pts} נק׳</strong> ב{gw} (הקפטן נספר כפול).'],
  'an.flagged': ['<strong>{name}</strong> is flagged: {label} - have a replacement ready.', '<strong>{name}</strong> מסומן: {label} - כדאי להכין מחליף.'],
  'an.capGood': ['Captaincy: <strong>{name}</strong> is the model\'s top pick ({xp} xP) - you\'re set.', 'קפטן: <strong>{name}</strong> הוא הבחירה המובילה של המודל ({xp} צפי) - אתם מסודרים.'],
  'an.capSwap': ['Better captain: <strong>{rec}</strong> ({xp} xP) over {cur}.', 'קפטן עדיף: <strong>{rec}</strong> ({xp} צפי) במקום {cur}.'],
  'an.transfer': ['Upgrade: <strong>{out} → {in}</strong> (+{gain} pts over 5 GWs, fits your bank).', 'שדרוג: <strong>{out} ← {in}</strong> (‎+{gain} נק׳ ל-5 מחזורים, נכנס בתקציב).'],
  'an.noTransfer': ['No clear upgrade inside your budget ({bank} in the bank) - saving the transfer is fine.', 'אין שדרוג ברור בתקציב ({bank} בבנק) - אפשר לשמור את ההעברה בראש שקט.'],
  'an.lineup': ['Lineup: start <strong>{ins}</strong> instead of {outs} (+{gain} xP this GW).', 'הרכב: הכניסו את <strong>{ins}</strong> במקום {outs} (‎+{gain} צפי במחזור).'],
  'an.lineupOk': ['Your lineup matches the model\'s best XI - nothing to change.', 'ההרכב שלכם תואם ל-11 הטובים לפי המודל - אין מה לשנות.'],

  'myteam.import': ['Import to planner', 'ייבוא למתכנן'],
  'myteam.importTitle': ['Copy this squad into the planner\'s active draft (replaces its current plan)', 'העתקת הסגל הזה לטיוטה הפעילה במתכנן (מחליף את התוכנית הנוכחית בה)'],

  /* ---- deadline day & onboarding ---- */
  'home.deadlineDay': ['Deadline day!', 'יום דדליין!'],
  'home.hoursLeft': ['{h}h {m}m left!', 'נותרו {h} שעות ו-{m} דקות!'],
  'home.toPlanner': ['Final touches in the planner →', 'ליטושים אחרונים במתכנן ←'],
  'ob.title': ['Welcome to amitfpl 👋', 'ברוכים הבאים ל-amitfpl 👋'],
  'ob.sub': ['Your personal FPL toolkit. The 60-second tour:', 'ערכת ה-FPL האישית שלך. סיור של 60 שניות:'],
  'ob.item1': ['<strong>Players</strong> - every player, sortable, filterable; click one for the full profile.', '<strong>שחקנים</strong> - כל השחקנים עם מיון וסינון; לחיצה על שחקן פותחת פרופיל מלא.'],
  'ob.item2': ['<strong>Planner</strong> - build your squad on a pitch, plan transfers and chips for future GWs.', '<strong>מתכנן</strong> - בניית סגל על מגרש, תכנון העברות וצ׳יפים למחזורים הבאים.'],
  'ob.item3': ['<strong>Scout & Fixtures</strong> - captain picks, likely scorers and the difficulty planner.', '<strong>סקאוט ולוח משחקים</strong> - בחירות קפטן, מועמדים להבקיע ומתכנן הקושי.'],
  'ob.item4': ['<strong>My Team</strong> - connect your real FPL squad with your Team ID.', '<strong>הקבוצה שלי</strong> - חיבור הסגל האמיתי עם מזהה הקבוצה.'],
  'ob.item5': ['Language (EN/עב), dark mode and help (?) live in the top bar.', 'שפה (EN/עב), מצב כהה ועזרה (?) נמצאים בסרגל העליון.'],
  'ob.go': ["Let's go", 'יאללה, מתחילים'],

  /* ---- intro strip (Home) ---- */
  'intro.slogan': ['Win your mini-league with data, not gut feelings.', 'לנצח את המיני-ליגה עם דאטה, לא עם תחושות בטן.'],
  'intro.line1': ['amitfpl is a Fantasy Premier League toolkit: an expected-points model for every player, a squad planner with transfer simulation, predicted lineups, a price-change radar and live match data.', 'amitfpl היא ערכת כלים לפנטזי של הפרמייר ליג: מודל נקודות צפויות לכל שחקן, מתכנן סגל עם סימולציית העברות, הרכבים צפויים, רדאר שינויי מחירים ונתוני משחקים חיים.'],
  'intro.line2': ['Everything refreshes automatically from official data every 30 minutes - so picking a captain, planning chips and beating your rivals takes minutes, not hours.', 'הכל מתעדכן אוטומטית מנתונים רשמיים כל 30 דקות - כך שבחירת קפטן, תכנון צ׳יפים וניצחון על היריבים לוקחים דקות, לא שעות.'],

  /* ---- ⓘ method explainers ---- */
  'info.how': ['How is this computed?', 'איך זה מחושב?'],
  'info.model': ['Our expected-points (xP) model blends each player\'s per-90 numbers (xG, xA, saves, bonus, defensive contribution) with projected minutes, then adjusts for the fixture using daily ClubElo team ratings - opponent strength, clean-sheet odds and home advantage. Data: the official FPL API + ClubElo, refreshed every 30 minutes.', 'מודל הנקודות הצפויות (צפי) משלב את נתוני ה-90 דקות של כל שחקן (שערים ובישולים צפויים, הצלות, בונוס, תרומה הגנתית) עם צפי דקות משחק, ומתאם לפי המשחק באמצעות דירוגי ClubElo יומיים - חוזק היריבה, סיכויי שער נקי ויתרון ביתיות. הנתונים: ה-API הרשמי של FPL ‏+ ClubElo, מתעדכנים כל 30 דקות.'],
  'info.goalChance': ['Scoring chance = the probability of at least one goal, from a Poisson distribution over the player\'s expected goals (xG per 90 × projected minutes), scaled by how many goals his team is expected to score against this specific opponent (Elo-based).', 'סיכוי הבקעה = ההסתברות לפחות לשער אחד, לפי התפלגות פואסון על השערים הצפויים של השחקן (xG ל-90 דקות × צפי דקות), מותאם לכמות השערים שהקבוצה שלו צפויה להבקיע מול היריבה הספציפית (מבוסס Elo).'],
  'info.assistChance': ['Assist chance = the probability of at least one assist, from a Poisson distribution over the player\'s expected assists, adjusted for the fixture the same way as goals.', 'סיכוי בישול = ההסתברות לפחות לבישול אחד, לפי התפלגות פואסון על הבישולים הצפויים של השחקן, מותאם למשחק באותה שיטה כמו שערים.'],
  'info.captaincy': ['For each gameweek we rank every available player by model xP - the top three become the armband picks. Captain doubling isn\'t shown because it doesn\'t change the ranking.', 'לכל מחזור אנחנו מדרגים את כל השחקנים הזמינים לפי צפי המודל - שלושת הראשונים הם המועמדים לסרט. הכפלת הקפטן לא מוצגת כי היא לא משנה את הדירוג.'],
  'info.forecast': ['Team goals come from the Elo gap between the sides (plus home advantage); the clean-sheet chance is the Poisson probability that the opponent scores zero given their expected goals.', 'שערי קבוצה נגזרים מפער ה-Elo בין הקבוצות (בתוספת יתרון ביתיות); סיכוי השער הנקי הוא הסתברות פואסון שהיריבה לא תבקיע בהינתן השערים הצפויים לה.'],
  'info.value': ['Value = total points per £1M of price. Until the season gets going it uses last season\'s points.', 'תמורה = סך נקודות לכל מיליון ליש״ט של מחיר. עד שהעונה תתקדם החישוב מבוסס על נקודות העונה שעברה.'],
  'info.fdr': ['Difficulty (1-5) comes from the opponent\'s venue-adjusted ClubElo rating - sharper than the official flat rating, which lumps all promoted sides together. When Elo is missing we fall back to the official FDR.', 'הקושי (1-5) נגזר מדירוג ה-ClubElo של היריבה מותאם למגרש - חד יותר מהדירוג הרשמי השטוח, שמקבץ את כל העולות יחד. כשאין Elo חוזרים ל-FDR הרשמי.'],
  'info.priceRadar': ['FPL keeps its price algorithm secret. We estimate progress toward a change from net transfers this gameweek relative to the player\'s owner count - an indication, not a promise.', 'FPL שומרת את אלגוריתם המחירים בסוד. אנחנו מעריכים התקדמות לקראת שינוי לפי מאזן ההעברות במחזור ביחס למספר המחזיקים - אינדיקציה, לא הבטחה.'],
  'info.movers': ['We sample every player\'s price and ownership once a day; movers show the change since tracking began.', 'אנחנו דוגמים מחיר ובעלות של כל שחקן פעם ביום; התזוזות מציגות את השינוי מאז תחילת המעקב.'],
  'info.status': ['Availability flags and injury news come straight from the official FPL API - the same alerts the official site shows, refreshed every 30 minutes.', 'דגלי הכשירות וחדשות הפציעות מגיעים ישירות מה-API הרשמי של FPL - אותן התראות שמציג האתר הרשמי, מתעדכן כל 30 דקות.'],

  /* ---- accounts & sync ---- */
  'auth.signIn': ['Sign in', 'התחברות'],
  'auth.signInTitle': ['Sign in to sync your squad, plans and watchlist across devices', 'התחברו כדי לסנכרן סגל, תוכניות ורשימת מעקב בין מכשירים'],
  'auth.account': ['My account', 'החשבון שלי'],
  'auth.accountTitle': ['Signed in as {email}', 'מחוברים בתור {email}'],
  'auth.pitch': ['Free account = your plans, team ID and watchlist on every device.', 'חשבון חינמי = התוכניות, מזהה הקבוצה ורשימת המעקב שלכם בכל מכשיר.'],
  'auth.email': ['Email', 'אימייל'],
  'auth.password': ['Password', 'סיסמה'],
  'auth.register': ['Create account', 'יצירת חשבון'],
  'auth.forgot': ['Forgot password?', 'שכחתי סיסמה'],
  'auth.or': ['or', 'או'],
  'auth.google': ['Continue with Google', 'המשך עם Google'],
  'auth.guest': ['Continue as guest (no account)', 'המשך כאורח (בלי חשבון)'],
  'auth.signOut': ['Sign out', 'התנתקות'],
  'auth.syncNote': ['Your drafts, team ID, watchlist and preferences sync automatically to this account.', 'הטיוטות, מזהה הקבוצה, רשימת המעקב וההעדפות מסתנכרנים אוטומטית לחשבון הזה.'],
  'auth.privacy': ['Only your amitfpl data (plans, team ID, watchlist, preferences) is stored - nothing else.', 'נשמרים רק נתוני ה-amitfpl שלכם (תוכניות, מזהה קבוצה, רשימת מעקב, העדפות) - שום דבר מעבר.'],
  'auth.resetSent': ['Password reset email sent - check your inbox.', 'מייל לאיפוס סיסמה נשלח - בדקו את תיבת הדואר.'],
  'auth.errEmail': ['That email address doesn\'t look right.', 'כתובת האימייל לא נראית תקינה.'],
  'auth.errPassword': ['Please enter a password.', 'נא להזין סיסמה.'],
  'auth.errWeak': ['Password too weak - use at least 6 characters.', 'הסיסמה חלשה מדי - לפחות 6 תווים.'],
  'auth.errExists': ['An account with this email already exists - try signing in.', 'כבר קיים חשבון עם האימייל הזה - נסו להתחבר.'],
  'auth.errCreds': ['Wrong email or password.', 'אימייל או סיסמה שגויים.'],
  'auth.errTooMany': ['Too many attempts - try again in a few minutes.', 'יותר מדי ניסיונות - נסו שוב בעוד כמה דקות.'],
  'auth.errGeneric': ['Something went wrong - please try again.', 'משהו השתבש - נסו שוב.'],

  /* ---- help modal ---- */
  'help.title': ['How to use amitfpl', 'איך משתמשים ב-amitfpl'],
  'help.home': ['<strong>{tab}</strong> - the at-a-glance dashboard: next fixtures and quick picks.', '<strong>{tab}</strong> - לוח המחוונים במבט מהיר: המשחקים הקרובים ובחירות מומלצות.'],
  'help.players': ['<strong>{tab}</strong> - every player, sortable and filterable. Click a player anywhere for the full profile.', '<strong>{tab}</strong> - כל השחקנים, עם מיון וסינון. לחיצה על שחקן בכל מקום פותחת את הפרופיל המלא.'],
  'help.planner': ['<strong>{tab}</strong> - build a squad, drag players between pitch and bench, pick captain and chips, and plan transfers for future gameweeks (free transfers bank up, extra moves cost -4). 🔗 Share moves your plan between devices.', '<strong>{tab}</strong> - בניית סגל, גרירת שחקנים בין המגרש לספסל, בחירת קפטן וצ׳יפים ותכנון העברות למחזורים הבאים (העברות חינם נצברות, מהלכים נוספים עולים 4-). 🔗 שיתוף מעביר את התוכנית בין מכשירים.'],
  'help.scout': ['<strong>{tab}</strong> - captain picks per gameweek, likely scorers, differentials, and best value.', '<strong>{tab}</strong> - בחירות קפטן לכל מחזור, מועמדים להבקיע, דיפרנציאלים והתמורה הטובה ביותר.'],
  'help.market': ['<strong>{tab}</strong> - price changes and transfer momentum.', '<strong>{tab}</strong> - שינויי מחירים ומומנטום העברות.'],
  'help.status': ['<strong>{tab}</strong> - injuries, doubts, and suspension risk.', '<strong>{tab}</strong> - פציעות, ספקות וסיכון הרחקה.'],
  'help.compare': ['<strong>{tab}</strong> - 2-3 players side by side.', '<strong>{tab}</strong> - 2-3 שחקנים זה לצד זה.'],
  'help.fixtures': ['<strong>{tab}</strong> - difficulty planner, goal & clean sheet forecast, rotation pairs, blanks & doubles.', '<strong>{tab}</strong> - מתכנן קושי, תחזית שערים ושערים נקיים, זוגות רוטציה, בלנקים וכפולים.'],
  'help.lineups': ['<strong>{tab}</strong> - our projected starting XI for every club.', '<strong>{tab}</strong> - ההרכב הצפוי שלנו לכל מועדון.'],
  'help.matches': ["<strong>{tab}</strong> - every gameweek's games; scores and point events fill in live.", '<strong>{tab}</strong> - המשחקים של כל מחזור; תוצאות ואירועי נקודות מתמלאים בזמן אמת.'],
  'help.setpieces': ['<strong>{tab}</strong> - penalty, free-kick and corner takers.', '<strong>{tab}</strong> - בועטי פנדלים, בעיטות חופשיות וקרנות.'],
  'help.myteam': ['<strong>{tab}</strong> - connect your real FPL squad with your Team ID.', '<strong>{tab}</strong> - חיבור הסגל האמיתי שלכם ב-FPL עם מזהה הקבוצה.'],
  'help.whatsNew': ["What's new", 'מה חדש'],
  'help.new1': ['<strong>AI squad analysis</strong> - connect your team in My Team and get the captain call, transfer ideas and lineup checks automatically.', '<strong>ניתוח AI של הסגל</strong> - חברו את הקבוצה ב"הקבוצה שלי" וקבלו אוטומטית קפטן מומלץ, רעיונות להעברות ובדיקת הרכב.'],
  'help.new5': ['<strong>Elo-powered model v2</strong> - team strength from daily ClubElo ratings, defensive-contribution and card modelling, penalty-taker boost.', '<strong>מודל v2 מבוסס Elo</strong> - חוזק קבוצות מדירוגי ClubElo יומיים, מידול תרומה הגנתית וכרטיסים, בונוס לבועטי פנדלים.'],
  'help.new2': ['<strong>Season planner</strong> - per-GW transfers with free-transfer banking and -4 hits, chips, share links between devices.', '<strong>מתכנן עונה</strong> - העברות לכל מחזור עם צבירת העברות חינם וקנסות 4-, צ׳יפים וקישורי שיתוף בין מכשירים.'],
  'help.new3': ['<strong>Predicted lineups</strong>, <strong>scoring & assist chances</strong>, <strong>market movers</strong> and <strong>price trend charts</strong> in player profiles.', '<strong>הרכבים צפויים</strong>, <strong>סיכויי הבקעה ובישול</strong>, <strong>תזוזות שוק</strong> ו<strong>גרפי מגמת מחיר</strong> בפרופילי שחקנים.'],
  'help.new4': ['<strong>Telegram alerts</strong> - deadline reminders and watchlist news, sent from the cloud.', '<strong>התראות טלגרם</strong> - תזכורות דדליין וחדשות על שחקני המעקב, נשלחות מהענן.'],
  'help.glossary': ['Glossary', 'מילון מונחים'],
  'help.g1': ["<strong>xP</strong> - expected points (our model's forecast).", '<strong>צפי (xP)</strong> - נקודות צפויות (התחזית של המודל שלנו).'],
  'help.g2': ['<strong>xG / xA</strong> - expected goals / assists, quality of chances involved in.', '<strong>צפי שערים / צפי בישולים (xG / xA)</strong> - איכות המצבים שהשחקן מעורב בהם.'],
  'help.g3': ['<strong>xGI</strong> - expected goal involvements (xG + xA).', '<strong>צפי מעורבות (xGI)</strong> - מעורבות צפויה בשערים (שערים + בישולים).'],
  'help.g4': ['<strong>DC</strong> - defensive contribution points (tackles, blocks, interceptions, clearances).', '<strong>הגנה (DC)</strong> - נקודות תרומה הגנתית (תיקולים, חסימות, חטיפות, הרחקות).'],
  'help.g5': ['<strong>FDR</strong> - fixture difficulty rating, 1 (easiest) to 5 (hardest).', '<strong>דירוג קושי (FDR)</strong> - קושי המשחק, מ-1 (הקל ביותר) עד 5 (הקשה ביותר).'],
  'help.g6': ['<strong>Sel %</strong> - how many FPL managers own the player.', '<strong>% בעלות</strong> - כמה מנג׳רים ב-FPL מחזיקים בשחקן.'],
  'help.g7': ['<strong>FT</strong> - free transfers available (bank up to 5; extra moves cost -4 points).', '<strong>העברות חינם (FT)</strong> - נצברות עד 5; מהלכים נוספים עולים 4- נקודות.'],
  'help.g8': ['<strong>TC / BB / WC / FH</strong> - Triple Captain, Bench Boost, Wildcard, Free Hit chips.', '<strong>הצ׳יפים</strong> - טריפל קפטן (TC), בנץ׳ בוסט (BB), וויילדקארד (WC) ופרי היט (FH).'],
};

// Rebuilds every static (non-view) piece of the page in the active
// language: tabs, header buttons, loading text, help modal, footer.
export function applyStaticI18n() {
  document.title = isHe() ? 'amitfpl - ערכת כלים ל-FPL' : 'amitfpl - FPL Toolkit';
  document.querySelectorAll('.tab[data-tab]').forEach((b) => {
    b.textContent = t(`tab.${b.dataset.tab}`);
  });
  const set = (sel, fn) => { const el = document.querySelector(sel); if (el) fn(el); };
  set('#more-btn', (el) => { el.textContent = `${t('tab.more')} ▾`; });
  set('.brand-sub', (el) => { el.textContent = t('brand.sub'); });
  set('#refresh-btn', (el) => { el.title = t('chrome.refreshTitle'); el.setAttribute('aria-label', t('chrome.refreshAria')); });
  set('#theme-btn', (el) => { el.title = t('chrome.themeTitle'); el.setAttribute('aria-label', t('chrome.themeTitle')); });
  set('#help-btn', (el) => { el.title = t('chrome.helpTitle'); el.setAttribute('aria-label', t('chrome.helpTitle')); });
  set('#lang-btn', (el) => { el.textContent = isHe() ? 'EN' : 'עב'; el.title = t('chrome.langTitle'); el.setAttribute('aria-label', t('chrome.langTitle')); });
  set('#auth-btn', (el) => { if (!el.classList.contains('on')) { el.title = t('auth.signInTitle'); el.setAttribute('aria-label', t('auth.signIn')); } });
  set('#loading p', (el) => { el.textContent = t('chrome.loading'); });
  set('.offline-bar', (el) => { el.textContent = t('chrome.offline'); });
  set('.footer span', (el) => {
    el.innerHTML = `${t('footer.text')}<a href="https://github.com/StevenGerrardSG8/amitfpl" target="_blank" rel="noopener" style="color:inherit">${t('footer.source')}</a>`;
  });
  set('#help-content', (el) => { el.innerHTML = helpHtml(); });
}

function helpHtml() {
  // Same order as the nav: the five main tabs, then the "More" menu.
  const tabs = ['home', 'myteam', 'players', 'planner', 'fixtures', 'scout', 'market', 'status', 'compare', 'lineups', 'matches', 'setpieces'];
  return `
    <h2 style="margin:4px 0 12px">${t('help.title')}</h2>
    <div class="help-list">
      ${tabs.map((k) => `<p>${t(`help.${k}`, { tab: t(`tab.${k}`) })}</p>`).join('')}
    </div>
    <h2 style="margin:18px 0 12px">${t('help.whatsNew')}</h2>
    <div class="help-list">
      ${[1, 2, 3, 4, 5].map((i) => `<p>${t(`help.new${i}`)}</p>`).join('')}
    </div>
    <h2 style="margin:18px 0 12px">${t('help.glossary')}</h2>
    <div class="help-list">
      ${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<p>${t(`help.g${i}`)}</p>`).join('')}
    </div>`;
}
