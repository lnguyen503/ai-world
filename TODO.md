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
- v0.77: **narration model picker** — auto-detects installed Ollama models (/api/tags) + recommended tags + Custom entry; defaults to your biggest local model.
- v0.78: **in-browser neural narrator voice** — Kokoro TTS via transformers.js (WebGPU), voice picker (British/American), system-voice fallback; loaded as a lazy chunk.
- v0.79: **critters talk to each other** (from feedback) — nearby evolved critters have a short, lightly-funny back-and-forth (canned or LLM-written); lone ones still muse solo.
- v0.80: **trait-over-time graph** — avg size/speed/sense normalised + plotted under the species race.
- v0.81: **milestone banners** — cinematic title cards (first flight, first predator, generation/dominance/peak milestones).
- v0.82: **Hall of Fame** — eldest / most-prolific / biggest living critters (offspring counter added).
- v0.83: **meteor showers & comets** — radiant meteor-shower bursts (pool 4→14) + a rare slow comet.
- v0.84: **herd reaction chatter** — group reaction waves to predators/food (reuses the bubble queue).
- v0.85: **mini-map** — corner overview (herd, predators, ponds, trees + camera view wedge).
- v0.86: **spring blossom petals** — pink petal-fall in spring (counterpart to the autumn leaves).
- v0.87: **camouflage evolution** — predators spot off-colour prey at longer range; prey hue drifts toward the biome palette (ecosystem stays stable at ~150).
- v0.88: **highlight reel** — the camera occasionally swoops to a fresh kill / striking birth, then resumes.
- v0.89: **time-lapse & chapter cards** — ⏩ button fast-forwards (40×) through generations with cinematic chapter title cards.
- v0.90: **genome radar** — 5-axis radar (size/speed/sense/social/wings) of the selected critter vs herd average.
- v0.91: **lineage panel** — parent + offspring on the follow panel, with a "follow a living relative" jump.
- v0.92: **bioluminescence** — heritable glow gene; critters shimmer at night.
- v0.93: **creature trading cards** — follow panel exports a PNG card (portrait + genome + badges).
- v0.94: **shareable world permalink** — 🔗 Share encodes seed + levers in the URL hash; reload restores the world.
- v0.95: **event sound stingers** — kill thud / birth chime / milestone shimmer (SoundManager.stinger).
- v0.96: **discovery log** — scrollable 📜 history of striking births + milestones, timestamped.
- v0.97: **ground detail** — grass tufts + pebbles scattered on the terrain (per biome, dim at night).
- v0.98: **water reflections** — fresnel sky reflection + drifting sun glint in the pond shader.
- v0.99: **blood moon** — rare red-moon night (moon-shader tint) with a banner + discovery-log entry.
- v1.0: **God Mode foundation** — top toolbar + ground-click raycast; 🌾 Feed tool rains food where you click.
- v1.1: **⚡ Smite tool** — click to strike lightning that kills in a radius (reuses the lightning visual).
- v1.2: **Spawn tools** — 🌿 Hatch (prey) / 🐺 Predator drop fresh creatures where you click.
- v1.3: **Drought / Bloom brush** — paint dead/lush zones (World.addZone, processed each step).
- v1.4: **Terraform** — ⛰ Raise / 🕳 Dig sculpt the biome height (gaussian edits), rebuild terrain/trees/ponds.
- v1.5: **☄️ Asteroid cataclysm** — a one-click world disaster: mass death in a wide radius, an impact "POW", and a lasting impact-winter pall that darkens the sky and crashes food before it slowly lifts.
- v1.6: **🌋 Volcano cataclysm** — an eruption that blasts the area, then keeps a sustained lava field roasting anything near the vent for ~18s while ashfall reddens and darkens the sky, spitting embers the whole time.
- v1.7: **❄️ Ice age cataclysm** — a slow global freeze: a forced white-out blizzard, the meadow ices over (food crash), the cold saps the whole herd, then it thaws and life rebounds.
- v1.8: **🦠 Plague cataclysm** — a contagion with a new **heritable resistance gene**: a few patient-zeros infect neighbours, sickness saps energy (less if resistant), survivors gain immunity and breed — so each outbreak **selects the population's resistance upward**. Sick critters glow a clammy green.
- v1.9: **🌟 Radiations & Eras** — the recovery payoff: a **🌟 Radiation** tool (and an automatic trigger when the population rebounds from a crash) opens a **new era** with an adaptive-radiation surge — cranked mutation + eased breeding → explosive diversification. The world tracks an **era counter** (punctuated equilibrium): die-off → radiation → new era, announced with a banner.
- v2.0: **🔊 Spatial audio** — a Web Audio **listener that rides the camera**, so the soundscape pans and fades as you fly and zoom. Critter voices (and the kill thud) now emit from each critter's **world position** through 3D HRTF panners; the chatter biases toward whatever you're looking at and **swells when you zoom in, thins to a murmur when you pull back**.
- v2.1: **💧 Positional surroundings** — each **pond** now carries a soft **looping water bed parked in 3D** at its location, so as you fly past you hear water on the correct side and it fades with distance. Rebuilds when ponds move (terraforming).
- v2.2: **🧭 Panel alignment pass** — every HUD panel unified to one width + left edge (left and right columns line up); the stats panel's hidden "Flyers" row is back; bottom-left re-spaced into an even, non-overlapping stack.
- v2.3: **💬 Livelier, on-topic critter chatter** — talking starts earlier (gen 2) and includes more species, fires roughly twice as often (still paced, never spammy), and every line is now **chosen by what's actually happening** — fleeing, a volcano, the freeze, a plague (sick critters say sick things), a new era, a storm, night, eating — with funnier, scenario-specific one-liners and pair exchanges. The local-LLM prompts get the scenario too.
- v2.7: **🔥 Cataclysm set-pieces** — the asteroid and volcano now have real 3D animations: a **fireball streaks down from the sky and bursts** (impact flash + expanding ground shockwave + flying debris), and the volcano **erupts a roaring lava fountain** with a flickering red glow for the whole eruption. They also now **land where the camera is looking**, so you actually see them. (New `src/render/cataclysmFx.ts`.)
- v2.6: **🎞 Frame pacing & portability** — fixed the camera jitter/stutter (it was machine-dependent, not the browser): all camera smoothing is now **frame-rate-independent** (`fdamp`) so it feels identical and stays smooth at 60/144/240Hz, the auto-orbit uses `controls.update(dt)` (no more 4×-fast spin on high-refresh monitors), and the HUD's per-frame DOM/canvas writes are **throttled to 15Hz** (the main per-frame hitch). With the existing pixel-ratio cap and the Glow/bloom toggle that skips post-processing, the sim should run smoothly on a wide range of machines for open-source.
- v2.5: **💥 Cataclysm feedback** — the disasters worked all along (kills, gloom, lava, freeze all fire), but had no punchy moment so they were easy to miss. Each now triggers an instant **full-screen colour flash** (and a **screen-shake** for the asteroid/volcano) the moment you click — impossible to overlook — on top of the slower world-changes. Also fixed: era banners no longer go silent after a reset/new-biome/extinction (handlers re-bound to each fresh world).
- v2.4: **🌌 Night-sky polish** — the galaxies are **de-pixelated** (soft round point-sprites + a fill halo → a smooth glowing spiral, not hard dots), and the whole deep sky is **re-rolled every night**: a random subset of constellations (library expanded to 10) scattered to new spots, galaxies/nebulae repositioned, re-tinted and some absent on a given night. Stars are now **clarity-aware** — a full field on clear nights, thinning to just the bright giants when it clouds over.

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
- [x] **Better narrator voice** — done in v0.78 (in-browser **Kokoro** neural TTS via transformers.js, WebGPU, with a voice picker; system-voice + remote-URL fallbacks). *Next:* optional self-hosted model/wasm for fully-offline use (currently fetches from HF + jsdelivr CDNs on first load), and streaming synthesis.

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
