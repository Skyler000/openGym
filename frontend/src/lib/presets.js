// Ready-made training programs.
//
// Each preset is a published, widely-run program expressed in the app's own terms:
// routines, a weekday placement, and one of the progression policies from
// progression.js. Nothing here invents programming — where a program prescribes a
// scheme the app cannot express exactly, the preset says so in `caveat` rather than
// quietly approximating it.
//
// Exercise ids are EXDB ids from exercises-data.js. They are verified to exist; a
// typo here would render a routine with a blank exercise row, so add ids by looking
// them up rather than guessing.
import { uid } from './format.js'

/* ---------- exercise ids, named so the specs below stay readable ---------- */
const X = {
  // barbell
  squat: '0043',          // barbell full squat (back squat)
  frontSquat: '0042',
  bench: '0025',
  inclineBench: '0047',
  deadlift: '0032',
  rdl: '0085',            // romanian deadlift
  ohp: '1456',            // barbell standing close grip military press
  row: '0027',            // barbell bent over row
  powerClean: '0648',
  curl: '0031',
  // bodyweight
  pullup: '0652',
  chinup: '1326',
  dip: '0251',
  pushup: '0662',
  calfRaiseBw: '1373',
  hangingLegRaise: '0472',
  // cable
  pulldown: '2330',
  seatedRow: '1323',
  lowRow: '0180',
  pushdown: '0201',
  pushdownV: '0241',
  // dumbbell
  dbBench: '0289',
  dbIncline: '0314',
  dbRow: '0293',
  dbShoulderPress: '0405',
  dbOhpStanding: '0426',
  dbLateral: '0334',
  dbHammer: '0313',
  dbLunge: '0336',
  goblet: '1760',
  // machine
  legPress: '0739',
  legExt: '0585',
  legCurl: '0586',
  calfRaise: '0605'
}

// Weekday keys match JS getDay(): 0 Sun … 6 Sat. Values index into the preset's routines.
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6

