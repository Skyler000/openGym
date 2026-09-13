// Ready-made training programs.
//
// Two kinds live here. Most are published, widely-run programs (StrongLifts, Starting Strength,
// Greyskull…) expressed in the app's own terms: routines, a weekday placement, and one of the
// progression policies from progression.js. The Fat Loss, Cardio, HIIT and Flexibility entries are
// general templates rather than named programs, and their blurbs say so. Where a program prescribes
// a scheme the app cannot express exactly, the preset says so in `caveat` rather than approximating.
//
// Exercise ids are EXDB ids from exercises-data.js, and presets.test.js checks every one resolves —
// a typo would otherwise render as a blank exercise row, so add ids by looking them up.
import { uid } from './format.js'

// Also the plan categories a coach files plans under (api/routes/coach.js adds 'Custom').
export const PRESET_CATEGORIES = ['Strength Training', 'Muscle Building', 'Fat Loss', 'Cardio', 'HIIT', 'Flexibility']

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
  walkingLunge: '1460',
  gluteBridgeMarch: '3561',
  // cable
  pulldown: '2330',
  seatedRow: '1323',
  lowRow: '0180',
  pushdown: '0201',
  pushdownV: '0241',
  // dumbbell / kettlebell
  dbBench: '0289',
  dbIncline: '0314',
  dbRow: '0293',
  dbShoulderPress: '0405',
  dbOhpStanding: '0426',
  dbLateral: '0334',
  dbHammer: '0313',
  dbLunge: '0336',
  goblet: '1760',
  kbSwing: '0549',
  // machine
  legPress: '0739',
  legExt: '0585',
  legCurl: '0586',
  calfRaise: '0605',
  // conditioning
  run: '0685',
  bikeRun: '2138',        // stationary bike
  elliptical: '2141',
  inclineWalk: '3666',    // walking on incline treadmill
  burpee: '1160',
  mountainClimber: '0630',
  jumpSquat: '0514',
  highKnees: '3636',
  skaterHops: '3361',
  // mobility
  worldsGreatest: '1604', // world greatest stretch
  hamstringStretch: '1511',
  quadStretch: '1512',
  piriformisStretch: '2567',
  lowerBackStretch: '0690',
  latStretch: '1346',
  chestStretch: '1271',
  calfStretch: '1377'
}

// Weekday keys match JS getDay(): 0 Sun … 6 Sat. Values index into the preset's routines.
const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6

// A timed hold or interval: `rest` is the coach-style rest after it, used by the workout screen.
const hold = (sets, sec, rest) => ({ sets, mode: 'time', sec, ...(rest ? { rest } : {}) })
const cardio = (sets, min, speed) => ({ sets, min, speed })

