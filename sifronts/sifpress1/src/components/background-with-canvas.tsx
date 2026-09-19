import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Environment the host hands to a scene so it can lay itself out. */
export interface SceneEnv {
  /** Canvas CSS size in px (the ctx transform already applies `dpr`). */
  width: number;
  height: number;
  /** devicePixelRatio actually used (capped by `maxDpr`). */
  dpr: number;
  dark: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
}

/** A pluggable background renderer. Implement it to swap the canvas drawing. */
export interface CanvasScene {
  /** Reconfigure from the latest env: mount, resize, theme, media change. */
  update(env: SceneEnv): void;
  /** Draw one frame. `time` is seconds since the animation origin. */
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  /** Optional teardown when the canvas unmounts. */
  destroy?(): void;
}

export interface BackgroundWithCanvasProps {
  scene: CanvasScene;
  className?: string;
  maxDpr?: number;
}

/**
 * Owns the canvas element and its full lifecycle — DPR/backing-store sizing,
 * resize, requestAnimationFrame, reduced-motion/transparency and theme
 * observation — and delegates all pixels to the supplied `scene`. Scenes never
 * touch `window`/`document`, so they can be swapped without touching this code.
 */
export function BackgroundWithCanvas({ scene, className, maxDpr = 2 }: BackgroundWithCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');

    let raf = 0;
    let disposed = false;

    const readEnv = (): SceneEnv => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
      dark: document.documentElement.classList.contains('dark'),
      reducedMotion: motionQuery.matches,
      reducedTransparency: transparencyQuery.matches,
    });

    let env = readEnv();
    let sized = false;

    const applySize = (): void => {
      canvas.width = Math.round(env.width * env.dpr);
      canvas.height = Math.round(env.height * env.dpr);
      canvas.style.width = `${env.width}px`;
      canvas.style.height = `${env.height}px`;
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    };

    const refresh = (): void => {
      const next = readEnv();
      // Assigning canvas.width/height clears the canvas, so only do it when the
      // size actually changed (a theme/media change must not wipe a frame).
      const sizeChanged =
        !sized || next.width !== env.width || next.height !== env.height || next.dpr !== env.dpr;

      env = next;

      if (sizeChanged) {
        applySize();
        sized = true;
      }

      scene.update(env);
      // Immediate paint so a resized/frozen canvas is correct before the next frame.
      scene.draw(ctx, performance.now() / 1000);
    };

    const frame = (t: number): void => {
      scene.draw(ctx, t / 1000);

      if (!disposed && !env.reducedMotion) {
        raf = requestAnimationFrame(frame);
      }
    };

    const themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', refresh);
    motionQuery.addEventListener('change', refresh);
    transparencyQuery.addEventListener('change', refresh);

    refresh();
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener('resize', refresh);
      motionQuery.removeEventListener('change', refresh);
      transparencyQuery.removeEventListener('change', refresh);
      scene.destroy?.();
    };
  }, [scene, maxDpr]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 z-0', className)}
    />
  );
}
