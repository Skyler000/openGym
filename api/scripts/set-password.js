#!/usr/bin/env node
// Gives an existing account a username and password, so it can sign in where passkeys don't work.
// Mostly for the first account, when nobody can sign in to set one from Settings.
//
// Run it with the API stopped: the running server keeps the database in memory and would write its
// own copy back over this change.
//
//   docker compose stop api
//   docker compose run --rm api node scripts/set-password.js "<account name or id>" <username>
//   docker compose start api
//
// A strong password is generated and printed once. One can be passed as a third argument instead,
// but it then stays in the shell history.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { hashPassword, normalizeLogin, loginProblem, passwordProblem } from '../lib/password.js'

const fail = msg => { console.error(msg); process.exit(1) }
const [who, loginArg, passwordArg] = process.argv.slice(2)
if (!who || !loginArg) fail('usage: node scripts/set-password.js "<account name or id>" <username> [password]')

const file = path.join(process.env.DATA_DIR || '/data', 'db.json')
let db
try { db = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { fail(`Can't read ${file}: ${e.message}`) }

const matches = (db.users || []).filter(u => u.id === who || u.name === who)
if (matches.length !== 1) fail(matches.length ? `"${who}" matches ${matches.length} accounts — use the account id.` : `No account called "${who}".`)
const user = matches[0]

const login = normalizeLogin(loginArg)
const problem = loginProblem(login)
if (problem) fail(problem)
if (db.users.some(u => u !== user && u.login === login)) fail(`The username "${login}" is already taken.`)

const password = passwordArg || crypto.randomBytes(12).toString('base64url')
const weak = passwordProblem(password)
if (weak) fail(weak)

user.login = login
user.pw = hashPassword(password)
fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2))
fs.renameSync(file + '.tmp', file)

console.log(`Password sign-in is set for ${user.name}.`)
console.log(`  username: ${login}`)
if (!passwordArg) console.log(`  password: ${password}   (shown once — change it in Settings after signing in)`)
