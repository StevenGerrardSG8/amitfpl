// Optional user accounts: Firebase Auth (email/password + Google) with
// a per-user cloud copy of the local data, so plans, team ID and the
// watchlist follow the user across devices.
//
// Entirely opt-in and configuration-driven: when config.json has no
// "firebase" block the button never appears and the app behaves exactly
// as before (guest mode, localStorage only). The Firebase web config is
// public by design - security comes from Firestore rules (see
// docs/ACCOUNTS-SETUP.md).
import { t } from './i18n.js';

// Everything that makes an amitfpl identity, synced as one document.
const SYNC_KEYS = [
  'amitfpl:planner:v3:A', 'amitfpl:planner:v3:B', 'amitfpl:planner:v3:C',
  'amitfpl:planner:slot', 'amitfpl:teamId', 'amitfpl:watchlist',
  'amitfpl:compare', 'amitfpl:lang', 'amitfpl:theme', 'amitfpl:lastTab',
];
const PUSH_EVERY_MS = 15000;

let sdk = null;    // {auth, db, fns...} once Firebase is loaded
let user = null;   // current Firebase user or null
let lastPushed = ''; // JSON of the last state we wrote to the cloud

const $ = (sel) => document.querySelector(sel);

function snapshot() {
  const out = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    } catch { /* private mode */ }
  }
  return out;
}

// Write the cloud copy onto this device. Returns true if anything changed.
function apply(data) {
  let changed = false;
  for (const k of SYNC_KEYS) {
    try {
      const v = data?.[k];
      if (v != null && localStorage.getItem(k) !== v) {
        localStorage.setItem(k, v);
        changed = true;
      }
    } catch { /* private mode */ }
  }
  return changed;
}

async function pull() {
  const { doc, getDoc } = sdk.fs;
  const snap = await getDoc(doc(sdk.db, 'users', user.uid));
  if (snap.exists()) {
    const data = snap.data()?.data || {};
    lastPushed = JSON.stringify({ ...snapshot(), ...data });
    if (apply(data)) {
      // Cloud data differs from this device - reload so every tab,
      // the language and the theme pick it up cleanly.
      location.reload();
      return;
    }
  }
  await push(true);
}

async function push(force = false) {
  if (!sdk || !user) return;
  const data = snapshot();
  const json = JSON.stringify(data);
  if (!force && json === lastPushed) return;
  const { doc, setDoc } = sdk.fs;
  try {
    await setDoc(doc(sdk.db, 'users', user.uid), {
      data,
      email: user.email || null,
      updated: new Date().toISOString(),
    }, { merge: true });
    lastPushed = json;
  } catch (e) {
    console.warn('amitfpl sync push failed:', e?.code || e);
  }
}

/* ---------------- header button ---------------- */

function syncButton() {
  const btn = $('#auth-btn');
  if (!btn) return;
  btn.hidden = false;
  if (user) {
    const letter = (user.displayName || user.email || '?')[0].toUpperCase();
    btn.textContent = letter;
    btn.classList.add('on');
    btn.title = t('auth.accountTitle', { email: user.email || '' });
  } else {
    btn.textContent = '👤';
    btn.classList.remove('on');
    btn.title = t('auth.signInTitle');
  }
}

/* ---------------- modal ---------------- */

const AUTH_ERRORS = {
  'auth/invalid-email': 'auth.errEmail',
  'auth/missing-password': 'auth.errPassword',
  'auth/weak-password': 'auth.errWeak',
  'auth/email-already-in-use': 'auth.errExists',
  'auth/invalid-credential': 'auth.errCreds',
  'auth/wrong-password': 'auth.errCreds',
  'auth/user-not-found': 'auth.errCreds',
  'auth/too-many-requests': 'auth.errTooMany',
  'auth/popup-closed-by-user': null, // user changed their mind - not an error
};

