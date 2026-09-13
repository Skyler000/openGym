import { describe, it, expect } from 'vitest'
import { routeOf, noteIcon, relTime, monthLabel, shortINR, activityText } from './feed.js'

describe('feed helpers', () => {
  it('routeOf follows only in-app hash routes', () => {
    expect(routeOf('#/c/client/aB3_-x')).toBe('/c/client/aB3_-x')
    expect(routeOf('#/coach')).toBe('/coach')
    expect(routeOf('https://example.com/#/coach')).toBe(null)
    expect(routeOf('#/x?next=//example.com')).toBe(null)
    expect(routeOf('javascript:alert(1)')).toBe(null)
    expect(routeOf(null)).toBe(null)
  })

  it('noteIcon falls back to the bell for types it does not know', () => {
    expect(noteIcon('assigned')).toBe('clipboard')
    expect(noteIcon('something-new')).toBe('bell')
  })

  it('relTime reads minutes, hours, yesterday, then a date', () => {
    const now = new Date(2026, 8, 13, 15, 0).getTime()
    expect(relTime(now - 20e3, now)).toBe('just now')
    expect(relTime(now + 5e3, now)).toBe('just now')             // a device clock slightly behind the server
    expect(relTime(now - 5 * 60e3, now)).toBe('5 min ago')
    expect(relTime(now - 3 * 3600e3, now)).toBe('3 h ago')
    expect(relTime(new Date(2026, 8, 12, 22, 0).getTime(), now)).toBe('Yesterday')
    expect(relTime(new Date(2026, 8, 1, 9, 0).getTime(), now)).toMatch(/^1 Sep/)
    expect(relTime(new Date(2025, 11, 30).getTime(), now)).toMatch(/2025/)
  })

  it('monthLabel names the month of a YYYY-MM key', () => {
    expect(monthLabel('2026-01')).toBe('Jan')
    expect(monthLabel('2026-09')).toMatch(/^Sep/)
  })

  it('shortINR compacts rupees in Indian units', () => {
    expect(shortINR(0)).toBe('₹0')
    expect(shortINR(800)).toBe('₹800')
    expect(shortINR(6000)).toBe('₹6k')
    expect(shortINR(12500)).toBe('₹12.5k')
    expect(shortINR(150000)).toBe('₹1.5L')
    expect(shortINR(20000000)).toBe('₹2Cr')
  })

  it('activityText describes each kind of client activity', () => {
    expect(activityText({ kind: 'workout', name: 'Arjun', title: 'Workout A', sets: 15, prs: 1 }))
      .toMatchObject({ icon: 'dumbbell', text: 'Arjun trained Workout A', detail: '15 sets · 1 PR' })
    expect(activityText({ kind: 'workout', name: 'Arjun', title: 'Run', sets: 1, prs: 0 }).detail).toBe('1 set')
    expect(activityText({ kind: 'weight', name: 'Arjun', value: 72.44, unit: 'kg' }).detail).toBe('72.4 kg')
    expect(activityText({ kind: 'metrics', name: 'Bea', bodyFat: 18.5, muscleMass: null, unit: 'kg' }).detail).toBe('18.5% body fat')
    expect(activityText({ kind: 'photo', name: 'Bea' }).text).toBe('Bea added a progress photo')
  })
})
