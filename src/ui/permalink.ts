import { params } from '../config';
import type { Biome } from '../biome';

// Shareable worlds: the biome seed + the key levers are encoded in the URL hash, so a link recreates
// an exact world. Great for sharing a find from an open-source build.
const FIELDS = ['foodAbundance', 'metabolism', 'mutationRate', 'seasonStrength', 'weather', 'dayLengthSec'] as const;

/** Restore a shared world (seed + levers) from the URL hash, if present. Call right after the biome
 *  is created and before the world/scene, so the terrain is seeded correctly. */
export function applyPermalink(biome: Biome): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const seed = h.get('w');
  if (seed === null) return;
  const s = parseInt(seed, 10);
  if (!Number.isNaN(s)) biome.reseed(s);
  for (const f of FIELDS) {
    const v = h.get(f);
    if (v !== null) { const n = parseFloat(v); if (!Number.isNaN(n)) params[f] = n; }
  }
}

/** Build the shareable hash for the current world + levers. */
export function buildPermalink(biome: Biome): string {
  const h = new URLSearchParams();
  h.set('w', String(biome.seed));
  for (const f of FIELDS) h.set(f, String(+params[f].toFixed(3)));
  return `#${h.toString()}`;
}

/** Wire the Share button: copy a permalink to the clipboard (and update the URL bar). */
export function setupShare(biome: Biome): void {
  const btn = document.getElementById('c-share');
  if (!btn) return;
  btn.addEventListener('click', () => {
    history.replaceState(null, '', buildPermalink(biome));
    const label = btn.textContent ?? '';
    const flash = (msg: string): void => { btn.textContent = msg; setTimeout(() => { btn.textContent = label; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => flash('✓ link copied!')).catch(() => flash('link in the URL bar'));
    else flash('link in the URL bar');
  });
}
