/* winterarc-api — passkey (WebAuthn) auth + per-user state storage for WinterARC
   No framework, JSON-file storage, signed session cookies.               */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import webpush from 'web-push';
import { roleOf, accessOf, daysLeft, extendFrom, COACH_TERM_DAYS, CLIENT_TERM_DAYS } from './lib/access.js';
import { DEFAULT_FEES } from './lib/billing.js';
import { isoDay } from './lib/time.js';
import { planReminders } from './lib/reminders.js';
import { lastBodyLogDay } from './lib/stats.js';
import { createHub } from './lib/hub.js';
import { hashPassword, verifyPassword, normalizeLogin, loginProblem, passwordProblem, createLimiter, DUMMY_HASH } from './lib/password.js';
import superadminRoutes from './routes/superadmin.js';
import coachRoutes from './routes/coach.js';
import clientRoutes from './routes/client.js';
import mediaRoutes from './routes/media.js';
import notificationRoutes from './routes/notifications.js';
import chatRoutes from './routes/chat.js';
import eventRoutes from './routes/events.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes from './routes/ai.js';

const PORT = +(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || '/data';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:8080';
const RP_NAME = process.env.RP_NAME || 'WinterARC';
// Super admins are matched by uid, or by the `admin` flag the very first account is given. Once any
// account exists, registering always needs an invite — a coach invite from a super admin, or a client
// invite from a coach — because the invite is what decides the role and who pays for the account.
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
// Day and month boundaries for billing and compliance. Defaults to IST (+05:30): fees are in rupees.
const TZ_OFFSET_MIN = process.env.TZ_OFFSET_MIN === undefined || process.env.TZ_OFFSET_MIN === '' ? 330 : +process.env.TZ_OFFSET_MIN;
// 90 days keeps someone who trains a few times a week permanently signed in without a stolen
// cookie staying good for a year. Overridable because a family instance and one on the open
// internet don't want the same number. Only affects cookies minted from now on — the expiry is
// baked into each cookie when it's issued, so lowering this never cuts an existing session short.
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
// Username-and-password sign-in beside passkeys, for devices and browsers where passkeys can't work
// (anything not on HTTPS or localhost). Off unless set: over plain HTTP a password travels unencrypted.
const PASSWORD_LOGIN = /^(1|true|yes|on)$/i.test(process.env.PASSWORD_LOGIN || '');
const MAX_BODY = 5 * 1024 * 1024;
// Secure cookies require HTTPS; over plain http://localhost the flag would drop the cookie
const SECURE = /^https:/i.test(ORIGIN) ? ' Secure;' : '';

fs.mkdirSync(DATA, { recursive: true });

/* ---------- secret + db ---------- */
const secretFile = path.join(DATA, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

const dbFile = path.join(DATA, 'db.json');
let db = { users: [], creds: [], subs: [], invites: [] };
try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
for (const k of ['subs', 'invites', 'ledger', 'plans', 'assignments', 'groups', 'notifications']) db[k] = db[k] || [];
db.settings = { ...DEFAULT_FEES, ...(db.settings || {}) };

const rid = () => crypto.randomBytes(12).toString('base64url');
const today = () => isoDay(Date.now(), TZ_OFFSET_MIN);
const userById = id => (id && db.users.find(u => u.id === id)) || null;
const role = user => roleOf(user, ADMIN_UIDS);
const access = user => accessOf(user, db.users, Date.now(), ADMIN_UIDS);
const ownClient = (coach, id) => { const u = userById(id); return u && role(u) === 'client' && u.coachId === coach.id ? u : null; };

// What the app is told about the signed-in account. A client is never sent a price or an expiry:
// their coach pays for their access, and that arrangement is the coach's to explain.
function publicUser(u) {
  const r = role(u);
  const out = { id: u.id, name: u.name, role: r, admin: r === 'superadmin', access: access(u), login: u.login || null, hasPassword: !!u.pw };
  if (r === 'coach') { out.paidUntil = u.paidUntil || null; out.daysLeft = daysLeft(u.paidUntil, Date.now()); }
  if (r === 'client') { const c = userById(u.coachId); out.coachId = u.coachId || null; out.coachName = c ? c.name : null; }
  return out;
}
function saveDb() { atomicWrite(dbFile, JSON.stringify(db, null, 2)); }
function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}
const stateFile = uid => path.join(DATA, 'state-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
function readState(uid) {
  try { return JSON.parse(fs.readFileSync(stateFile(uid), 'utf8')); } catch { return null; }
}

// Everything stored for an account outside db.json: its synced state and the files it uploaded.
function removeUserData(uid) {
  try { fs.unlinkSync(stateFile(uid)); } catch {}
  // Conversations are chat/<coachId>/<clientId>.json: a coach's whole folder, a client's one file.
  const chatDir = path.join(DATA, 'chat');
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeId) {
    try { fs.rmSync(path.join(chatDir, safeId), { recursive: true, force: true }); } catch {}
    try { for (const d of fs.readdirSync(chatDir)) fs.rmSync(path.join(chatDir, d, safeId + '.json'), { force: true }); } catch {}
  }
  const dir = path.join(DATA, 'media');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return; }
  for (const f of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (m.owner !== uid && m.peer !== uid) continue;
      fs.unlinkSync(path.join(dir, f));
      try { fs.unlinkSync(path.join(dir, m.id + '.bin')); } catch {}
    } catch {}
  }
}

