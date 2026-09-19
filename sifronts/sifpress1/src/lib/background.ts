import { ambientScene } from '@/components/ambient';
import type { CanvasScene, SceneEnv } from '@/components/background-with-canvas';
import { matrixScene } from '@/components/matrix';

/**
 * Background scene registry. The KV key `sifpress1.background.kind` selects an
 * entry by id — KV never carries code (see plan/sifront-background-canvas-plan.md
 * §7.4), only a name that maps to a scene shipped in this bundle.
 */

export interface BackgroundSelection {
  scene: CanvasScene;
  /**
   * Optional readability cover rendered between the canvas and the page
   * content. Busy scenes (matrix) need it; subtle ones (ambient) don't.
   */
  maskClassName?: string;
}

class EmptyScene implements CanvasScene {
  #env: SceneEnv | null = null;

  update(env: SceneEnv): void {
    this.#env = env;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const env = this.#env;

    if (env !== null) {
      ctx.clearRect(0, 0, env.width, env.height);
    }
  }
}

const MATRIX_MASK = 'pointer-events-none fixed inset-0 z-[1] bg-background/55';

const BACKGROUNDS: Record<string, BackgroundSelection> = {
  ambient: { scene: ambientScene },
  matrix: { scene: matrixScene, maskClassName: MATRIX_MASK },
  none: { scene: new EmptyScene() },
};

/** Resolve a `sifpress1.background.kind` value; unknown ids fall back to ambient. */
export function createBackground(kind: string): BackgroundSelection {
  return BACKGROUNDS[kind] ?? BACKGROUNDS.ambient;
}
