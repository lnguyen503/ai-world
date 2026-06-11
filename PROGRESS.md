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

### v0.18.0 – v0.21.0 — A real night sky (deep space)
A new `src/render/cosmos.ts` owns the celestial dome so `scene.ts` stays
manageable. **v0.18** replaced the flat 1,400-point starfield with **3,600 stars**
of varied size and colour temperature (white / blue-giant / gold) that twinkle
individually via a small shader. **v0.19** added five large, faint, slowly-breathing
**nebula** clouds. **v0.20** added a rotating golden **3-arm spiral galaxy** (with
pink HII-region knots and a glowing core) plus a small bluish companion. **v0.21**
added **shooting stars** — point-trails that streak across the deep-night sky.

### v0.22.0 — Auto-weather
A **🎲 auto** button by the Weather lever. When on, a slow random-walk driver eases
the weather through rolling fronts — long calm spells punctuated by occasional
storms (~6s half-life, weighted toward calm). The slider tracks the live value;
dragging it manually takes back control.

### v0.23.0 – v0.26.0 — Wolves & the chase
The predator/prey loop grew teeth. **v0.23**: predators sharing a quarry **fan out
and circle it** (tangential steering, sides split by id) instead of all charging
from one direction. **v0.24**: a **stalk → dart** rhythm — they creep while lining
up, then explode into a fast committed **lunge** with a duration and cooldown.
**v0.25**: a **cartoon pounce** (squash-and-stretch + a springy hop, leaning into
the dive) and a comic white/orange **"POW" star-burst** on a kill. **v0.26**: prey
**panic** — a close predator triggers a **fright sprint** with quick startle hops
and a bobbing yellow **"!"** overhead, so the hunt reads as nature from both sides.

### v0.27.0 — Aurora
A shimmering green→magenta **aurora** curtain waves along the horizon on clear,
calm nights (custom GLSL, gated by night depth and calm weather). It caps the
deep-space sky overhaul.

### v0.28.0 – v0.29.0 — A richer night sky
**v0.28** added four named **constellations** (The Critter, The Wing, The Drop,
The Hunter) — bright marker stars joined by faint lines with subtle labels,
placed around the dome and only emerging in deep darkness. **v0.29** made the
**moon waxes and wanes**: a shader terminator sweeps across the disk over a
lunar month (~8 in-world days), with faint earthshine on the dark limb.

### v0.30.0 – v0.32.0 — A living landscape
**v0.30** added **ponds** — shimmering translucent pools (rippling shader,
sky-tinted, dimming at night) that settle into the lowest terrain basins;
creatures steer **around** open water while flyers pass over it. **v0.31**: a
**rainbow** arch springs up opposite the sun and fades whenever a storm clears
on a bright day. **v0.32**: 26 colourful **butterflies** flutter low over the
meadow by day and vanish at night.

### v0.33.0 – v0.36.0 — The hunt, deepened
**v0.33** gave every creature a **stamina** reserve — a predator's dart and a
prey's fright bolt drain it, rest refills it; a hunter must have stamina to
commit (low → it stalks and recovers, an escape window), and a tiring prey's
bolt fades (shown as a bar in the follow panel). **v0.34**: **cooperative
ambush** — the predator closest to the quarry drives it forward while the others
swing to the far side, so the fleeing prey is driven into the jaws that waited.
**v0.35**: **panic waves** — a prey that hears an alarm catches the fright and
re-broadcasts it, so panic ('!' pops + startle hops) ripples through the whole
herd. **v0.36**: the narrator interjects a quick **play-by-play** line the
instant a kill lands, bypassing its slow ambient cadence.

### v0.37.0 — Photo mode
A clean cinematic frame: hide every UI panel with the 📷 button or the **H** key
(a dimmed toggle stays so you can bring the UI back).