// 16 hex chars = 64 bits. /api/register/options tells a caller whether a code is valid and the app
// has no rate limiting of its own, so the code itself has to be the thing not worth guessing.
function newInviteCode() {
  let code;
  do { code = crypto.randomBytes(8).toString('hex').toUpperCase(); } while (db.invites.some(i => i.code === code));
  return code;
}

// Why a code can't be used to register, or null if it can. The first account on an empty instance
// needs no code at all: it becomes the super admin.
function inviteProblem(code) {
  if (db.users.length === 0) return null;
  const inv = db.invites.find(i => i.code === code && !i.usedBy && !i.revoked);
  if (!inv || (inv.kind !== 'coach' && inv.kind !== 'client')) return 'a valid invite code is required';
  if (inv.kind === 'client') {
    const coach = userById(inv.coachId);
    if (!coach || access(coach) !== 'active') return 'this invite is not active right now — ask your coach';
  }
  return null;
}

// Creates an account and burns the invite that allowed it. The invite decides the role and who pays:
// a coach invite from the super admin, or a client invite from a coach, which links the client to that
// coach. Only the very first account on an empty instance needs no invite; it becomes the super admin.
// Both ways of signing up come through here, and the invite is re-checked at this last moment, since it
// may have been used or revoked since it was first entered.
function createAccount(uid, name, code) {
  const bootstrap = db.users.length === 0;
  const problem = inviteProblem(code);
  if (problem) return { error: problem };
  const now = Date.now();
  const user = { id: uid, name, created: new Date(now).toISOString() };
  if (bootstrap) {
    user.admin = true;
  } else {
    const invite = db.invites.find(i => i.code === code && !i.usedBy && !i.revoked);
    user.invitedBy = invite.code; invite.usedBy = user.id; invite.usedAt = user.created;
    if (invite.kind === 'coach') {
      user.role = 'coach';
      if (invite.prepaid !== false) {
        user.paidUntil = extendFrom(null, now, COACH_TERM_DAYS);
        db.ledger.push({ id: rid(), type: 'coach_annual', coachId: user.id, amount: db.settings.coachAnnualFee, periodStart: now, periodEnd: user.paidUntil, created: now, recordedBy: invite.createdBy || null, settled: true, settledAt: now, note: 'First year, recorded with the invite' });
      }
    } else {
      // The first month is charged to the coach the moment their invite is used: the coach chose
      // to create that client's place when they generated the code.
      user.role = 'client';
      user.coachId = invite.coachId;
      user.paidUntil = extendFrom(null, now, CLIENT_TERM_DAYS);
      db.ledger.push({ id: rid(), type: 'client_monthly', coachId: invite.coachId, clientId: user.id, amount: db.settings.clientMonthlyFee, periodStart: now, periodEnd: user.paidUntil, created: now, recordedBy: invite.coachId, settled: false, note: 'First month, charged when the invite was used' });
    }
  }
  db.users.push(user);
  return { user };
}

