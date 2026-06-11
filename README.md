# 🌱 AI World

A 3D artificial-life world where little AI creatures forage, reproduce, mutate, and **evolve on
their own** under natural selection. You're a visitor — wander the world like a zoo, click any
creature to follow it close-up, and speed up or slow down time to watch generations unfold.

Inspired by artificial-life simulations like **The Bibites**, MinuteLabs' evolution simulator, and
Framsticks.

## Watch it

```
cd C:\ai-world
npm install      # first time only
npm run dev      # opens http://localhost:5173 in your browser
```

## Controls

- **Drag** to look around · **scroll** to zoom
- **Click a creature** to follow it close-up (a panel shows its genes, energy, age)
- **Time bar (bottom):** ⏸ pause · 0.25× slow-mo · 1× · 2× · 5× · 20× fast-forward

## How the life works (v0.1)

Each creature carries a **genome**: size, speed, sense range, and color. They wander, sense nearby
food, head for it, and eat to gain energy. Moving and living costs energy (bigger + faster = hungrier).
Store enough energy and a creature **reproduces** — the child is a near-copy with small random
**mutations**. Run out of energy or grow too old and it dies. Because food is limited, **natural
selection** does the rest: whichever trait mixes forage most efficiently leave more offspring, and
the population drifts over generations. Color encodes lineage, so you can literally watch evolution.

If the population ever fully dies out, the world reseeds with fresh random creatures so the zoo stays alive.

## Project layout

```
src/
  config.ts          all the tunable numbers (food, energy, mutation, gene ranges)
  sim/               the simulation (no rendering)
    genome.ts        genes + mutation
    creature.ts      one creature's behavior (sense → move → eat → reproduce → age)
    food.ts          food pellets
    world.ts         owns everything, runs each step, tracks stats (+ spatial grid)
  render/scene.ts    Three.js scene, creatures, food, the follow ("zoo") camera
  ui/hud.ts          stats, time controls, follow panel, population graph
  main.ts            wires it together + the time-scaled loop
```

## Roadmap (it grows over iterations)

- v0.2 ✓ — procedural **biomes** (a different world every time), **terrain**, **day/night**, **seasons**, drifting fertile zones, **bloom glow**, and a live **levers** panel
- v0.3 ✓ — **neural-net brains**: each creature thinks with a small inherited+mutated neural network, so foraging skill **evolves on its own** instead of being hard-coded. Follow a creature to watch its brain fire.
- v0.4 ✓ — **cute cartoon creatures**: cel/toon shading, black outlines, big anime eyes (that blink), pastel colors, and randomized **heritable** features — round ears / pointy ears / antennae, optional tails, and squishy body shapes — so every lineage looks different.
- v0.5 ✓ — **social life**: creatures form **communities** (they herd with neighbors, weighted by an evolvable *sociability* gene) and **communicate** — a creature that finds food broadcasts a signal that draws nearby creatures in (emergent group foraging). Faint **bond lines** show who's grouped; an expanding **pulse ring** shows a "found food!" call.
- v0.6 ✓ — **predators & prey** (red carnivores hunt; prey flee — an evolving food chain), a **Weather lever** (calm → rain → hail/storms → **lightning that kills the exposed**), and **shelter trees** the critters huddle under as storms roll in. Plus little mouths for extra cuteness.
- v0.7 ✓ — **David Attenborough narration** (a reactive documentary voiceover), and **evolvable flight**: a `wings` gene where flyers escape ground predators but can't shelter from storms — so calm worlds grow wings while storm-wracked worlds keep them grounded. (Brains keep evolving smarter, too.)
- v0.8 ✓ — the narrator can **speak**: local, on-device **text-to-speech** (Web Speech API) with an enable button + voice picker that auto-selects a British male voice. No cloud, no API key.
- v0.9 ✓ — **names** for every critter; **lineage/family coloring**; **mating** (two parents mix genomes); **alarm calls** (prey warn the herd); **predator packs**; the **flying-predator arms race**; **save & load** a world; **ambient nature sounds + music**; and a **local neural-TTS hook** (falls back to the system voice).
- v0.10 ✓ — critters **sleep at night** (closed eyes, tipped-over pose, floating **zzz**) while predators **prowl**; an **ominous drone** fades in when a hunter is stalking; **randomized soft music** + varied nature; and a **non-repeating narrator** that mirrors the world's mood (nightfall, storms, hunts, dawn).
- v0.11 ✓ — **floating name tags** above the critter you click; predators are now **always red-rimmed** (clear even in lineage mode); and an optional **local-LLM narration** hook (Ollama-style — reads the biome + world state and writes the line, with template fallback).