### v0.38.0 – v0.39.0 — Night-sky fixes (from feedback)
**v0.38** fixed the sky feeling "stuck to a flat plane" when rotating: the dome
sat at the world origin while the camera orbited almost up against it, causing
heavy parallax. Now the sky dome, every deep-space object and the moon **follow
the camera**, so the viewer is always at the centre of the celestial sphere —
zero parallax, a genuinely infinite planetary sky — and the deep-sky materials
opt out of ground fog so they stay crisp. **v0.39** made the aurora an
**occasional** treat: a fresh strength is rolled each nightfall (~45% of nights
none, ~35% faint, ~20% a real show), and the overall intensity was toned down,
so it's no longer the same wash of aurora every single night.

### v0.40.0 – v0.41.0 — More fixes (from feedback)
**v0.40** removed the low "ominous" drone that faded in when a predator was on
the prowl — it was reported as an annoying noise. **v0.41** fixed the jank when
following a creature: the follow panel had been rebuilding its entire `innerHTML`
(~15 rows) every frame, forcing a full DOM re-parse + layout 60×/sec on the main
thread (no GPU can help with that). Now the panel is built once per selected
creature and only its live values update in place via cached element refs —
verified smooth, with every field still populating.

### v0.42.0 — Stargaze mode
A button (and the **G** key) frees the camera from its ground-facing clamp: it
aims up-and-forward and lets you pan across the night sky with a slow drift
across the stars, then restores the normal camera on exit. Creature-picking is
disabled while gazing, and it pairs with photo mode (**H**) for a pure sky view.

### v0.43.0 — Distinct species
A heritable `species` gene picks one of five archetypes that differ in **every**
manner — silhouette, features, motion, and intelligence: **Pebble** (round,
big-eyed, placid), **Foxling** (sleek, pointy-eared, quick and clever),
**Hopkin** (tall egg that springs in big hops), **Slink** (long, low, earless,
slithers with a wobble), and **Beetlebug** (small, wide, antennaed, skittery and
dim). Smartness multiplies a creature's sense range and steering finesse, so the
species genuinely differ in survival skill; locomotion adds per-species bob, hop
and wobble. Species is inherited like a clan, mixes via crossover, and very
rarely speciates on mutation. The follow panel shows which species you're
watching.

### v0.44.0 — Calmer food (from feedback)
The glowing green food orbs were carpeting the screen and pulling attention off
the biome. Cut the density (~150 vs 260, lower cap + regrow) and made each pellet
small, soft-green and barely emissive so bloom no longer turns the field into
glowing balls; per-pellet energy nudged up to keep the ecosystem balanced.

### v0.45.0 – v0.48.0 — Atmosphere
**v0.45**: big soft **clouds** drift overhead and trail travelling shadows on the
meadow; cover thickens with the weather and fades at night so it never hides the
stars. **v0.46**: two V-formation **bird flocks** cross the sky, visible around
dawn and dusk. **v0.47**: cold biomes (Frost Tundra) get **snow** instead of rain
— slow drifting flakes with a sideways flutter. **v0.48**: tree canopies **sway**
on the breeze, gently when calm and harder as storms build.

### v0.49.0 — Cleaner meadow
The daytime **motes** had been hard white square points that speckled the view;
they're now soft round glowing specks (drifting pollen), fewer and dimmer, and
the fireflies got the same soft glow. Finishes the decluttering pass.

### v0.50.0 – v0.55.0 — Life & detail
**v0.50**: ~420 soft 5-petal **wildflowers** in six pastel hues scatter across the
meadow (re-seated on each new biome, dimming at night). **v0.51**: **autumn
leaves** drift and flutter down whenever the season turns the foliage brown,
recycling to the canopy. **v0.52**: calm, well-fed prey **drink at the ponds** —
an attraction toward the water balances the avoid-the-water force so they settle
at the shoreline and dip their heads (a predator instantly cancels it). **v0.53**:
the HUD shows a live **per-species population** so you can watch the smarter/faster
archetypes out-compete the rest. **v0.54**: when you're not following anyone, the
cinematic camera gently **drifts toward a fresh kill** then eases back — subtle,
never snapping. **v0.55**: tidied the HUD so the new species panel (top-right,
under the population graph) and the narration panel no longer overlap.

