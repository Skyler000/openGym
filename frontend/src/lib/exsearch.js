// Smart exercise search. People don't know the catalogue's exact names — they type gym slang
// ("pecs", "abs", "legs"), plurals, words in any order, or a small typo ("benh press"). This matches
// all of that against the dataset's own clinical vocabulary ("pectorals", "delts", "upper legs") and
// ranks the best hits first. Pure — no store, no DOM — so the rules are unit-tested (exsearch.test.js).

// Everyday words → the words the dataset actually stores (name, body part, target/secondary muscles,
// equipment). A value is a space-separated list of fields to look for; each is matched as a whole.
const SYNONYMS = {
  pec: 'pectorals', pecs: 'pectorals', chest: 'pectorals',
  core: 'abs', sixpack: 'abs', stomach: 'abs', belly: 'abs', tummy: 'abs',
  oblique: 'obliques',
  bi: 'biceps', bicep: 'biceps', bis: 'biceps',
  tri: 'triceps', tricep: 'triceps', tris: 'triceps',
  shoulder: 'delts', shoulders: 'delts', delt: 'delts', deltoid: 'delts', deltoids: 'delts',
  trap: 'traps', rhomboid: 'upper back', rhomboids: 'upper back',
  lat: 'lats', wing: 'lats', wings: 'lats',
  quad: 'quads', quadriceps: 'quads', thigh: 'quads', thighs: 'quads',
  ham: 'hamstrings', hams: 'hamstrings', hamstring: 'hamstrings',
  glute: 'glutes', butt: 'glutes', booty: 'glutes', buttocks: 'glutes', hip: 'glutes',
  calf: 'calves',
  forearm: 'forearms', grip: 'forearms', wrist: 'forearms',
  leg: 'legs', legs: 'legs',          // the dataset's body parts are "upper legs" / "lower legs"
  arm: 'arms', cardio: 'cardio', run: 'cardio', running: 'cardio', jog: 'cardio',
  bike: 'cardio', cycling: 'cardio', elliptical: 'cardio', treadmill: 'cardio',
  bodyweight: 'body weight', calisthenics: 'body weight', home: 'body weight', nogym: 'body weight',
  db: 'dumbbell', dumbell: 'dumbbell', dumbells: 'dumbbell',
  bb: 'barbell', kb: 'kettlebell', ez: 'ez barbell',
  band: 'band', bands: 'band', cable: 'cable', machine: 'machine', smith: 'smith machine'
}

// Words that carry no exercise meaning, so a query like "chest workout" matches on "chest" alone.
const STOPWORDS = new Set(['workout', 'workouts', 'exercise', 'exercises', 'move', 'movement', 'routine',
  'training', 'train', 'day', 'the', 'a', 'an', 'for', 'with', 'my', 'me', 'and', 'to', 'do', 'of', 'on', 'best', 'how'])

const normalize = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

export function queryTokens(query) {
  const seen = new Set()
  return normalize(query).split(' ').filter(w => w && !STOPWORDS.has(w) && !seen.has(w) && seen.add(w))
}

// A token plus its synonym targets and its singular/plural, so "pecs", "curls" and "leg" all reach.
function expand(tok) {
  const out = new Set([tok])
  const syn = SYNONYMS[tok]
  if (syn) for (const w of syn.split(' ')) out.add(w)
  if (tok.length > 3 && tok.endsWith('s')) out.add(tok.slice(0, -1))
  else out.add(tok + 's')
  return [...out].filter(v => v.length >= 2)
}

// Levenshtein distance, giving up (returns -1) once it passes `cap` — for typo tolerance only.
function lev(a, b, cap) {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > cap) return -1
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const d = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1])
      cur[j] = d
      if (d < rowMin) rowMin = d
    }
    if (rowMin > cap) return -1
    prev = cur
  }
  return prev[n] <= cap ? prev[n] : -1
}

// A per-exercise search index, cached on the exercise object (EXDB entries are static; custom
// exercises are recreated on edit, and a WeakMap lets those be collected).
const cache = new WeakMap()
function indexOf(ex) {
  let idx = cache.get(ex)
  if (idx) return idx
  const name = normalize(ex.n)
  const fields = normalize([ex.bp, ex.tg, ex.mg, ex.eq, ex.cat, ...(ex.sm || []), ...(ex.bp === 'cardio' ? ['cardio'] : [])].join(' '))
  idx = { name, words: name.split(' ').filter(Boolean), fields: ' ' + fields + ' ' }
  cache.set(ex, idx)
  return idx
}

// How well one query token matches one exercise, 0 for no match. Name hits outrank muscle/equipment
// hits, which outrank typo (fuzzy) hits — so an exact name is always above a same-muscle suggestion.
function matchToken(idx, tok) {
  let best = 0
  for (const v of expand(tok)) {
    for (const w of idx.words) {
      if (w === v) best = Math.max(best, 100)
      else if (w.startsWith(v)) best = Math.max(best, 60)
    }
    // Substring-anywhere only for longer words — otherwise "run" matches "crunch". Short words still
    // match as a whole name word (above) or a whole field value (word-boundary, below).
    if (best < 40 && v.length >= 4 && idx.name.includes(v)) best = Math.max(best, 40)
    if (best < 30 && idx.fields.includes(' ' + v + ' ')) best = Math.max(best, 30)
    else if (best < 28 && v.length >= 4 && idx.fields.includes(v)) best = Math.max(best, 28)
  }
  if (best < 24 && tok.length >= 4) {
    const cap = tok.length >= 7 ? 2 : 1
    for (const w of idx.words) {
      if (Math.abs(w.length - tok.length) > cap) continue
      const d = lev(w, tok, cap)
      if (d >= 0) { best = Math.max(best, 24 - d * 5); break }
    }
  }
  return best
}

// The significant name words (filler dropped, singularised) as a set — order-independent, so
// "Barbell Bench Press" and "bench press barbell" compare equal.
function nameSet(name) {
  const toks = normalize(name).split(' ')
    .filter(w => w && !STOPWORDS.has(w))
    .map(w => (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w)
  return new Set(toks)
}

// A strict match for folding an AI-invented custom exercise back onto a real catalogue one: the
// significant name words must be exactly the same set. This reuses "Barbell Bench Press" ⇄
// "bench press barbell" but refuses "incline bench press" or a mere same-muscle neighbour — a wrong
// reuse would quietly swap the movement, so it stays conservative. Returns the match, or null.
export function findCatalogueMatch(name, list) {
  const a = nameSet(name)
  if (!a.size) return null
  let best = null
  for (const ex of list) {
    const b = nameSet(ex.n)
    if (b.size === a.size && [...a].every(x => b.has(x)) && (!best || ex.n.length < best.n.length)) best = ex
  }
  return best
}

// Ranked matches for `query` within `list`. Every query word must match somewhere (so "dumbbell curl"
// excludes barbell curls), and results are ordered best-first. An empty query returns the list as-is.
export function searchExercises(list, query) {
  const toks = queryTokens(query)
  if (!toks.length) return list
  const scored = []
  for (const ex of list) {
    const idx = indexOf(ex)
    let total = 0, ok = true
    for (const tk of toks) {
      const s = matchToken(idx, tk)
      if (!s) { ok = false; break }
      total += s
    }
    if (ok) scored.push({ ex, s: total, len: idx.name.length })
  }
  scored.sort((a, b) => b.s - a.s || a.len - b.len || (a.ex.n < b.ex.n ? -1 : 1))
  return scored.map(x => x.ex)
}
