# TODO — AI World

Ideas for where the world could grow next. Nothing here is committed; it's a
backlog of things that would make the zoo richer or more enjoyable to watch.

## Recently shipped (v0.18–v0.27)
Deep-space night sky (twinkling stars, nebulae, spiral galaxies, shooting stars,
aurora), an auto-weather button, and a proper hunt: wolf-pack encircling, a
stalk→dart lunge, a cartoon pounce + comic kill impact, and prey panic.

## Building on the new work
- [ ] **Constellations & a moon-phase cycle**: named star patterns; the moon waxes/wanes over several days.
- [ ] **Pack roles**: some predators drive prey toward others lying in ambush (true cooperative hunting).
- [ ] **Stamina**: a fright sprint / lunge that can't last forever, so chases have an arc and an escape window.
- [ ] **Herd defense**: big prey turn and stand their ground; the "!" spreads panic through the herd as a wave.
- [ ] **Day-of-the-hunt narration**: the narrator calls the chase play-by-play and the camera snaps to it.

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
- [ ] **Photo mode**: hide the UI, free camera, screenshot button.
- [ ] **Mini-map** showing herds, predators, and where you're looking.
- [ ] **Stat overlays**: heatmaps of food, population density, average traits.
- [ ] **Timeline scrubber** with bookmarks for big events (extinctions, first flight, etc.).
- [ ] Mobile / touch controls.

## Balance & tech
- [ ] **Tune the food chain** so predator/prey populations cycle stably instead of crashing (Lotka–Volterra-ish).
- [ ] **Web Worker** for the simulation so heavy worlds stay smooth and the tab can run in the background.
- [ ] **Deterministic replay** from a seed + recorded levers, for sharing exact worlds.
- [ ] Performance pass for 1000+ creatures (instancing is in place; profile the brain step).