### v0.56.0 — A gentle assistant
A small pill (new `src/ui/tips.ts`) fades in at the top every ~40s with one fun
thing the visitor can try — stargaze, photo mode, follow a critter, speed up
time, the weather lever, the species race, drinking, AI narration, and more. It
never blocks clicks, lingers ~9s, cycles without repeating, and hides itself in
photo mode. A subtle nudge, never a nag.

### v0.57.0 – v0.58.0 — Pond life
**v0.57**: a few **lily pads** float and bob gently on each pond (rebuilt with
the ponds). **v0.58**: a drinking critter now sends soft **ripples** spreading
across the water from the shoreline in front of it (an instanced expanding-ring
pool).

### v0.59.0 — Evolution you can see
Rare **macro-mutations** now produce visibly striking newborns — a giant or a
dwarf, a bold new colour, a brand-new species, sudden flight, fangs, a sprinter
or sharpened senses. Each surprise pops with a bright magical sparkle, keeps
shimmering for a few seconds, and the narrator calls it out ("nature tries
something new, and a giant appears among them"). You just watch the interesting
changes happen; the documentary voice explains them.

### v0.60.0 – v0.63.0 — A living, beautiful biome
**v0.60**: low **morning mist** banks gather at dawn and burn off as the sun
climbs. **v0.61**: iridescent **dragonflies** hover and dart over the ponds by
day. **v0.62**: little **mushrooms** at the tree bases softly **bioluminesce**
(teal/violet/green/pink) after dark. **v0.63**: a ring of hazy, fog-faded
**distant hills** surrounds the meadow, tinted to each biome's palette, giving
the world a real horizon and parallax as you orbit.

### v0.64.0 — Emergent speech
Once a lineage has evolved far enough (generation 4+), its **mature, brighter
critters** (the smart species) occasionally blurt a short, spontaneous line shown
in a **speech bubble** over their head — a reward for evolving. When AI narration
is enabled the lines are written by the **local LLM** and are context-aware
(eating, fleeing, drinking, night, hunting); otherwise a pool of cute canned
lines is used. It's deliberately sparse — at most 4 bubbles, ~5s each, with a
long cooldown — so it stays charming, never spammy. New `src/ui/chatter.ts`
drives it; the scene renders a small pool of bubble sprites. (Like everything
sim-timed, the bubbles only appear in a foreground tab where the world actually
evolves — a background tab throttles the loop and the world stays at age 0.)

### v0.65.0 — Smartness-aware dialogue
The spoken lines now fit the **mind that says them**. The local-LLM prompt is told
how clever the speaker is — witty/curious for the bright species (Foxling), plain
and cheerful for average wits (Hopkin), goofy and simple for the dim ones (Slink)
— and that shapes both tone and length. The situation handed to the model is
richer and sharper too: it now factors in **hunger** and phrases the moment
vividly ("fleeing for your life from a predator", "stalking your prey", "happily
eating", "wandering, hungry, hunting for food"). Witty critters earn a slightly
longer line (up to ~8 words vs ~5), and the trim cap was raised to fit. The canned
fallback pool is unchanged, so it still reads well with AI narration off.

## How it's verified
Every iteration: `tsc --noEmit` (zero errors) + `vite build` (clean bundle),
plus visual spot-checks via Chrome. Note: a backgrounded browser tab throttles
`requestAnimationFrame`, so the sim only runs full-speed in a foreground tab —
this is browser behavior, not a bug.

## Tech
TypeScript + Three.js + Vite. No backend; everything runs in the browser. The
optional LLM/TTS hooks talk to a local server (e.g. Ollama) if you enable them.
