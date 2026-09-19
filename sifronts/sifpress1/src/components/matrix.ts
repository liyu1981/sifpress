import type { CanvasScene, SceneEnv } from '@/components/background-with-canvas';

/**
 * Matrix-rain background, ported from a WordPress custom script.
 *
 * Each column is a falling head of random glyphs (kana + Latin + punctuation).
 * One "neo" column is highlighted and travels upward. The animation starts in a
 * fast phase (~30ms) so the screen fills quickly, then drops to a slow cadence
 * (~130ms) the first time a column wraps.
 *
 * Colours follow the theme: light = grey backdrop with near-black glyphs (the
 * sifront `--background` / `--foreground`), dark = black backdrop with light
 * glyphs. Pure: it only reads the {@link SceneEnv} the host hands it.
 */

const CHAR_RANGES: [number, number][] = [
  [0x3041, 0x30ff],
  [0x0021, 0x007a],
  [0x00bc, 0x02af],
];

const FONT_SIZE = 20;
const FAST_INTERVAL = 0.03;
const SLOW_INTERVAL = 0.13;

interface MatrixPalette {
  bg: [number, number, number];
  fadeAlpha: number;
  text: string;
  neo: string;
}

const LIGHT: MatrixPalette = {
  bg: [190, 190, 190],
  fadeAlpha: 0.15,
  text: '#0a0a0a',
  neo: '#c81e1e',
};

const DARK: MatrixPalette = {
  bg: [0, 0, 0],
  fadeAlpha: 0.15,
  text: '#39d353',
  neo: '#ffd700',
};

function paletteFor(dark: boolean): MatrixPalette {
  return dark ? DARK : LIGHT;
}

function backgroundStyle(palette: MatrixPalette): string {
  const [r, g, b] = palette.bg;
  return `rgb(${r}, ${g}, ${b})`;
}

function fadeStyle(palette: MatrixPalette, reducedTransparency: boolean): string {
  const [r, g, b] = palette.bg;
  const alpha = reducedTransparency ? Math.min(1, palette.fadeAlpha * 3) : palette.fadeAlpha;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function random(from: number, to: number): number {
  return Math.trunc(Math.random() * (to - from + 1) + from);
}

function getRandomChar(): string {
  const range = CHAR_RANGES[random(0, CHAR_RANGES.length - 1)];
  return String.fromCharCode(random(range[0], range[1]));
}

export class MatrixScene implements CanvasScene {
  #env: SceneEnv | null = null;
  #columns = 0;
  #drops: number[] = [];
  #fast = true;
  #maxRows = -1;
  #neoIndex = -1;
  #nextDrawAt = 0;
  #reset = false;
  #paletteSignature = '';

  update(env: SceneEnv): void {
    this.#env = env;
    // The host only calls this on a real change (resize/theme/media); make sure
    // the following immediate paint runs regardless of the frame throttle.
    this.#nextDrawAt = 0;

    const paletteSignature = `${env.dark}:${env.reducedTransparency}`;

    if (paletteSignature !== this.#paletteSignature) {
      this.#paletteSignature = paletteSignature;
      this.#reset = true; // repaint the backdrop in the new theme
    }

    const columns = Math.max(1, Math.floor(env.width / FONT_SIZE));

    if (columns !== this.#columns) {
      this.#columns = columns;
      this.#drops = Array.from({ length: columns }, () => 1);
      this.#fast = true;
      this.#maxRows = -1;
      this.#neoIndex = -1;
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const env = this.#env;

    if (env === null || time < this.#nextDrawAt) {
      return;
    }

    const palette = paletteFor(env.dark);
    this.#nextDrawAt = time + (this.#fast ? FAST_INTERVAL : SLOW_INTERVAL);

    if (this.#reset) {
      ctx.fillStyle = backgroundStyle(palette);
      ctx.fillRect(0, 0, env.width, env.height);
      this.#reset = false;
    }

    ctx.font = '18px Helvetica';
    ctx.fillStyle = fadeStyle(palette, env.reducedTransparency);
    ctx.fillRect(0, 0, env.width, env.height);

    for (let i = 0; i < this.#drops.length; i++) {
      const text = getRandomChar();
      const x = i * FONT_SIZE;
      const y = this.#drops[i] * FONT_SIZE;

      if (i !== this.#neoIndex) {
        ctx.fillStyle = palette.text;
        ctx.fillText(text, x, y);
        this.#drops[i] += 1;

        if (this.#drops[i] * FONT_SIZE > env.height && Math.random() > 0.95) {
          if (this.#fast) {
            // First wrap: switch off the fast phase and seed the neo column.
            this.#fast = false;
            this.#maxRows = this.#drops[i];
            this.#neoIndex = random(0, this.#drops.length - 1);
          }

          this.#drops[i] = random(0, (this.#maxRows * 2) / 3);

          if (this.#neoIndex < 0 && Math.random() > 0.62) {
            this.#neoIndex = random(0, this.#drops.length - 1);
          }
        }
      } else {
        ctx.fillStyle = palette.neo;
        ctx.fillText(text, x, y);
        this.#drops[i] -= 1;

        if (this.#drops[i] < 3) {
          // The reverse column stops near the top, then restarts as a faller.
          this.#neoIndex = -1;
          this.#drops[i] = this.#maxRows;
        }
      }
    }
  }
}

/** Matrix-rain scene instance; swap for another `CanvasScene` to change the look. */
export const matrixScene = new MatrixScene();