function openModal() {
  $('.auth-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay onboard-overlay auth-overlay';

  if (user) {
    overlay.innerHTML = `
      <div class="onboard-card" style="max-width:420px">
        <h2>${t('auth.account')}</h2>
        <p class="ob-sub">${escapeText(user.email || user.displayName || '')}</p>
        <p class="note" style="padding:0 0 14px">${t('auth.syncNote')}</p>
        <div class="auth-actions">
          <button class="btn ghost" id="auth-signout">${t('auth.signOut')}</button>
          <button class="btn" id="auth-close">${t('common.close')}</button>
        </div>
      </div>`;
    overlay.querySelector('#auth-signout').addEventListener('click', async () => {
      await push(true); // don't lose the last edits
      await sdk.signOut(sdk.auth);
      overlay.remove();
    });
  } else {
    overlay.innerHTML = `
      <div class="onboard-card" style="max-width:420px">
        <h2>${t('auth.signIn')}</h2>
        <p class="ob-sub">${t('auth.pitch')}</p>
        <div class="auth-form">
          <input type="email" id="auth-email" autocomplete="email" placeholder="${t('auth.email')}" />
          <input type="password" id="auth-pass" autocomplete="current-password" placeholder="${t('auth.password')}" />
          <div class="auth-error" id="auth-error" hidden></div>
          <div class="auth-actions">
            <button class="btn" id="auth-login">${t('auth.signIn')}</button>
            <button class="btn ghost" id="auth-register">${t('auth.register')}</button>
          </div>
          <button class="link-btn" id="auth-forgot">${t('auth.forgot')}</button>
          <div class="auth-divider"><span>${t('auth.or')}</span></div>
          <button class="btn-google" id="auth-google">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.8-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            ${t('auth.google')}
          </button>
        </div>
        <p class="note" style="padding:12px 0 0">${t('auth.privacy')}</p>
      </div>`;

    const showErr = (code) => {
      const key = AUTH_ERRORS[code];
      if (key === null) return; // benign (closed popup)
      const el = overlay.querySelector('#auth-error');
      el.textContent = key ? t(key) : t('auth.errGeneric');
      el.hidden = false;
    };
    const creds = () => [
      overlay.querySelector('#auth-email').value.trim(),
      overlay.querySelector('#auth-pass').value,
    ];
    const attempt = async (fn) => {
      try {
        await fn();
        overlay.remove();
      } catch (e) {
        showErr(e?.code);
      }
    };
    overlay.querySelector('#auth-login').addEventListener('click', () =>
      attempt(() => sdk.signInWithEmailAndPassword(sdk.auth, ...creds())));
    overlay.querySelector('#auth-register').addEventListener('click', () =>
      attempt(() => sdk.createUserWithEmailAndPassword(sdk.auth, ...creds())));
    overlay.querySelector('#auth-google').addEventListener('click', () =>
      attempt(() => sdk.signInWithPopup(sdk.auth, new sdk.GoogleAuthProvider())));
    overlay.querySelector('#auth-forgot').addEventListener('click', async () => {
      const [email] = creds();
      if (!email) return showErr('auth/invalid-email');
      try {
        await sdk.sendPasswordResetEmail(sdk.auth, email);
        const el = overlay.querySelector('#auth-error');
        el.textContent = t('auth.resetSent');
        el.hidden = false;
        el.classList.add('ok');
      } catch (e) {
        showErr(e?.code);
      }
    });
    overlay.querySelector('#auth-pass').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') overlay.querySelector('#auth-login').click();
    });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('#auth-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
}

const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ---------------- init ---------------- */

export async function initAuth() {
  let cfg = null;
  try {
    const res = await fetch('config.json');
    cfg = (await res.json())?.firebase || null;
  } catch { /* no config - guest mode */ }
  if (!cfg?.apiKey) return; // accounts not configured - stay invisible

  try {
    const V = '10.12.2';
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(cfg);
    sdk = {
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      fs: { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc },
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      sendPasswordResetEmail: authMod.sendPasswordResetEmail,
      signInWithPopup: authMod.signInWithPopup,
      GoogleAuthProvider: authMod.GoogleAuthProvider,
      signOut: authMod.signOut,
    };
    authMod.onAuthStateChanged(sdk.auth, (u) => {
      const wasGuest = !user;
      user = u;
      syncButton();
      if (u && wasGuest) pull().catch((e) => console.warn('amitfpl sync pull failed:', e?.code || e));
    });
  } catch (e) {
    console.warn('amitfpl accounts unavailable:', e?.code || e?.message || e);
    return;
  }

  $('#auth-btn')?.addEventListener('click', openModal);
  syncButton();

  // Keep the cloud copy fresh: light polling + a flush when leaving.
  setInterval(() => push(), PUSH_EVERY_MS);
  addEventListener('pagehide', () => { push(); });
}
