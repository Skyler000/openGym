// The Push/Pull/Legs starter plan, kept as its own entry point because the demo build
// seeds a history on top of exactly these three routines (demoSeed.js keys its starting
// weights off their exercise ids, in this order). The spec itself now lives with the
// other programs in presets.js — this is a named view onto the 'ppl' preset, not a
// second copy of it.
import { presetByKey, presetRoutines } from './presets.js'

// Fresh routine objects (new ids) — [push, pull, legs].
export const starterRoutines = () => presetRoutines(presetByKey('ppl'))