// Messaging runs strictly between a coach and their own client, and only while both are active.
function canChat(user, peerId) {
  const peer = userById(peerId);
  if (!peer || access(user) !== 'active' || access(peer) !== 'active') return false;
  const r = role(user), pr = role(peer);
  if (r === 'coach' && pr === 'client') return peer.coachId === user.id;
  if (r === 'client' && pr === 'coach') return user.coachId === peer.id;
  return false;
}

/* ---------- push notifications (Web Push / VAPID) ---------- */
const vapidFile = path.join(DATA, 'vapid.json');
let vapid;
try { vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8')); }
catch { vapid = webpush.generateVAPIDKeys(); fs.writeFileSync(vapidFile, JSON.stringify(vapid), { mode: 0o600 }); }
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || (SECURE ? ORIGIN : 'mailto:admin@localhost');
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

async function sendPush(userId, payload) {
  const subs = db.subs.filter(s => s.userId === userId);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  let dirty = false;
  await Promise.all(subs.map(async sub => {
    // urgency 'high' is the one lever we have over delivery speed — iOS/Android throttle
    // low-urgency background push more aggressively under battery-saving modes. TTL is left
    // at the library default (long) so a briefly-offline device still gets it once reconnected,
    // rather than risking it being dropped for the sake of shaving off latency that TTL doesn't
    // actually control anyway.
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { urgency: 'high' }); }
    catch (e) {
      console.error('push send failed', userId, e.statusCode, e.body || e.message);
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint); dirty = true;
      }
    }
  }));
  if (dirty) saveDb();
}

// An in-app notification (kept, and shown in the app's feed) plus a push to any subscribed device.
// Push needs HTTPS and a service worker, so the feed is the one that always arrives.
const NOTIFY_KEEP = 100;
const hub = createHub();
const publishEvent = (uid, event, data) => hub.publish(uid, event, data);
setInterval(() => hub.ping(), 25000).unref();
// Tells the people someone chats with that they have come online or gone offline.
function onPresence(user, online) {
  const r = role(user);
  const partners = r === 'coach' ? db.users.filter(u => u.coachId === user.id).map(u => u.id)
    : r === 'client' && user.coachId ? [user.coachId] : [];
  const data = { id: user.id, online, lastSeen: online ? null : hub.lastSeen(user.id) };
  for (const id of partners) hub.publish(id, 'presence', data);
}
function notify(userId, { type, title, body, url }, { save = true } = {}) {
  const n = { id: rid(), userId, type, title, body: body || '', url: url || null, created: Date.now(), read: false };
  db.notifications.push(n);
  const mine = db.notifications.filter(x => x.userId === userId);
  if (mine.length > NOTIFY_KEEP) {
    const drop = new Set(mine.slice(0, mine.length - NOTIFY_KEEP).map(x => x.id));
    db.notifications = db.notifications.filter(x => !drop.has(x.id));
  }
  if (save) saveDb();
  // Tagged per notification: two clients falling due on the same day are two alerts, not one.
  sendPush(userId, { title, body: n.body, tag: n.id, url: n.url }).catch(() => {});
  publishEvent(userId, 'notification', n);
  return n;
}

