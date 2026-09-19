import type { CanvasScene, SceneEnv } from '@/components/background-with-canvas';

const HUES = [200, 260, 320, 170, 30, 355];

interface Blob {
  rx: number;
  ry: number;
  radius: number;
  hue: number;
  sat: number;
  light: number;
  alpha: number;
  vx: number;
  vy: number;
  ampX: number;
  ampY: number;
  phase: number;
  freq: number;
}

interface Palette {
  sat: number;
  light: number;
  alpha: number;
  count: number;
}

const LIGHT: Palette = { sat: 95, light: 74, alpha: 0.34, count: 12 };
const DARK: Palette = { sat: 95, light: 56, alpha: 0.32, count: 12 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paletteFor(dark: boolean, reducedTransparency: boolean): Palette {
  const base = dark ? DARK : LIGHT;

  return reducedTransparency ? { ...base, alpha: base.alpha * 0.55 } : base;
}

function makeBlobs(palette: Palette): Blob[] {
  return Array.from({ length: palette.count }, () => {
    const hue = HUES[Math.floor(Math.random() * HUES.length)] + (Math.random() * 24 - 12);

    return {
      rx: Math.random(),
      ry: Math.random(),
      radius: 0.07 + Math.random() * 0.18,
      hue: ((hue % 360) + 360) % 360,
      sat: clamp(palette.sat + (Math.random() * 12 - 6), 0, 100),
      light: clamp(palette.light + (Math.random() * 10 - 5), 0, 100),
      alpha: Math.max(0.08, palette.alpha + (Math.random() * 0.12 - 0.06)),
      vx: (Math.random() * 2 - 1) * 16,
      vy: (Math.random() * 2 - 1) * 16,
      ampX: 20 + Math.random() * 50,
      ampY: 20 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      freq: 0.04 + Math.random() * 0.1,
    };
  });
}

function wrap(value: number, min: number, max: number): number {
  const range = max - min;

  return ((((value - min) % range) + range) % range) + min;
}

/**
 * The drifting color-blob background. Pure: it only reads the {@link SceneEnv}
 * handed in by the host, so it can be unit-tested or swapped for another scene.
 */
export class AmbientScene implements CanvasScene {
  #env: SceneEnv | null = null;
  #blobs: Blob[] = [];
  #signature = '';

  update(env: SceneEnv): void {
    this.#env = env;

    // Only the theme/reduced-transparency change the blob set; resizes just need
    // the new dimensions, which `draw` reads from `env`.
    const signature = `${env.dark}:${env.reducedTransparency}`;

    if (signature === this.#signature) {
      return;
    }

    this.#signature = signature;
    this.#blobs = makeBlobs(paletteFor(env.dark, env.reducedTransparency));
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const env = this.#env;

    if (env === null) {
      return;
    }

    ctx.clearRect(0, 0, env.width, env.height);
    ctx.globalCompositeOperation = 'lighter';

    const base = Math.min(env.width, env.height);

    for (const blob of this.#blobs) {
      const x = wrap(
        blob.rx * env.width + blob.ampX * Math.sin(time * blob.freq + blob.phase) + blob.vx * time,
        -200,
        env.width + 200,
      );
      const y = wrap(
        blob.ry * env.height +
          blob.ampY * Math.cos(time * blob.freq * 0.8 + blob.phase * 1.3) +
          blob.vy * time,
        -200,
        env.height + 200,
      );
      const radius = blob.radius * base * (1 + 0.08 * Math.sin(time * 0.3 + blob.phase));
      const hue = (blob.hue + time * 1.2) % 360;
      const core = `hsla(${hue} ${blob.sat}% ${blob.light}% / ${blob.alpha})`;
      const edge = `hsla(${hue} ${blob.sat}% ${blob.light}% / 0)`;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, core);
      gradient.addColorStop(0.6, core);
      gradient.addColorStop(1, edge);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}

/** The default scene; swap this for another `CanvasScene` to change the look. */
export const ambientScene = new AmbientScene();
