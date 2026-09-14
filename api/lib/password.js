// Password sign-in: the way in beside passkeys, for browsers and devices where passkeys can't work —
// anything not served over HTTPS or on localhost. The server only offers it when PASSWORD_LOGIN is set.
//
// Passwords are kept as scrypt hashes with a random salt each, and compared in constant time.
import crypto from 'node:crypto'

const KEYLEN = 64
const COST = { N: 16384, r: 8, p: 1 }
const MAXMEM = 64 * 1024 * 1024

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/

// Usernames ignore case: 'Riya.Coach' and 'riya.coach' are the same account.
export const normalizeLogin = s => String(s || '').trim().toLowerCase()

export function loginProblem(login) {
  return LOGIN_RE.test(login || '') ? null
    : 'A username is 3–32 letters, numbers, dots, dashes or underscores, starting with a letter or number.'
}

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `A password needs at least ${PASSWORD_MIN} characters.`
  if (pw.length > PASSWORD_MAX) return `A password can be at most ${PASSWORD_MAX} characters.`
  return null
}

// 'scrypt$N$r$p$salt$hash'. The cost is stored with the hash, so it can be raised later without
// breaking the passwords set before.
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pw, salt, KEYLEN, { ...COST, maxmem: MAXMEM })
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

export function verifyPassword(pw, stored) {
  const parts = String(stored || '').split('$')
  if (typeof pw !== 'string' || parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64url')
  if (!expected.length) return false
  let actual
  try {
    actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p, maxmem: MAXMEM })
  } catch { return false }
  return crypto.timingSafeEqual(actual, expected)
}

// Checked against when the username doesn't exist, so an unknown username takes as long to refuse
// as a wrong password and the two can't be told apart by timing.
export const DUMMY_HASH = hashPassword(crypto.randomBytes(18).toString('base64url'))

// Failed attempts per key (a username, an address) within a sliding window. In memory: a restart
// forgets them, which can only ever let someone try again sooner.
export function createLimiter({ max, windowMs }) {
  const hits = new Map()   // key -> [ms]
  const recent = (key, now) => (hits.get(key) || []).filter(at => now - at < windowMs)
  return {
    blocked: (key, now = Date.now()) => recent(key, now).length >= max,
    fail(key, now = Date.now()) {
      const list = recent(key, now)
      list.push(now)
      hits.set(key, list)
    },
    reset: key => { hits.delete(key) },
    // Seconds until the oldest failure still counted leaves the window.
    retryAfter(key, now = Date.now()) {
      const list = recent(key, now)
      return list.length ? Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000)) : 0
    },
    sweep(now = Date.now()) {
      for (const key of [...hits.keys()]) {
        const list = recent(key, now)
        if (list.length) hits.set(key, list)
        else hits.delete(key)
      }
    }
  }
}
