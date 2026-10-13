import { useId } from 'react'

// The WinterARC mark — kept in step with public/icon.svg (the app icon): a lime ascent/peak with a
// cool teal "winter" echo, a summit spark and an arc, on the icon's dark ground. Shown on the login
// screen and the loading splash so the app matches its home-screen icon. Gradient ids are per-instance
// so two logos on one page never collide.
export default function Logo({ size = 80, rounded = true }) {
  const u = useId().replace(/:/g, '')
  const bg = 'b' + u, lime = 'l' + u, teal = 't' + u, glow = 'g' + u
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="WinterARC"
      style={rounded ? { borderRadius: Math.round(size * 0.22), display: 'block' } : { display: 'block' }}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e1728" /><stop offset="1" stopColor="#05070c" /></linearGradient>
        <linearGradient id={lime} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#1fb04a" /><stop offset="1" stopColor="#5ef08a" /></linearGradient>
        <linearGradient id={teal} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#2aa7bd" /><stop offset="1" stopColor="#6fe3f2" /></linearGradient>
        <radialGradient id={glow} cx="50%" cy="60%" r="55%"><stop offset="0" stopColor="#30d158" stopOpacity="0.30" /><stop offset="1" stopColor="#30d158" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="512" height="512" fill={`url(#${bg})`} />
      <circle cx="256" cy="298" r="196" fill={`url(#${glow})`} />
      <path d="M152 348 L256 236 L360 348" fill="none" stroke={`url(#${teal})`} strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
      <path d="M124 352 L256 176 L388 352" fill="none" stroke={`url(#${lime})`} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M256 150 l10 26 26 10 -26 10 -10 26 -10 -26 -26 -10 26 -10 z" fill="#eafff0" />
      <path d="M132 388 Q256 430 380 388" fill="none" stroke="#30d158" strokeWidth="14" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
