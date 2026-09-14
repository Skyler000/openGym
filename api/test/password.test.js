import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, normalizeLogin, loginProblem, passwordProblem, createLimiter, DUMMY_HASH } from '../lib/password.js'

test('a hashed password verifies, and nothing else does', () => {
  const stored = hashPassword('correct horse battery')
  assert.match(stored, /^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/)
  assert.equal(verifyPassword('correct horse battery', stored), true)
  assert.equal(verifyPassword('correct horse batterY', stored), false)
  assert.equal(verifyPassword('', stored), false)
  assert.equal(verifyPassword(undefined, stored), false)
})

test('the same password hashes differently each time', () => {
  assert.notEqual(hashPassword('same-password'), hashPassword('same-password'))
})

test('a malformed or missing stored hash never verifies', () => {
  for (const bad of [null, '', 'plain-text', 'scrypt$1$2$3', 'bcrypt$16384$8$1$abc$def', 'scrypt$16384$8$1$abc$']) {
    assert.equal(verifyPassword('anything', bad), false, String(bad))
  }
  assert.equal(verifyPassword('password1', DUMMY_HASH), false)
})

test('usernames ignore case and surrounding spaces, and follow simple rules', () => {
  assert.equal(normalizeLogin('  Riya.Coach '), 'riya.coach')
  assert.equal(normalizeLogin(undefined), '')
  for (const ok of ['sam', 'riya.coach', 'arjun_2', 'a-b-c', '9lives']) assert.equal(loginProblem(ok), null, ok)
  for (const bad of ['', 'ab', '.sam', 'has space', 'émile', 'x'.repeat(33)]) assert.notEqual(loginProblem(bad), null, bad)
})

test('passwords need 8 to 128 characters', () => {
  assert.notEqual(passwordProblem('short'), null)
  assert.notEqual(passwordProblem(12345678), null)
  assert.equal(passwordProblem('12345678'), null)
  assert.equal(passwordProblem('p'.repeat(128)), null)
  assert.notEqual(passwordProblem('p'.repeat(129)), null)
})

test('the limiter blocks after max failures within the window, and forgets them after it', () => {
  const lim = createLimiter({ max: 3, windowMs: 1000 })
  lim.fail('u:sam', 0); lim.fail('u:sam', 100)
  assert.equal(lim.blocked('u:sam', 200), false)
  lim.fail('u:sam', 200)
  assert.equal(lim.blocked('u:sam', 300), true)
  assert.equal(lim.retryAfter('u:sam', 300), 1)
  assert.equal(lim.blocked('u:other', 300), false)
  assert.equal(lim.blocked('u:sam', 1101), false)   // two of the three have left the window
  lim.fail('u:sam', 1150); lim.fail('u:sam', 1160)
  assert.equal(lim.blocked('u:sam', 1170), true)    // 200, 1150 and 1160 still count
  lim.reset('u:sam')
  assert.equal(lim.blocked('u:sam', 1180), false)
})

test('the limiter sweep drops keys with nothing left in the window', () => {
  const lim = createLimiter({ max: 1, windowMs: 1000 })
  lim.fail('a', 0); lim.fail('b', 900)
  lim.sweep(1500)
  assert.equal(lim.blocked('a', 1500), false)
  assert.equal(lim.blocked('b', 1500), true)
})
