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
- v0.68 ✓ — **cinematic director + narration fixes**: when you're not following anyone the camera now **glides from critter to critter** (a random follow with a name tag) instead of just orbiting; and the narrator **voice finishes each line** instead of cutting itself off during fast events.
- v0.69 ✓ — **understory & blossoms**: low **shrubs** fill the meadow between the trees, and the broadleaf trees flush with **seasonal blossom** (pink in spring) that ripens to **red fruit** toward autumn.
- v0.70 ✓ — **the critters have voices**: little **stereo-panned** sounds — an **alarm squeak** when one bolts in fright, a **chirp** when one finds food, a contented **hum** while grazing (with the Nature ambience on).
- v0.71 ✓ — **pond life & sun shafts**: **fish** circle and dart under the pond surface, and a soft **god-ray glare** fans out from the low sun at **dawn and dusk**.
- v0.72 ✓ — **a food chain that doesn't crash**: gave prey an **innate foraging drive** and added a **carrying-capacity** brake, so the population now holds a **stable ~150 for generations** instead of booming and busting to extinction — and you can finally watch natural selection play out (the clever lineages win).
- v0.73 ✓ — **a calmer camera**: the auto-follow now hangs back, eases gently, dwells far longer on **calm** critters, and can be switched off entirely with a **🎥 Auto-cam** button (or the **C** key) — much less motion, your choice.
- v0.74 ✓ — **watch the species race**: the population graph now draws a **colored line per species** (with a matching tinted legend), so you can see one lineage climb and overtake the rest over time — evolution as a live chart.
- v0.75 ✓ — **better narration**: the documentary voice no longer **repeats itself** (it remembers its recent lines), no longer **floods** at fast-forward (real-time pacing), and now reflects the **biome's character** (a frozen tundra and strange cyan wilds narrate differently), not just its name.
- v0.76 ✓ — **smoother frames**: render hygiene — high-performance GPU hint, capped render resolution, a tighter sim sub-step cap (no post-hitch spikes), and fewer per-frame allocations, to reduce judder and lighten the load on hi-DPI / weaker GPUs.
- v0.77 ✓ — **narration model picker**: a dropdown that **auto-detects the models installed on your Ollama** (plus recommended tags and a Custom entry), defaulting to your biggest local model — pick whichever you like.
- v0.78 ✓ — **a real narrator voice**: an in-browser **neural TTS** (Kokoro, ~82M) that runs locally on **WebGPU** — pick from British/American voices (defaults to a British male), no server. Falls back to the system voice.
- v0.79 ✓ — **critters talk to each other**: once evolved, two nearby critters strike up a short, slightly-funny **back-and-forth** ("hi! do i know you?" → "we are literally cousins") instead of only blurting solo lines — written by the local LLM when AI narration is on, canned otherwise.
- v0.80 ✓ — **watch the traits evolve**: a second graph plots average **size / speed / sense over time**, so you can see the herd drift smaller/faster/sharper as selection works.
- v0.81 ✓ — **milestone title cards**: a cinematic banner fades in for the big moments — **first flight**, first predator, **generation milestones**, a lineage coming to **rule**, a thriving peak.
- v0.82 ✓ — **Hall of Fame**: a little panel tracks the world's standout critters — the **eldest**, the **most prolific** parent, and the **biggest** alive — named characters to root for as records change hands.
- v0.83 ✓ — **meteor showers & comets**: rare night-sky spectacles — a **meteor shower** radiating from one point, and an occasional slow **comet** with a long glowing tail.
- v0.84 ✓ — **the herd reacts together**: a predator scare or a food find sets off a quick **wave** of reaction bubbles across nearby critters ("run!" / "behind you!", "free food!" / "dibs!").
- v0.85 ✓ — **mini-map**: a corner overview of the **herd**, **predators** (red), **ponds** and **trees**, with a wedge showing where you're looking — keep your bearings and spot the action.
- v0.86 ✓ — **spring blossom petals**: soft pink petals drift down when the trees blossom — the bright counterpart to the autumn leaf-fall, so the year reads at both ends.
- v0.87 ✓ — **camouflage evolves**: predators spot **brightly-coloured** prey from farther off, so under predation prey colour drifts toward the **biome's palette** over generations — watch a population vanish into its world.
- v0.88 ✓ — **highlight reel**: the camera occasionally **swoops to a fresh kill or striking birth** for a few cinematic seconds, then resumes — a gentle cut-away to wherever the drama is.
- v0.89 ✓ — **time-lapse & chapter cards**: a **⏩ Time-lapse** button fast-forwards through generations with cinematic **chapter title cards** — a quick montage of the world's deep time.
- v0.90 ✓ — **genome radar**: the follow panel shows a 5-axis radar of the selected critter's genes vs the **herd average**, so you can see how it stands out.
- v0.91 ✓ — **lineage**: the follow panel shows a critter's **parent** and **offspring** count, with a **"→ follow a living relative"** button to hop along its family line.
- v0.92 ✓ — **bioluminescence evolves**: a heritable **glow** gene makes critters **shimmer at night** — watch luminous lineages emerge in the dark.
- v0.93 ✓ — **trading cards**: the follow panel can **save a PNG trading card** of any critter (portrait + genome + badges) — share your favourites.
- v0.94 ✓ — **shareable worlds**: a **🔗 Share** button copies a link encoding the **seed + levers**; open it and the exact world comes back.
- v0.95 ✓ — **event stingers**: musical cues tied to the drama — a low **thud** on a kill, a bright **chime** on a striking birth, a **shimmer** on a milestone (with ambience on).
- v0.96 ✓ — **discovery log**: a scrollable **📜 Discoveries** panel chronicles the world's striking births and milestones, each stamped with the in-world time.
- v0.97 ✓ — **ground detail**: **grass tufts** and **pebbles** scatter across the terrain for a richer, more lived-in meadow.
- v0.98 ✓ — **water reflections**: the ponds reflect the **sky** (fresnel toward the rim) with a drifting **sun glint** — a more mirror-like surface.
- v0.99 ✓ — **blood moon**: on a rare night the **moon runs deep red**, announced with a banner (and a discovery-log entry) — an uncommon sight to reward a long watch.