/* ---------- renewal reminders, expiry notices, progress check-ins ---------- */
// Access never waits on this — it is derived on every request. The scheduler only decides whom to
// tell, and the marker it saves on each account (remindedFor / expiredFor / progressRemindedAt)
// keeps every notice to once, however often it runs and however many restarts it sees.
const REMINDER_EVERY_MS = 10 * 60000;
function runReminders(now = Date.now()) {
  const items = planReminders(db.users, now, {
    adminUids: ADMIN_UIDS, offsetMin: TZ_OFFSET_MIN, lastBodyLog: uid => lastBodyLogDay(readState(uid))
  });
  let sent = 0;
  for (const item of items) {
    const u = userById(item.userId);
    if (!u) continue;
    Object.assign(u, item.mark);
    for (const n of item.notices) { notify(n.to, n, { save: false }); sent++; }
  }
  if (items.length) { saveDb(); console.log(`reminders: ${sent} notification(s) sent`); }
  return sent;
}
const runRemindersSafely = () => { try { runReminders(); } catch (e) { console.error('reminders failed', e); } };
setTimeout(runRemindersSafely, 15000).unref();
setInterval(runRemindersSafely, REMINDER_EVERY_MS).unref();

// Rest-timer alerts: client schedules on start/extend, cancels on skip or on-screen completion —
// this only fires when the tab was backgrounded/suspended and never got to cancel it itself.
const restTimers = new Map(); // userId -> Timeout
function scheduleRestTimer(userId, sec) {
  const t = restTimers.get(userId);
  if (t) clearTimeout(t);
  restTimers.set(userId, setTimeout(() => {
    restTimers.delete(userId);
    sendPush(userId, { title: 'Rest over 💪', body: 'Time for your next set.', tag: 'rest-timer' });
  }, sec * 1000));
}
function cancelRestTimer(userId) {
  const t = restTimers.get(userId);
  if (t) { clearTimeout(t); restTimers.delete(userId); }
}

// "Workout planned today" reminder — one per user per day, at their chosen time.
// Duplicated (not imported) from frontend/src/lib/history.js effectiveRoutineId — tiny pure helper, not worth sharing across the two runtimes.
function effectiveRoutineId(S, iso) {
  const ov = S.dayPlan?.[iso];
  if (ov === 'rest') return null;
  if (ov && S.routines?.some(r => r.id === ov)) return ov;
  const wd = new Date(iso + 'T12:00:00').getDay();
  return S.week?.[wd] || null;
}
// Computes "now" in an arbitrary IANA zone (e.g. "Europe/Lisbon") instead of the server's own —
// each user's reminder fires by their own clock, wherever they and their phone actually are.
function userNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    const g = t => parts.find(p => p.type === t)?.value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
  } catch { return null; } // unknown/invalid tz string — skip this user rather than guess
}
setInterval(() => {
  for (const user of db.users) {
    if (!db.subs.some(s => s.userId === user.id)) continue;
    const S = readState(user.id);
    if (!S?.reminder?.on) continue;
    const now = userNow(S.reminder.tz || 'UTC');
    if (!now || S.reminder.time !== now.hhmm) continue;
    if (user.lastReminder === now.date) continue;
    if ((S.workouts || []).some(w => w.d === now.date)) continue;
    const rid = effectiveRoutineId(S, now.date);
    if (!rid) continue; // rest day — nothing planned
    const routine = (S.routines || []).find(r => r.id === rid);
    console.log('reminder firing', user.id, rid);
    user.lastReminder = now.date;
    saveDb();
    sendPush(user.id, {
      title: routine ? `${routine.emoji || '🏋️'} ${routine.name} today` : 'Workout planned today',
      body: "It's on your plan — let's go 💪",
      tag: 'day-reminder'
    });
  }
// Checked every 10s (not 60s) — ticks aren't aligned to the top of the minute, so a 60s
// interval could sit on your target minute for up to 59s before noticing. 10s caps that at ~9s.
}, 10000).unref();

