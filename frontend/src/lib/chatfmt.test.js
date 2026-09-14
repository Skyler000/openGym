import { describe, it, expect } from 'vitest'
import { dayLabel, groupByDay, fmtBytes, fmtClock, presenceText, mergeMessage, mergeMessages, applyReceipt, initials, EMOJI } from './chatfmt.js'

describe('chat helpers', () => {
  const now = new Date(2026, 8, 13, 15, 0).getTime()
  const at = (day, hour) => new Date(2026, 8, day, hour).getTime()

  it('dayLabel names today and yesterday, then the date', () => {
    expect(dayLabel(at(13, 8), now)).toBe('Today')
    expect(dayLabel(at(12, 23), now)).toBe('Yesterday')
    expect(dayLabel(at(10, 9), now)).toMatch(/10 Sep/)
  })

  it('groupByDay keeps the order and splits at local midnight', () => {
    const groups = groupByDay([{ id: 'a', created: at(12, 23) }, { id: 'b', created: at(13, 1) }, { id: 'c', created: at(13, 9) }], now)
    expect(groups.map(g => [g.label, g.items.map(m => m.id).join('')])).toEqual([['Yesterday', 'a'], ['Today', 'bc']])
  })

  it('fmtBytes and fmtClock', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(900)).toBe('900 B')
    expect(fmtBytes(12 * 1024)).toBe('12 KB')
    expect(fmtBytes(1.44 * 1024 * 1024)).toBe('1.4 MB')
    expect(fmtClock(7)).toBe('0:07')
    expect(fmtClock(65.4)).toBe('1:05')
    expect(fmtClock(null)).toBe('0:00')
  })

  it('presenceText', () => {
    expect(presenceText({ online: true }, now)).toBe('online')
    expect(presenceText({ online: false, lastSeen: now - 5 * 60e3 }, now)).toBe('last seen 5 min ago')
    expect(presenceText(null, now)).toBe('offline')
  })

  it('mergeMessage adds a message once, in time order', () => {
    const a = { id: 'a', created: 1 }, b = { id: 'b', created: 3 }, c = { id: 'c', created: 2 }
    const list = mergeMessage([a, b], c)
    expect(list.map(m => m.id)).toEqual(['a', 'c', 'b'])
    expect(mergeMessage(list, c)).toBe(list)
  })

  it('mergeMessages takes fresher copies and adds what was missed', () => {
    const list = [{ id: 'a', created: 1, readAt: null }, { id: 'b', created: 2, readAt: null }]
    const page = [{ id: 'b', created: 2, readAt: 9 }, { id: 'c', created: 3, readAt: null }]
    expect(mergeMessages(list, page)).toEqual([
      { id: 'a', created: 1, readAt: null }, { id: 'b', created: 2, readAt: 9 }, { id: 'c', created: 3, readAt: null }
    ])
    expect(mergeMessages([], page)).toEqual(page)
  })

  it('applyReceipt marks only the listed messages that were still unread', () => {
    const list = [{ id: 'a', readAt: null }, { id: 'b', readAt: 5 }, { id: 'c', readAt: null }]
    expect(applyReceipt(list, { ids: ['a', 'b'], at: 9 })).toEqual([{ id: 'a', readAt: 9 }, { id: 'b', readAt: 5 }, { id: 'c', readAt: null }])
  })

  it('initials takes the first letter of up to two words', () => {
    expect(initials('Arjun Client')).toBe('AC')
    expect(initials('  sam   admin  extra ')).toBe('SA')
    expect(initials('riya')).toBe('R')
    expect(initials('💪 Gym')).toBe('💪G')
    expect(initials('')).toBe('?')
  })

  it('the emoji picker has no duplicates', () => {
    expect(new Set(EMOJI).size).toBe(EMOJI.length)
  })
})