### Force of Nature (v1.x) — you wield the world
- v1.0 ✓ — **God Mode**: a toolbar of tools you apply by **clicking the ground**. First tool: **🌾 Feed** rains food where you click — grow the herd, bait it, or end a famine. The framework for every tool + cataclysm.
- v1.1 ✓ — **⚡ Smite**: click to call down a lightning bolt that kills everything in a radius.
- v1.2 ✓ — **🌿 Hatch / 🐺 Predator**: click to drop fresh prey or a carnivore — ignite an arms race or repopulate.
- v1.3 ✓ — **🌸 Bloom / 🌵 Drought**: paint a lush zone or a dead one — starve a region and watch the herd migrate and adapt.
- v1.4 ✓ — **⛰ Raise / 🕳 Dig**: reshape the terrain — sculpt hills or carve basins that flood into instant lakes.
- v1.5 ✓ — **☄️ Asteroid**: the first **cataclysm** — one click slams a fireball into the world: mass death in a wide radius, then a lingering **impact winter** that darkens the sky and crashes food before it slowly lifts.
- v1.6 ✓ — **🌋 Volcano**: an eruption that blasts the area then keeps a **lava field** roasting the vent for ~18s, spitting embers while **ashfall reddens and darkens the sky**.
- v1.7 ✓ — **❄️ Ice Age**: a slow global freeze — a **white-out blizzard**, the meadow ices over (food crash), the cold saps the herd and culls the weak, then it **thaws and life rebounds**.

## Connecting a local LLM for narration
Tick **🤖 AI narration** in the panel. The URL is pre-filled for Ollama
(`http://localhost:11434/api/generate`), and the **model dropdown auto-detects whatever models you've
pulled** (via Ollama's `/api/tags`) — pick any of them, choose one of the recommended tags, or select
**✏️ Custom…** to type your own (e.g. a fine-tune). It defaults to the largest local model you have
installed. The app POSTs `{model, prompt, stream:false}` and uses the `response`; if the server can't
be reached it silently falls back to the built-in template narration.

**CORS:** browser requests need the server to allow your origin — start Ollama with `OLLAMA_ORIGINS=*`
(or your specific origin). This is required for both the narration calls and the model auto-detect.

**Picking a model (rough guide).** Narration lines are short, so even an 8B model reads well; a bigger
model gives richer prose. By VRAM: **~5 GB** → `llama3.1:8b` / `qwen2.5:7b`; **~9 GB** → `qwen2.5:14b`;
**~16 GB** → `gemma2:27b`; **~20 GB+** (e.g. a 4090 / 5090) → `qwen2.5:32b` or any 27–33B model fully
on-GPU. Avoid `*-coder` / `*-embed` models (poor for prose) and reasoning models that emit `<think>`
traces for short lines. Pull one with e.g. `ollama pull qwen2.5:32b`.

The same model also writes the critters' spontaneous **speech-bubble** lines once a lineage evolves
far enough.

## The narrator's voice
Click **🔊 voice** in the documentary panel and pick a voice. The default is **Neural** — **Kokoro**,
a small open TTS that runs **entirely in your browser** (WebGPU if available, else WASM); its weights
(~300 MB) download once from the Hugging Face CDN and the browser caches them, so the first line waits
on that download and the rest are instant. Choose a British or American voice (defaults to British
male **George**). Prefer something else? The dropdown also lists your OS's **system voices**, and the
optional **local neural-TTS URL** box still works (POST `{text}` → audio) for a Piper/XTTS server.
Note: Kokoro emits a couple of harmless `onnxruntime` warnings to the console on load.

Built with TypeScript + Three.js + Vite.