/* ---------- sessions (signed cookie) ---------- */
function sign(payload) {
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verifySig(token) {
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i), mac = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  } catch { return null; }
  return payload;
}
// Session payload is `<uid>:<expiry>:<version>`, where the version is the user's `sv` counter.
// Bumping `sv` (POST /api/logout/all) makes every cookie ever handed out for that account stop
// verifying, which is the only revocation there was before short of deleting ./data/secret and
// signing out the whole instance. Cookies minted before `sv` existed have no third field and are
// read as version 0, matching a user who has never bumped — they stay valid until they expire.
const sessionVersion = user => user.sv || 0;
function makeSession(user) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return sign(user.id + ':' + exp + ':' + sessionVersion(user));
}
function readSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
    const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  const tok = cookies.gymsid;
  if (!tok) return null;
  const payload = verifySig(tok);
  if (!payload) return null;
  const [uid, exp, ver] = payload.split(':');
  if (!uid || +exp < Date.now()) return null;
  const user = db.users.find(u => u.id === uid) || null;
  if (!user) return null;
  if (user.disabled) return null;           // disabled accounts are locked out everywhere
  // Missing third field = pre-versioning cookie = version 0. Anything non-numeric is a malformed
  // payload (it still had to pass the HMAC, so this is belt-and-braces) and is refused outright.
  const claimed = ver === undefined ? 0 : Number(ver);
  if (!Number.isInteger(claimed) || claimed !== sessionVersion(user)) return null;
  hub.touch(user.id);   // hub.isLooking: whether a message to them should be pushed
  return user;
}
function requireUser(req, res) {
  const user = readSession(req);
  if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
  return user;
}
// Resolves the caller and 401/403s unless they hold `want`. By default the account must also be
// active: an expired coach or a locked client keeps their sign-in, so the app can explain what
// happened, but gets no further than /api/me and their notifications.
function requireRole(req, res, want, { active = true } = {}) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (role(user) !== want) { json(res, 403, { error: 'forbidden' }); return null; }
  const a = access(user);
  if (active && a !== 'active') { json(res, 403, { error: 'access paused', access: a }); return null; }
  return user;
}
function sessionCookie(user) {
  return `gymsid=${makeSession(user)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly;${SECURE} SameSite=Lax`;
}
const clearCookie = `gymsid=; Path=/; Max-Age=0; HttpOnly;${SECURE} SameSite=Lax`;

/* ---------- challenge store (in-memory, 5 min TTL) ---------- */
const challenges = new Map(); // cid -> {challenge, name?, uid?, exp}
function putChallenge(data) {
  const cid = crypto.randomBytes(16).toString('base64url');
  challenges.set(cid, { ...data, exp: Date.now() + 5 * 60000 });
  return cid;
}
function takeChallenge(cid) {
  const c = challenges.get(cid);
  challenges.delete(cid);
  if (!c || c.exp < Date.now()) return null;
  return c;
}
setInterval(() => { for (const [k, v] of challenges) if (v.exp < Date.now()) challenges.delete(k); }, 60000).unref();

