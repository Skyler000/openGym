// Weight-unit conversion for logging on a machine whose plates read in the other unit. The app stores
// every weight in one base unit (S.unit); these let a set be entered in kg or lb and converted back to
// that base before it's stored, so history, best and 1RM stay comparable. The factors are exact
// reciprocals, so fromBaseWeight(toBaseWeight(x)) lands back on x. Pure — unit-tested in units.test.js.
export const KG_PER_LB = 0.45359237
export const LB_PER_KG = 1 / KG_PER_LB   // ≈ 2.2046226

const round2 = n => Math.round(n * 100) / 100
const round1 = n => Math.round(n * 10) / 10

// A weight typed in `from` ('kg' | 'lb') expressed in the `base` unit it's stored in. Rounds to 0.01.
export function toBaseWeight(v, from, base) {
  const n = Number(v) || 0
  if (from === base) return n
  return round2(base === 'kg' ? n * KG_PER_LB : n * LB_PER_KG)
}

// A stored `base`-unit weight expressed in the `to` display unit. Rounds to 0.1 (the logger's step).
export function fromBaseWeight(v, base, to) {
  const n = Number(v) || 0
  if (to === base) return n
  return round1(base === 'kg' ? n * LB_PER_KG : n * KG_PER_LB)
}

// The +/- step the logger uses in a given unit — a 2.5 kg plate change, or a 5 lb one.
export const weightStep = unit => (unit === 'lb' ? 5 : 2.5)
