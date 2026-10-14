import { test } from 'node:test'
import assert from 'node:assert/strict'
import { route, TASKS } from '../lib/airoute.js'

test('each task maps to a tier, effort and token cap', () => {
  assert.equal(route('summary').tier, 'haiku')
  assert.equal(route('summary').effort, 'low')
  assert.equal(route('plan').tier, 'sonnet')
  assert.equal(route('periodize').tier, 'opus')
  assert.ok(route('plan').model.includes('sonnet'))
  assert.ok(route('summary').max_tokens > 0)
})

test('chat defaults to haiku and escalates to sonnet', () => {
  assert.equal(route('chat').tier, 'haiku')
  assert.equal(route('chat', { escalate: true }).tier, 'sonnet')
})

test('an unknown task falls back to the plan route rather than crashing', () => {
  assert.equal(route('nope').tier, 'sonnet')
})

test('every declared task resolves to a real model id', () => {
  for (const t of TASKS) assert.ok(route(t).model && route(t).model.length, t)
})