/* ---------- helpers ---------- */
function json(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(body);
}
// Rejections carry an HTTP status so the request handler answers with a client error (a bad body is
// the caller's fault, not the server's) instead of a blanket 500. `too large` destroys the socket, so
// its response may not reach the caller, but the status keeps it out of the error log either way.
function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => {
      size += d.length;
      if (size > limit) { reject(Object.assign(new Error('the request is too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('the request body is not valid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const b64uToBuf = s => Buffer.from(s, 'base64url');

/* ---------- live presence (in-memory) ---------- */
// Clients heartbeat /api/activity while a workout is on screen; the admin dashboard reads who's
// live. Purely ephemeral — never persisted. Expires shortly after the last ping.
const presence = new Map();               // uid -> { name, exIdx, exTotal, setsDone, setsTotal, startedAt, updatedAt }
const PRESENCE_TTL = 70000;               // ~3.5× the 20s client heartbeat
function livePresence(uid) {
  const p = presence.get(uid);
  if (!p) return null;
  if (Date.now() - p.updatedAt > PRESENCE_TTL) { presence.delete(uid); return null; }
  return p;
}
setInterval(() => { for (const [k, v] of presence) if (Date.now() - v.updatedAt > PRESENCE_TTL) presence.delete(k); }, 30000).unref();

/* ---------- password sign-in ---------- */
// The API is only reachable through nginx, which sets X-Real-IP to the address the request came from.
const clientIp = req => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
// A JSON body can't be sent cross-site without a CORS preflight, which this server never answers, so a
// form on another site can't sign someone in or out of an account behind their back.
const isJson = req => /^application\/json\b/i.test(req.headers['content-type'] || '');
// Failed password sign-ins allowed per 15 minutes: 10 for one username, 50 from one address.
const userLimiter = createLimiter({ max: 10, windowMs: 15 * 60000 });
const ipLimiter = createLimiter({ max: 50, windowMs: 15 * 60000 });
setInterval(() => { userLimiter.sweep(); ipLimiter.sweep(); }, 5 * 60000).unref();
function tooManyAttempts(res, keys) {
  const wait = Math.max(...keys.map(([lim, key]) => lim.retryAfter(key)));
  json(res, 429, { error: `Too many attempts — try again in ${Math.ceil(wait / 60)} min.` }, { 'Retry-After': String(wait) });
}

/* ---------- routes ---------- */
const routes = {
  'GET /api/health': async (req, res) => json(res, 200, { ok: true, users: db.users.length }),

  // Public config the login screen needs before anyone is signed in.
  'GET /api/config': async (req, res) => json(res, 200, { invite_only: db.users.length > 0, password_login: PASSWORD_LOGIN, guest_mode: db.settings.guestMode === true, ai: !!process.env.ANTHROPIC_API_KEY }),

  'GET /api/me': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    json(res, 200, { user: publicUser(user) });
  },

  'POST /api/register/options': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'name required' });
    const code = String(body.code || '').trim().toUpperCase();
    const problem = inviteProblem(code);
    if (problem) return json(res, 403, { error: problem });
    const uid = crypto.randomBytes(12).toString('base64url');
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userID: Buffer.from(uid), userName: name, userDisplayName: name,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: []
    });
    const cid = putChallenge({ challenge: options.challenge, name, uid, code });
    json(res, 200, { cid, options });
  },

  'POST /api/register/verify': async (req, res) => {
    const body = await readBody(req);
    const c = takeChallenge(body.cid);
    if (!c || !c.uid) return json(res, 400, { error: 'challenge expired — try again' });
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge: c.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false
      });
    } catch (e) { return json(res, 400, { error: 'verification failed: ' + e.message }); }
    if (!verification.verified) return json(res, 400, { error: 'not verified' });
    const { credential } = verification.registrationInfo;
    if (db.creds.find(x => x.id === credential.id)) return json(res, 409, { error: 'credential already registered' });
    const { user, error } = createAccount(c.uid, c.name, c.code);
    if (error) return json(res, 403, { error });
    db.creds.push({
      id: credential.id, userId: user.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter || 0,
      transports: body.credential?.response?.transports || []
    });
    saveDb();
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  },

  'POST /api/login/options': async (req, res) => {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID, userVerification: 'preferred', allowCredentials: []
    });
    const cid = putChallenge({ challenge: options.challenge });
    json(res, 200, { cid, options });
  },

  'POST /api/login/verify': async (req, res) => {
    const body = await readBody(req);
    const c = takeChallenge(body.cid);
    if (!c) return json(res, 400, { error: 'challenge expired — try again' });
    const cred = db.creds.find(x => x.id === body.credential?.id);
    if (!cred) return json(res, 404, { error: 'unknown passkey — create a profile first' });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.credential,
        expectedChallenge: c.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: {
          id: cred.id,
          publicKey: b64uToBuf(cred.publicKey),
          counter: cred.counter,
          transports: cred.transports
        }
      });
    } catch (e) { return json(res, 400, { error: 'verification failed: ' + e.message }); }
    if (!verification.verified) return json(res, 400, { error: 'not verified' });
    cred.counter = verification.authenticationInfo.newCounter;
    saveDb();
    const user = db.users.find(u => u.id === cred.userId);
    if (!user) return json(res, 500, { error: 'user missing' });
    if (user.disabled) return json(res, 403, { error: 'this account has been disabled' });
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  },

  // Signing up with a username and password instead of a passkey. The invite rules are exactly the same.
  'POST /api/register/password': async (req, res) => {
    if (!PASSWORD_LOGIN) return json(res, 404, { error: 'not found' });
    if (!isJson(req)) return json(res, 415, { error: 'JSON body required' });
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'name required' });
    const login = normalizeLogin(body.login);
    const invalid = loginProblem(login) || passwordProblem(body.password);
    if (invalid) return json(res, 400, { error: invalid });
    // The invite comes first: without one, nobody learns whether a username is taken, and nobody can
    // make the server spend time hashing.
    const code = String(body.code || '').trim().toUpperCase();
    const problem = inviteProblem(code);
    if (problem) return json(res, 403, { error: problem });
    if (db.users.some(u => u.login === login)) return json(res, 409, { error: 'That username is taken — pick another.' });
    const pw = hashPassword(body.password);
    const { user, error } = createAccount(crypto.randomBytes(12).toString('base64url'), name, code);
    if (error) return json(res, 403, { error });
    user.login = login;
    user.pw = pw;
    saveDb();
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  },

  'POST /api/login/password': async (req, res) => {
    if (!PASSWORD_LOGIN) return json(res, 404, { error: 'not found' });
    if (!isJson(req)) return json(res, 415, { error: 'JSON body required' });
    const body = await readBody(req);
    const login = normalizeLogin(body.login);
    const keys = [[userLimiter, login], [ipLimiter, clientIp(req)]];
    if (keys.some(([lim, key]) => lim.blocked(key))) return tooManyAttempts(res, keys);
    const user = login ? db.users.find(u => u.login === login && u.pw) : null;
    // The hash is always checked, so an unknown username takes as long to refuse as a wrong password.
    const ok = verifyPassword(String(body.password || ''), user ? user.pw : DUMMY_HASH) && !!user;
    if (!ok) {
      keys.forEach(([lim, key]) => lim.fail(key));
      return json(res, 401, { error: 'Wrong username or password.' });
    }
    if (user.disabled) return json(res, 403, { error: 'this account has been disabled' });
    userLimiter.reset(login);
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  },

  // Sets or changes the signed-in account's username and password. Changing a password needs the
  // current one; adding one to a passkey account needs only the passkey's session. Every other
  // session on the account ends, and this one carries on with a fresh cookie.
  'POST /api/account/password': async (req, res) => {
    if (!PASSWORD_LOGIN) return json(res, 404, { error: 'not found' });
    const user = requireUser(req, res); if (!user) return;
    if (!isJson(req)) return json(res, 415, { error: 'JSON body required' });
    const body = await readBody(req);
    const login = body.login === undefined ? user.login : normalizeLogin(body.login);
    const invalid = loginProblem(login) || passwordProblem(body.password);
    if (invalid) return json(res, 400, { error: invalid });
    if (db.users.some(u => u !== user && u.login === login)) return json(res, 409, { error: 'That username is taken — pick another.' });
    if (user.pw) {
      const keys = [[userLimiter, user.login], [ipLimiter, clientIp(req)]];
      if (keys.some(([lim, key]) => lim.blocked(key))) return tooManyAttempts(res, keys);
      if (!verifyPassword(String(body.current || ''), user.pw)) {
        keys.forEach(([lim, key]) => lim.fail(key));
        return json(res, 403, { error: 'Your current password is wrong.' });
      }
    }
    user.login = login;
    user.pw = hashPassword(body.password);
    user.sv = sessionVersion(user) + 1;
    saveDb();
    json(res, 200, { ok: true, user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  },

  'POST /api/logout': async (req, res) => json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie }),

  // "Sign out everywhere" — bumps this user's session version, which invalidates every cookie
  // ever issued for the account, on every device, including a copy someone else walked off with.
  // The caller's own cookie is cleared here too, so the browser doing it doesn't sit on a token
  // it no longer accepts. Passkeys are untouched: signing back in works immediately.
  'POST /api/logout/all': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    user.sv = sessionVersion(user) + 1;
    saveDb();
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
  },

  'GET /api/data': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    try {
      const state = JSON.parse(fs.readFileSync(stateFile(user.id), 'utf8'));
      json(res, 200, { state });
    } catch { json(res, 200, { state: null }); }
  },

  'PUT /api/data': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    // A paused account keeps its data but can't add to it until access is restored.
    if (access(user) !== 'active') return json(res, 403, { error: 'access paused', access: access(user) });
    const body = await readBody(req);
    if (!body.state || typeof body.state !== 'object') return json(res, 400, { error: 'state required' });
    delete body.state.active;              // in-progress workouts stay device-local
    atomicWrite(stateFile(user.id), JSON.stringify(body.state));
    json(res, 200, { ok: true, ts: body.state._ts || null });
  },

  'GET /api/push/public-key': async (req, res) => json(res, 200, { key: vapid.publicKey }),

  'POST /api/push/subscribe': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json(res, 400, { error: 'invalid subscription' });
    db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint);
    db.subs.push({ userId: user.id, endpoint: sub.endpoint, keys: sub.keys, created: new Date().toISOString() });
    saveDb();
    json(res, 200, { ok: true });
  },

  'POST /api/push/unsubscribe': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    db.subs = db.subs.filter(s => !(s.userId === user.id && s.endpoint === body.endpoint));
    saveDb();
    json(res, 200, { ok: true });
  },

  'POST /api/push/test': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    await sendPush(user.id, { title: 'WinterARC', body: 'Test notification ✅ — this is what alerts look like.', tag: 'test' });
    json(res, 200, { ok: true });
  },

  'POST /api/push/rest-timer': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const sec = Math.max(1, Math.min(3600, Math.round(+body.seconds || 0)));
    if (!sec) return json(res, 400, { error: 'seconds required' });
    scheduleRestTimer(user.id, sec);
    json(res, 200, { ok: true });
  },

  'POST /api/push/rest-timer/cancel': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    cancelRestTimer(user.id);
    json(res, 200, { ok: true });
  },

  // Live-workout heartbeat: client pings while a workout is on screen; { active:false } drops it.
  'POST /api/activity': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    if (body.active) {
      presence.set(user.id, {
        name: String(body.name || '').slice(0, 60),
        exIdx: +body.exIdx || 0, exTotal: +body.exTotal || 0,
        setsDone: +body.setsDone || 0, setsTotal: +body.setsTotal || 0,
        startedAt: +body.startedAt || Date.now(),
        updatedAt: Date.now()
      });
    } else presence.delete(user.id);
    json(res, 200, { ok: true });
  },
};

