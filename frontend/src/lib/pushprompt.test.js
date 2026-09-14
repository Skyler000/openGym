import { describe, it, expect } from 'vitest'
import { promptKind } from './pushprompt.js'

const base = { ios: false, standalone: false, supported: true, permission: 'default', subscribed: false }

describe('notification prompt', () => {
  it('offers to turn notifications on where the device can subscribe', () => {
    expect(promptKind(base)).toBe('enable')
  })
  it('shows nothing once this device is subscribed', () => {
    expect(promptKind({ ...base, subscribed: true, permission: 'granted' })).toBe(null)
  })
  it('offers again when permission is granted but the subscription has lapsed', () => {
    expect(promptKind({ ...base, permission: 'granted' })).toBe('enable')
  })
  it('explains how to unblock when permission was refused', () => {
    expect(promptKind({ ...base, permission: 'denied' })).toBe('blocked')
  })
  it('on an iPhone in Safari, explains adding the app to the Home Screen first', () => {
    expect(promptKind({ ...base, ios: true, supported: false })).toBe('install')
  })
  it('in the app on an iPhone Home Screen, offers the button', () => {
    expect(promptKind({ ...base, ios: true, standalone: true })).toBe('enable')
  })
  it('stays quiet where push is impossible, such as a plain-HTTP address', () => {
    expect(promptKind({ ...base, supported: false })).toBe(null)
    expect(promptKind({ ...base, ios: true, standalone: true, supported: false })).toBe(null)
  })
  it('"Not now" hides every kind of prompt until the snooze runs out', () => {
    expect(promptKind(base, { snoozedUntil: 2000, now: 1000 })).toBe(null)
    expect(promptKind({ ...base, permission: 'denied' }, { snoozedUntil: 2000, now: 1000 })).toBe(null)
    expect(promptKind(base, { snoozedUntil: 2000, now: 3000 })).toBe('enable')
  })
  it('stays quiet until it knows what the device can do', () => {
    expect(promptKind(null)).toBe(null)
  })
})
