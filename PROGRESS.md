# Progress — AI World

A development chronicle of the 3D artificial-life zoo. Each version was built,
type-checked (`tsc --noEmit`), production-built (`vite build`), and committed
separately. The world grew one feature at a time, driven by what made it more
alive and more enjoyable to watch.

## The journey so far

### v0.1.0 — A living world
The foundation: creatures with a **genome** (size, speed, sense range, color)
that wander, sense food, eat, spend energy to live and move, **reproduce** with
small mutations, age, and die. Limited food means **natural selection** does the
rest. A zoo camera lets you click any creature and follow it close-up; a time
bar (pause → 0.25× → 20×) lets you watch generations fly by. If everyone dies,
the world reseeds so the zoo never goes empty.

### v0.2.0 — Biomes & atmosphere
Procedural **biomes** (a different world every launch) with seeded value-noise
**terrain**, six palette presets, **day/night**, **seasons**, drifting fertile
zones, **bloom glow**, and a live **levers** panel to tune the simulation.

### v0.3.0 — Brains that evolve
Each creature now thinks with a tiny inherited + mutated **neural network**
(5→6→2 MLP). Foraging skill is no longer hard-coded — it **evolves on its own**.
Follow a creature to watch its brain drive its decisions.

### v0.4.0 — Cute cartoon creatures
Cel/**toon shading**, inverted-hull **black outlines**, big anime **eyes that
blink**, pastel colors, and heritable features — round/pointy **ears**,
**antennae**, optional **tails**, squishy body shapes. Every lineage looks
different.

### v0.5.0 — Social life
Creatures form **communities** (herding with neighbors, weighted by an evolvable
*sociability* gene) and **communicate** — finding food broadcasts a signal that
pulls neighbors in (emergent group foraging). Faint **bond lines** show who's
grouped; an expanding **pulse ring** shows a "found food!" call.

### v0.6.0 — Predators, weather & shelter
**Predators & prey** (red carnivores hunt, prey flee — an evolving food chain).
A **Weather lever**: calm → rain → hail/storms → **lightning that kills the
exposed**. **Shelter trees** the critters learn to huddle under as storms roll
in. Plus little mouths for extra cuteness.

### v0.7.0 — Narration & flight
A reactive **David Attenborough narrator**. **Evolvable flight**: a `wings` gene
where flyers escape ground predators but can't shelter from storms — so calm
worlds grow wings while storm-wracked worlds stay grounded.

### v0.8.0 — David speaks
On-device **text-to-speech** (Web Speech API) with an enable button and a voice
picker that auto-selects a British male voice. No cloud, no API key.

### v0.9.0 — Names, families & society
**Names** for every critter; **lineage/family coloring**; **mating** (two parents
mix genomes via crossover); **alarm calls** (prey warn the herd); **predator
packs**; the **flying-predator arms race**; **save & load** a world; ambient
**nature sounds + music**; and a **local neural-TTS hook**.

### v0.10.0 — Sleep, prowl & a mood-aware narrator
Critters **sleep at night** (closed eyes, tipped-over pose, floating **zzz**)
while predators **prowl**; an **ominous drone** fades in when a hunter stalks;
**randomized soft music** and varied nature; and a **non-repeating narrator**
that mirrors the world's mood (nightfall, storms, hunts, dawn).

### v0.11.0 / v0.11.1 — Clarity & LLM narration
**Floating name tags** above the followed creature; predators are now **always
red-rimmed** (obvious even in lineage mode); an optional **local-LLM narration**
hook (Ollama-style — reads biome + world state, with template fallback). v0.11.1
fixed the "weird humming" music by replacing the sustained sine drone with an
enveloped pentatonic note sequencer.

### v0.12.0 — Flight motion & cinematic camera
Flyers now **swoop, dip, pitch, and bank** like real flight, with bigger
wingbeats. A relaxing **cinematic auto-orbit** drifts around the world whenever
you're not following a creature.

### v0.13.0 / v0.14.0 — Babies & a magical night
**Baby critters** are born small and **grow up**; juveniles can't breed until
mature. After dark, drifting glowing **fireflies** and a soft **moon** rise.

### v0.15.0 / v0.16.0 — Seasons & life moments
Visible **seasons** (foliage drifts green ↔ autumn) and daytime **drifting
motes** (pollen / insects). **Life moments**: gold **sparkles** at a birth, a
grey **poof** at a death.

### v0.17.0 — Cinematic polish
A fading **intro title card** and a soft **vignette** frame, so the world feels
like a nature documentary the moment it loads.

## How it's verified
Every iteration: `tsc --noEmit` (zero errors) + `vite build` (clean bundle),
plus visual spot-checks via Chrome. Note: a backgrounded browser tab throttles
`requestAnimationFrame`, so the sim only runs full-speed in a foreground tab —
this is browser behavior, not a bug.

## Tech
TypeScript + Three.js + Vite. No backend; everything runs in the browser. The
optional LLM/TTS hooks talk to a local server (e.g. Ollama) if you enable them.