/* ---------- role routes ---------- */
// Each module receives the shared helpers rather than importing them, so the auth, session and
// storage code above stays the one definition of how a request is identified and saved.
const ctx = {
  db, DATA, ADMIN_UIDS, TZ_OFFSET_MIN,
  json, readBody, saveDb, readState, rid, today,
  readSession, requireUser, requireRole, role, access, publicUser, userById, ownClient, canChat,
  notify, sendPush, livePresence, newInviteCode, removeUserData, runReminders,
  hub, onPresence, publishEvent
};
Object.assign(routes,
  superadminRoutes(ctx), coachRoutes(ctx), clientRoutes(ctx), mediaRoutes(ctx), notificationRoutes(ctx),
  chatRoutes(ctx), eventRoutes(ctx), analyticsRoutes(ctx), aiRoutes(ctx));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = req.method + ' ' + url.pathname;
  const handler = routes[key];
  if (!handler) return json(res, 404, { error: 'not found' });
  try { await handler(req, res); }
  catch (e) {
    // A rejection with a status is a bad request (malformed or over-sized body): answer with it and
    // don't log it as a server fault. Everything else is unexpected — log it and return 500.
    const code = e && e.status ? e.status : 500;
    if (code === 500) console.error(key, e);
    if (!res.headersSent) json(res, code, { error: code === 500 ? 'server error' : e.message });
  }
}).listen(PORT, () => console.log(`gym-api on :${PORT} (rpID=${RP_ID}, origin=${ORIGIN})`));
