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

Built with TypeScript + Three.js + Vite.