- v0.12 ✓ — flyers now **swoop, dip, pitch, and bank** like real flight (with bigger wingbeats); and a relaxing **cinematic auto-orbit** camera drifts around the world whenever you're not following a creature.
- v0.13 ✓ — **baby critters** are born small and **grow up**; juveniles can't breed until grown.
- v0.14 ✓ — a **magical night**: drifting glowing **fireflies** and a soft **moon** rise after dark.
- v0.15 ✓ — visible **seasons** (foliage drifts green↔autumn) and daytime **drifting motes** (pollen / insects).
- v0.16 ✓ — **life moments**: gold **sparkles** when a creature is born, a grey **poof** when one dies.
- v0.17 ✓ — cinematic polish: a fading **intro title card** and a soft **vignette** frame.
- v0.18 ✓ — a **deeper, twinkling starfield**: thousands of stars with varied size and colour (white / blue-giant / gold) that shimmer individually.
- v0.19 ✓ — **deep-space nebulae**: large, faint, slowly-breathing colour clouds high in the night sky.
- v0.20 ✓ — **spiral galaxies**: a big golden 3-arm galaxy (with pink HII knots) rotating overhead, plus a small bluish companion.
- v0.21 ✓ — **shooting stars** streak across the deep-night sky every few seconds.
- v0.22 ✓ — a **🎲 auto-weather** button: slow random fronts roll through on their own (calm spells punctuated by storms).
- v0.23 ✓ — **wolf-pack hunting**: predators sharing a quarry **fan out and circle it** instead of charging from one side.
- v0.24 ✓ — a **stalk → dart** rhythm: predators creep, then explode into a fast committed **lunge** (with a cooldown).
- v0.25 ✓ — a **cartoon pounce** (squash-and-stretch + a springy hop) and a comic **"POW" star-burst** on a kill.
- v0.26 ✓ — **prey panic**: a close predator spooks prey into a **fright sprint** with startle hops and a bobbing **"!"**.
- v0.27 ✓ — a shimmering **aurora** ribbon along the horizon on clear, calm nights.
- v0.28 ✓ — named **constellations** (The Critter, The Wing, The Drop, The Hunter) emerge in deep darkness.
- v0.29 ✓ — the **moon waxes and wanes** through its phases over several in-world days.
- v0.30 ✓ — **ponds**: shimmering pools settle into terrain basins; creatures walk **around** the water.
- v0.31 ✓ — a **rainbow** arches across the sky when a storm clears in daylight.
- v0.32 ✓ — **butterflies** flutter over the meadow by day.
- v0.33 ✓ — **stamina**: a predator's dart and a prey's bolt tire them out, giving chases an arc and an escape window.
- v0.34 ✓ — **cooperative ambush**: one predator drives the prey while the others flank to the far side (a pincer).
- v0.35 ✓ — **panic waves**: fright ripples outward through the herd as each spooked prey alarms the next.
- v0.36 ✓ — the narrator calls the **play-by-play** the instant a kill lands.
- v0.37 ✓ — **photo mode**: hide all the UI for a clean cinematic frame (button or the **H** key).
- v0.38 ✓ — **a real planetary sky**: the sky dome, deep-space objects and moon follow the viewer (infinitely far, no parallax when you orbit) and ignore ground fog — no more "flat plane" feel.
- v0.39 ✓ — the **aurora is now occasional**: a fresh strength is rolled each night (most nights none or faint, sometimes a real show), and toned down overall.
- v0.40 ✓ — removed the **ominous prowl drone** (it was an annoying noise).
- v0.41 ✓ — **fixed follow-camera jank**: the follow panel no longer rebuilds its DOM every frame, so following a creature is smooth.
- v0.42 ✓ — **stargaze mode**: free the camera to tilt up and pan across the night sky (button or the **G** key).
- v0.43 ✓ — **distinct species**: five heritable archetypes (Pebble, Foxling, Hopkin, Slink, Beetlebug) with different shapes, motion, and **smartness** — same cuteness, obviously different.
- v0.44 ✓ — **calmer food**: sparser, smaller, soft-green pellets so they read as scattered flora instead of carpeting the biome (raise via the Food lever).
- v0.45 ✓ — **drifting clouds** with soft travelling shadows; cloud cover thickens with the weather.
- v0.46 ✓ — **flocks of birds** cross the sky at dawn and dusk.
- v0.47 ✓ — **snow** instead of rain in cold biomes (Frost Tundra).
- v0.48 ✓ — **trees sway** in the wind (gentle when calm, whipping in a storm).
- v0.49 ✓ — softer, fewer floating **motes** (drifting pollen) and round-glow fireflies — a cleaner meadow.
- v0.50 ✓ — **meadow wildflowers** scattered across the ground in pastel hues.
- v0.51 ✓ — **falling autumn leaves** when the season turns the foliage brown.
- v0.52 ✓ — critters **drink at the ponds** (wander to the shoreline and dip their heads).
- v0.53 ✓ — live **per-species population** counts in the HUD — watch the archetypes compete.
- v0.54 ✓ — a **cinematic camera** that gently drifts toward a fresh kill when you're not following anyone.
- v0.55 ✓ — HUD tidy-up so the species panel and narration don't overlap.
- v0.56 ✓ — gentle **feature tips**: a subtle pill fades in now and then suggesting a fun thing to try (never blocks the view, hides in photo mode).
- v0.57 ✓ — **lily pads** float and bob on the ponds.
- v0.58 ✓ — **ripples** spread across the water when a critter drinks.
- v0.59 ✓ — **evolutionary surprises**: rare bold mutations produce a visibly striking newborn (a giant, a dwarf, a new colour, a new species, sudden flight or fangs) — with a sparkle and a narrator callout.
- v0.60 ✓ — **morning mist** that gathers at dawn and burns off as the sun climbs.
- v0.61 ✓ — **dragonflies** dart over the ponds by day.
- v0.62 ✓ — **glowing mushrooms** bioluminesce near the trees at night.
- v0.63 ✓ — hazy **distant hills** ring the horizon for depth.
- v0.64 ✓ — **critters talk!** Once a lineage evolves far enough (gen 4+), its clever, grown-up critters blurt short, spontaneous lines in **speech bubbles** — written by the local LLM when AI narration is on, with cute canned lines otherwise.
- v0.65 ✓ — **smartness-aware dialogue**: each critter now talks like the mind it has — the witty species get clever, slightly longer lines; the simpler ones stay goofy and brief — and the lines react to hunger and the moment (fleeing, stalking, eating, drinking).
- v0.66 ✓ — **a living soundscape**: the ambience now reacts to the world — daytime **birdsong**, evening **crickets**, night **owls & frogs**, **wind** that swells with the weather, **rain & distant thunder** in storms; and the **music** shifts mood (bright by day, a slow **lullaby** at night, hushed in a storm) with arpeggios, a warm pad and a soft echo. New **"Nature + Music"** option layers both.
- v0.67 ✓ — **trees with character**: every tree is now uniquely shaped — randomized trunk height/girth and lean, **real branches** forking out with leaf clumps, and two silhouettes (rounded **broadleaf** or stacked-cone **conifer**) — and each sways as a whole from its base in the wind.

## Connecting a local LLM for narration
Tick **🤖 AI narration** in the panel and enter a URL + model. It POSTs `{model, prompt, stream:false}` to e.g. Ollama's `http://localhost:11434/api/generate` and uses the `response`. If your server rejects browser requests (CORS), set `OLLAMA_ORIGINS=*` (or your origin) before starting it; otherwise it falls back to the built-in narration.

Built with TypeScript + Three.js + Vite.