/* ---------- the presets ---------- */
// routine tuple: [name, glyph, prog, [exercise, …]]
// exercise: [id, sets, reps] for sets of reps, or [id, config] for anything else — the config is
// exactly what a routine stores for that exercise (see defaultConfig in history.js).
// `prog` is a policy from progression.js — 'linear' | 'greyskull' | 'double' | 'off'. null leaves it
// unset, which the app resolves to its own default (linear). Holds and cardio ignore rep policies.
export const PRESETS = [
  {
    key: 'ppl',
    category: 'Muscle Building',
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
    category: 'Strength Training',
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
    category: 'Strength Training',
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
    category: 'Strength Training',
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
    category: 'Muscle Building',
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
    category: 'Muscle Building',
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
    category: 'Muscle Building',
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
  },

  {
    key: 'fatloss',
    category: 'Fat Loss',
    glyph: 'target',
    name: 'Fat Loss Circuit',
    days: '3 days',
    level: 'Beginner',
    kit: 'Dumbbells + treadmill',
    blurb: 'A general template rather than a named program: full-body strength work to hold on to muscle while eating less, then a short incline walk to finish. Pair it with daily steps on the days in between.',
    caveat: 'Fat loss is decided mostly by what you eat — this keeps you strong and moving while the diet does the heavy lifting. Keep the weights challenging rather than going light for "toning".',
    routines: [
      ['Full-body circuit', 'target', 'double', [
        [X.goblet, 3, 12], [X.pushup, 3, 12], [X.dbRow, 3, 12], [X.walkingLunge, 3, 12], [X.gluteBridgeMarch, 3, 12],
        [X.mountainClimber, hold(3, 40, 30)],
        [X.inclineWalk, cardio(1, 15, 5)]
      ]]
    ],
    week: { [MON]: 0, [WED]: 0, [FRI]: 0 }
  },

  {
    key: 'cardio',
    category: 'Cardio',
    glyph: 'figureRun',
    name: 'Cardio Base Builder',
    days: '4 days',
    level: 'Beginner',
    kit: 'Treadmill, bike, elliptical',
    blurb: 'A general template: four steady sessions on different machines, all at a pace you could hold a conversation at. It builds the aerobic base everything else sits on, without pounding the same joints every day.',
    caveat: 'The speeds are a starting point, not a target. If you can’t speak in full sentences, slow down — easy days are meant to feel easy.',
    routines: [
      ['Easy run', 'figureRun', null, [[X.run, cardio(1, 25, 8)]]],
      ['Bike intervals', 'bike', null, [[X.bikeRun, cardio(6, 3, 22)]]],
      ['Incline walk', 'figureRun', null, [[X.inclineWalk, cardio(1, 35, 5)]]],
      ['Elliptical', 'heart', null, [[X.elliptical, cardio(1, 30, 7)]]]
    ],
    week: { [MON]: 0, [TUE]: 1, [THU]: 2, [SAT]: 3 }
  },

  {
    key: 'hiit',
    category: 'HIIT',
    glyph: 'timer',
    name: 'HIIT 25',
    days: '3 days',
    level: 'Intermediate',
    kit: 'Bodyweight + kettlebell',
    blurb: 'A general template: about twenty-five minutes of hard intervals — work, short rest, repeat, six moves. It is only as effective as the work intervals are hard.',
    caveat: 'High-impact. Warm up for five minutes first, and swap the jumps for low-impact versions if knees or ankles complain. Two or three sessions a week is plenty on top of other training.',
    routines: [
      ['HIIT circuit', 'timer', 'off', [
        [X.burpee, hold(4, 30, 30)],
        [X.kbSwing, hold(4, 40, 20)],
        [X.jumpSquat, hold(4, 30, 30)],
        [X.mountainClimber, hold(4, 40, 20)],
        [X.highKnees, hold(4, 30, 30)],
        [X.skaterHops, hold(4, 30, 30)]
      ]]
    ],
    week: { [MON]: 0, [WED]: 0, [FRI]: 0 }
  },

  {
    key: 'mobility',
    category: 'Flexibility',
    glyph: 'stretch',
    name: 'Daily Mobility',
    days: '3+ days',
    level: 'All levels',
    kit: 'No equipment',
    blurb: 'A general template: a fifteen-minute stretch routine for hips, hamstrings, back and shoulders. Holds, not reps — breathe slowly and ease a little further in on each breath out.',
    caveat: 'Placed on Tuesday, Thursday and Sunday so it sits between typical training days instead of replacing them. It is gentle enough for every day — add more days in your plan if you like.',
    routines: [
      ['Mobility flow', 'stretch', 'off', [
        [X.worldsGreatest, hold(2, 45, 15)],
        [X.hamstringStretch, hold(2, 40, 15)],
        [X.quadStretch, hold(2, 40, 15)],
        [X.piriformisStretch, hold(2, 40, 15)],
        [X.lowerBackStretch, hold(2, 40, 15)],
        [X.latStretch, hold(2, 40, 15)],
        [X.chestStretch, hold(2, 40, 15)],
        [X.calfStretch, hold(2, 40, 15)]
      ]]
    ],
    week: { [TUE]: 0, [THU]: 0, [SUN]: 0 }
  }
]

export const presetByKey = key => PRESETS.find(p => p.key === key) || null

// One exercise entry as a routine stores it. A [id, sets, reps] tuple keeps exactly the shape the
// starter plan always produced; an [id, config] pair is taken as the config itself.
export const presetItem = ([id, a, b]) => (a && typeof a === 'object' ? { id, ...a } : { id, sets: a, reps: b, weight: 0 })

// Fresh routine objects for a preset — new ids every call, so loading one twice
// gives two independent copies rather than aliasing the same routine.
export function presetRoutines(preset) {
  return preset.routines.map(([name, emoji, prog, list]) => {
    const r = { id: uid(), name, emoji, ex: list.map(presetItem) }
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

// "5 × 5", "4 × 30s", "2 × 1:30", "25 min" or "6 × 3 min" — for previews, not for logging.
export function schemeOf(cfg) {
  if (cfg.min != null) return (cfg.sets > 1 ? cfg.sets + ' × ' : '') + cfg.min + ' min'
  if (cfg.mode === 'time') {
    const s = cfg.sec || 0
    return cfg.sets + ' × ' + (s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + 's')
  }
  return cfg.sets + ' × ' + cfg.reps
}
