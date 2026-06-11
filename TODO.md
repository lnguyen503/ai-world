# TODO — AI World

Ideas for where the world could grow next. Nothing here is committed; it's a
backlog of things that would make the zoo richer or more enjoyable to watch.

## Recently shipped
- v0.18–v0.27: deep-space night sky (twinkling stars, nebulae, spiral galaxies, shooting stars, aurora), auto-weather, and a proper hunt (wolf-pack encircling, stalk→dart lunge, cartoon pounce + comic kill, prey panic).
- v0.28–v0.37: constellations, moon phases, ponds, rainbows, butterflies, stamina, cooperative ambush, panic waves, hunt play-by-play narration, and photo mode.
- v0.38–v0.49: planetary sky fix, occasional aurora, drone removal, follow-camera fix, stargaze mode, distinct species, calmer food, clouds + bird flocks, snow, swaying trees, cleaner motes.
- v0.50–v0.58: wildflowers, autumn leaves, pond drinking, per-species HUD counts, kill-drift camera, feature tips, lily pads, drinking ripples.
- v0.59–v0.65: visible macro-mutations, morning mist, dragonflies, glowing mushrooms, horizon hills, **critters talk** (emergent speech bubbles), and **smartness-aware dialogue**.

## Building on the new work
- [ ] **More species + species-specific diet/behaviour** (e.g. a burrower that hides, a glider tied to wings).
- [ ] **Water reflections** in the ponds (mirror the sky / nearby creatures on the surface).
- [ ] **Per-species lines on the population graph** (not just current counts).
- [ ] **Fish** darting under the pond surface.
- [ ] **Sun shafts / god rays** through the trees at dawn and dusk.
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
- [ ] **Reverb / spatial audio** on music and nature so it feels like a place.
- [ ] **Per-creature vocalizations** (chirps on alarm, contented hums while grazing).
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
- [ ] **Tune the food chain** so predator/prey populations cycle stably instead of crashing (Lotka–Volterra-ish).
- [ ] **Web Worker** for the simulation so heavy worlds stay smooth and the tab can run in the background.
- [ ] **Deterministic replay** from a seed + recorded levers, for sharing exact worlds.
- [ ] Performance pass for 1000+ creatures (instancing is in place; profile the brain step).
