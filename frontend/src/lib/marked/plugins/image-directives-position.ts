const VIEWPORT_PADDING = 8
const SIDE_GAP = 12

/**
 * Keeps the image-directives popup on screen even for large images.
 * floating-ui's default flip only alternates between top and bottom, which can
 * both be off-screen when the image is taller than the viewport. Best-effort
 * fallback: if the top/bottom placement doesn't fit, anchor to the image's
 * right, then left; clamp into the viewport as a last resort.
 */
export const bestEffortPositionMiddleware = {
  name: 'imageDirectivesBestEffort',
  fn: (state: {
    x: number
    y: number
    placement: string
    rects: {
      reference: { x: number; y: number; width: number; height: number }
      floating: { width: number; height: number }
    }
  }) => {
    const { x, y, placement, rects } = state
    const { reference, floating } = rects
    const vw = window.innerWidth
    const vh = window.innerHeight

    const fits = (fx: number, fy: number): boolean =>
      fx >= VIEWPORT_PADDING &&
      fy >= VIEWPORT_PADDING &&
      fx + floating.width <= vw - VIEWPORT_PADDING &&
      fy + floating.height <= vh - VIEWPORT_PADDING

    if (fits(x, y)) {
      return { x, y }
    }

    if (placement === 'top' || placement === 'bottom') {
      const alignY = Math.min(
        Math.max(reference.y, VIEWPORT_PADDING),
        vh - floating.height - VIEWPORT_PADDING,
      )

      const rightX = reference.x + reference.width + SIDE_GAP
      if (rightX + floating.width <= vw - VIEWPORT_PADDING) {
        return { x: rightX, y: alignY }
      }

      const leftX = reference.x - floating.width - SIDE_GAP
      if (leftX >= VIEWPORT_PADDING) {
        return { x: leftX, y: alignY }
      }
    }

    return {
      x: Math.min(Math.max(x, VIEWPORT_PADDING), vw - floating.width - VIEWPORT_PADDING),
      y: Math.min(Math.max(y, VIEWPORT_PADDING), vh - floating.height - VIEWPORT_PADDING),
    }
  },
}
