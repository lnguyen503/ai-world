// In-browser neural text-to-speech via Kokoro (an ~82M open TTS model) running through
// transformers.js. The model weights download once from the Hugging Face CDN (cached by the browser
// afterwards) and synthesis runs locally — on WebGPU if available (great on a discrete GPU), else
// WASM. No server, no API key. kokoro-js is loaded with a dynamic import() so it stays out of the
// main bundle until the user actually turns the neural voice on.

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** Minimal structural view of the bits of KokoroTTS we use (kept loose so we needn't bundle types). */
interface KokoroTTSLike { generate(text: string, opts: { voice: string }): Promise<{ toBlob(): Blob }>; }

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) return 'webgpu';
  } catch { /* WebGPU unavailable */ }
  return 'wasm';
}

export class KokoroVoice {
  private tts: KokoroTTSLike | null = null;
  private loadP: Promise<KokoroTTSLike> | null = null;
  ready = false;
  onStatus: (msg: string) => void = () => {};

  /** Lazily download + initialise the model. Idempotent — repeated calls share one load. */
  load(): Promise<KokoroTTSLike> {
    if (this.loadP) return this.loadP;
    this.loadP = (async () => {
      this.onStatus('downloading neural voice… (one-time)');
      const { KokoroTTS } = (await import('kokoro-js')) as unknown as {
        KokoroTTS: { from_pretrained(id: string, o: Record<string, unknown>): Promise<KokoroTTSLike> };
      };
      const device = await pickDevice();
      const dtype = device === 'webgpu' ? 'fp32' : 'q8'; // best quality on GPU; smaller/faster on WASM
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype, device,
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
          if (p?.status === 'progress' && typeof p.progress === 'number' && /\.onnx/.test(p.file ?? '')) {
            this.onStatus(`downloading neural voice… ${Math.round(p.progress)}%`);
          }
        },
      });
      this.tts = tts; this.ready = true;
      this.onStatus(`neural voice ready (${device})`);
      setTimeout(() => this.onStatus(''), 2500);
      return tts;
    })();
    this.loadP.catch(() => { this.loadP = null; this.onStatus('neural voice failed — using system voice'); });
    return this.loadP;
  }

  /** Synthesize one line to a playable WAV blob (loading the model first if needed). */
  async synthBlob(text: string, voice: string): Promise<Blob> {
    const tts = this.tts ?? (await this.load());
    const audio = await tts.generate(text, { voice });
    return audio.toBlob();
  }
}
