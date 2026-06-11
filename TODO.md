# TODO — AI World

Ideas for where the world could grow next. Nothing here is committed; it's a
backlog of things that would make the zoo richer or more enjoyable to watch.

## Recently shipped
- v0.18–v0.27: deep-space night sky (twinkling stars, nebulae, spiral galaxies, shooting stars, aurora), auto-weather, and a proper hunt (wolf-pack encircling, stalk→dart lunge, cartoon pounce + comic kill, prey panic).
- v0.28–v0.37: constellations, moon phases, ponds, rainbows, butterflies, stamina, cooperative ambush, panic waves, hunt play-by-play narration, and photo mode.
- v0.38–v0.49: planetary sky fix, occasional aurora, drone removal, follow-camera fix, stargaze mode, distinct species, calmer food, clouds + bird flocks, snow, swaying trees, cleaner motes.
- v0.50–v0.58: wildflowers, autumn leaves, pond drinking, per-species HUD counts, kill-drift camera, feature tips, lily pads, drinking ripples.
- v0.59–v0.65: visible macro-mutations, morning mist, dragonflies, glowing mushrooms, horizon hills, **critters talk** (emergent speech bubbles), and **smartness-aware dialogue**.
- v0.66: a **living soundscape** — day/night/weather-reactive nature (birdsong, crickets, owls, frogs, wind, rain, thunder) and **mood-aware music** (day/night/storm) with a new "Nature + Music" mode.
- v0.67: **trees with character** — per-tree randomized trunk/lean, real branches with leaf clumps, broadleaf vs conifer silhouettes, whole-tree sway.
- v0.68: **cinematic director** (camera glides from critter to critter when idle) + **narration voice fix** (finishes each line instead of cutting off during fast events).
- v0.69: **understory bushes** + **seasonal blossom/fruit** on the broadleaf trees.
- v0.70: **per-creature vocalizations** — stereo-panned alarm/chirp/hum by what each critter is doing.
- v0.71: **pond fish** (circling/darting under the surface) + **dawn/dusk god-ray sun shafts**.
- v0.72: **food-chain balance** — innate prey foraging + carrying-capacity brake; population now holds a stable ~150 for generations instead of crashing to extinction.
- v0.73: **calmer camera** (from feedback) — gentler/farther auto-follow, calm subjects, longer dwells, + a 🎥 Auto-cam on/off toggle (C key).
- v0.74: **species race graph** — per-species colored lines over time on the population chart (legend tinted to match).
- v0.75: **narration fixes** (from feedback) — no repeats (recent-line memory), real-time pacing (no fast-forward flood), and per-biome character woven into the lines + LLM prompt.
- v0.76: **render hygiene** (from feedback on smoothness) — high-perf GPU hint, 1.5× pixel-ratio cap, sub-step cap 40→14, fewer per-frame allocations.

## Building on the new work
- [ ] **More species + species-specific diet/behaviour** (e.g. a burrower that hides, a glider tied to wings).
- [ ] **Water reflections** in the ponds (mirror the sky / nearby creatures on the surface).
- [ ] **A bigger "evolution event" banner** for the rarest surprises (first-ever flyer, a new apex predator).
- [ ] **Herd defense**: big prey turn and stand their ground instead of always fleeing.
- [ ] **Seasonal night sky**: constellations rotate / different stars rise across the in-world year.

## World & ecosystem
- [ ] **Water**: ponds / rivers that creatures drink from or avoid; aquatic lineages over time.
- [ ] **Plants that spread**: food that grows from seeds and forms patches, so foraging pressure shifts location over generations.
- [ ] **More terrain features**: hills that block sight, caves for shelter, cliffs.
- [ ] **Multiple biomes in one world**: a desert edge, a forest, a meadow — with migration between them.
- [ ] **Disease / parasites** as another selection pressure.

## Creatures & evolution
- [ ] **Browsable family tree**: click a creature → see ancestors and descendants, jump between them.
- [ ] **More body parts**: horns, spots, fur tufts, fins — all heritable.
- [ ] **Diet specialization**: herbivore / omnivore / scavenger niches.
- [ ] **Camouflage gene**: prey color drifts toward the terrain palette under predation.
- [ ] **Memory in the brain**: a recurrent unit so creatures can remember where food was.
- [ ] **Smarter mating choice**: sexual selection on visible traits (bright colors, size).

## Audio
- [ ] **Fuller spatial audio / reverb** (a convolver room on the music + nature bed; v0.70 added a music echo and panned creature voices, but the bed is still mono).
- [ ] Hook up a real **Piper / XTTS** server for higher-quality narration voices.

## Narration & AI
- [ ] Let the **local LLM** name dramatic individuals and tell their ongoing story across the session.
- [ ] **Highlight reel**: the narrator picks the most dramatic recent event and the camera flies to it.
- [ ] Streaming LLM narration so lines appear word-by-word.

## UX & presentation
- [ ] **Screenshot/export button** (photo mode hides the UI — add a one-click capture).
- [ ] **Mini-map** showing herds, predators, and where you're looking.
- [ ] **Stat overlays**: heatmaps of food, population density, average traits.
- [ ] **Timeline scrubber** with bookmarks for big events (extinctions, first flight, etc.).
- [ ] Mobile / touch controls.

## Balance & tech
- [x] **Tune the food chain** so the population stops crashing to extinction (v0.72: innate foraging + carrying capacity → stable ~150). *Next:* richer predator/prey *oscillation* (Lotka–Volterra cycles) now that the base is stable.
- [ ] **Web Worker** for the simulation so heavy worlds stay smooth and the tab can run in the background.
- [ ] **Deterministic replay** from a seed + recorded levers, for sharing exact worlds.
- [ ] Performance pass for 1000+ creatures (instancing is in place; profile the brain step).