/* ---------- the presets ---------- */
// routine tuple: [name, glyph, prog, [[exerciseId, sets, reps], …]]
// `prog` is a policy from progression.js — 'linear' | 'greyskull' | 'double' | 'off'.
// null means "leave unset", which the app resolves to its own default (linear).
export const PRESETS = [
  {
    key: 'ppl',
    glyph: 'figureStrength',
    name: 'Push / Pull / Legs',
    days: '3 days',
    level: 'Beginner → Intermediate',
    kit: 'Full gym',
    blurb: 'Each session trains what the last one did not: pressing, then pulling, then legs. The default plan, and the easiest split to add days to later.',
    caveat: 'Running it twice over six days is the common intermediate step up — assign the same three routines to Mon–Sat once you are recovering well.',
    routines: [
      ['Push Day', 'barbell', null, [[X.bench, 4, 8], [X.inclineBench, 3, 10], [X.dbOhpStanding, 3, 10], [X.dbLateral, 3, 12], [X.pushdownV, 3, 12], [X.dip, 3, 10]]],
      ['Pull Day', 'pullup', null, [[X.pulldown, 4, 10], [X.row, 4, 8], [X.seatedRow, 3, 10], [X.curl, 3, 10], [X.dbHammer, 3, 12]]],
      ['Leg Day', 'legs', null, [[X.squat, 4, 8], [X.rdl, 3, 10], [X.legPress, 3, 12], [X.legExt, 3, 12], [X.legCurl, 3, 12], [X.calfRaise, 4, 15]]]
    ],
    week: { [MON]: 0, [WED]: 1, [FRI]: 2 }
  },

  {
    key: 'stronglifts',
    glyph: 'barbell',
    name: 'StrongLifts 5×5',
    days: '3 days',
    level: 'Beginner',
    kit: 'Barbell + rack',
    blurb: 'Five compound lifts, five sets of five, three days a week. Add weight every session you complete all the reps. The most-run beginner barbell program there is.',
    caveat: 'The published program alternates A and B every session (A-B-A, then B-A-B). A plan here is fixed per weekday, so this loads as A-B-A every week — a common simplification. Swap Monday and Friday by hand on alternate weeks to run it exactly.',
    routines: [
      ['Workout A', 'barbell', 'linear', [[X.squat, 5, 5], [X.bench, 5, 5], [X.row, 5, 5]]],
      ['Workout B', 'barbell', 'linear', [[X.squat, 5, 5], [X.ohp, 5, 5], [X.deadlift, 1, 5]]]
    ],
    week: { [MON]: 0, [WED]: 1, [FRI]: 0 }
  },

  {
    key: 'startingstrength',
    glyph: 'plate',
    name: 'Starting Strength',
    days: '3 days',
    level: 'Beginner',
    kit: 'Barbell + rack',
    blurb: 'Rippetoe\'s novice programme: three sets of five on the main lifts, one heavy set of five on the deadlift, three days a week. Less total volume than 5×5, so it is easier to recover from.',
    caveat: 'Alternates A and B every session in the book; loaded here as a fixed A-B-A week. Power cleans are technical — substitute barbell rows if you have not been coached on them.',
    routines: [
      ['Workout A', 'barbell', 'linear', [[X.squat, 3, 5], [X.ohp, 3, 5], [X.deadlift, 1, 5]]],
      ['Workout B', 'barbell', 'linear', [[X.squat, 3, 5], [X.bench, 3, 5], [X.powerClean, 5, 3]]]
    ],
    week: { [MON]: 0, [WED]: 1, [FRI]: 0 }
  },

  {
    key: 'greyskull',
    glyph: 'bolt',
    name: 'Greyskull LP',
    days: '3 days',
    level: 'Beginner',
    kit: 'Barbell + rack',
    blurb: 'Two straight sets then a last set taken close to failure. That final set decides what happens next: beat the target and the weight goes up, double it and the jump doubles. Miss once and it resets 10 %.',
    caveat: 'This is the one program the app models exactly — the Greyskull progression policy reads your last set and sets the next target from it, so leave the policy alone.',
    routines: [
      ['Workout A', 'barbell', 'greyskull', [[X.bench, 3, 5], [X.squat, 3, 5], [X.chinup, 3, 5]]],
      ['Workout B', 'barbell', 'greyskull', [[X.ohp, 3, 5], [X.squat, 3, 5], [X.deadlift, 1, 5]]]
    ],
    week: { [MON]: 0, [WED]: 1, [FRI]: 0 }
  },

  {
    key: 'upperlower',
    glyph: 'machine',
    name: 'Upper / Lower',
    days: '4 days',
    level: 'Intermediate',
    kit: 'Full gym',
    blurb: 'Everything twice a week over four sessions. The first pair is heavy and barbell-led, the second lighter and higher-rep, so one week covers both strength and size.',
    caveat: null,
    routines: [
      ['Upper — heavy', 'barbell', 'double', [[X.bench, 4, 6], [X.row, 4, 6], [X.ohp, 3, 8], [X.pulldown, 3, 10], [X.curl, 3, 10], [X.pushdown, 3, 10]]],
      ['Lower — heavy', 'legs', 'double', [[X.squat, 4, 6], [X.rdl, 3, 8], [X.legPress, 3, 10], [X.legCurl, 3, 10], [X.calfRaise, 4, 15]]],
      ['Upper — volume', 'dumbbell', 'double', [[X.dbIncline, 4, 10], [X.seatedRow, 4, 10], [X.dbShoulderPress, 3, 12], [X.pulldown, 3, 12], [X.dbLateral, 3, 15], [X.dbHammer, 3, 12]]],
      ['Lower — volume', 'machine', 'double', [[X.frontSquat, 4, 8], [X.rdl, 3, 10], [X.legExt, 3, 12], [X.legCurl, 3, 12], [X.calfRaise, 4, 15]]]
    ],
    week: { [MON]: 0, [TUE]: 1, [THU]: 2, [FRI]: 3 }
  },

  {
    key: 'fullbody',
    glyph: 'dumbbell',
    name: 'Full Body ×3',
    days: '3 days',
    level: 'Beginner',
    kit: 'Dumbbells + machines',
    blurb: 'One session, run three times a week, hitting everything each time. No barbell and no rack, so it works in a hotel gym or a crowded one.',
    caveat: null,
    routines: [
      ['Full Body', 'dumbbell', 'linear', [[X.goblet, 3, 10], [X.dbBench, 3, 10], [X.dbRow, 3, 10], [X.dbShoulderPress, 3, 12], [X.legCurl, 3, 12], [X.hangingLegRaise, 3, 12]]]
    ],
    week: { [MON]: 0, [WED]: 0, [FRI]: 0 }
  },

  {
    key: 'ppl6',
    glyph: 'flame',
    name: 'Push / Pull / Legs ×2',
    days: '6 days',
    level: 'Intermediate → Advanced',
    kit: 'Full gym',
    blurb: 'The same three sessions run twice over six days. High weekly volume with every muscle trained twice — only worth it if sleep and food are already handled.',
    caveat: 'Six sessions a week is a real recovery load. If you start missing reps you had last week, drop back to the three-day version rather than pushing through.',
    routines: [
      ['Push Day', 'barbell', 'double', [[X.bench, 4, 8], [X.inclineBench, 3, 10], [X.dbOhpStanding, 3, 10], [X.dbLateral, 3, 12], [X.pushdownV, 3, 12], [X.dip, 3, 10]]],
      ['Pull Day', 'pullup', 'double', [[X.pullup, 4, 8], [X.row, 4, 8], [X.seatedRow, 3, 10], [X.lowRow, 3, 12], [X.curl, 3, 10], [X.dbHammer, 3, 12]]],
      ['Leg Day', 'legs', 'double', [[X.squat, 4, 8], [X.rdl, 3, 10], [X.legPress, 3, 12], [X.legExt, 3, 12], [X.legCurl, 3, 12], [X.calfRaiseBw, 4, 15]]]
    ],
    week: { [MON]: 0, [TUE]: 1, [WED]: 2, [THU]: 0, [FRI]: 1, [SAT]: 2 }
  }
]

export const presetByKey = key => PRESETS.find(p => p.key === key) || null

// Fresh routine objects for a preset — new ids every call, so loading one twice
// gives two independent copies rather than aliasing the same routine.
export function presetRoutines(preset) {
  return preset.routines.map(([name, emoji, prog, list]) => {
    const r = { id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }
    if (prog) r.prog = prog
    return r
  })
}

// Routines plus the weekday map that points at them, ready to merge into state.
export function buildPreset(key) {
  const preset = presetByKey(key)
  if (!preset) return null
  const routines = presetRoutines(preset)
  const week = {}
  for (const [day, idx] of Object.entries(preset.week)) week[day] = routines[idx].id
  return { preset, routines, week }
}
