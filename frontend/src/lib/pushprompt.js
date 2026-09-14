// Which notification prompt, if any, to show on this device. Pure, so the rules are testable.
//   env from pushEnv(): { ios, standalone, supported, permission, subscribed }
//   'enable'  — this device can subscribe: offer the button
//   'install' — an iPhone or iPad in the browser, where alerts need the app on the Home Screen first
//   'blocked' — permission was refused earlier, which only the device's settings can undo
//   null      — subscribed already, snoozed, still loading, or push is impossible here
export const PROMPT_SNOOZE_DAYS = 7

export function promptKind(env, { snoozedUntil = 0, now = Date.now() } = {}) {
  if (!env || env.subscribed) return null
  if (now < snoozedUntil) return null
  if (env.permission === 'denied') return 'blocked'
  if (env.supported) return 'enable'
  if (env.ios && !env.standalone) return 'install'
  return null
}
