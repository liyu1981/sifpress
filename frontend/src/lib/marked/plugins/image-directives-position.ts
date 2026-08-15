const VIEWPORT_PADDING = 8
const GAP = 12

/**
 * Positions the image/video popup over the selected media. The popup is
 * centered horizontally on the media and placed above it (top-center); if
 * there isn't room above, it goes below (bottom-center); if neither fits
 * (e.g. the media is taller than the viewport), it anchors to the media's
 * right, then left; the final fallback clamps it into the viewport.
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
    const { rects } = state
    const { reference, floating } = rects
    const vw = window.innerWidth
    const vh = window.innerHeight

    const fits = (fx: number, fy: number): boolean =>
      fx >= VIEWPORT_PADDING &&
      fy >= VIEWPORT_PADDING &&
      fx + floating.width <= vw - VIEWPORT_PADDING &&
      fy + floating.height <= vh - VIEWPORT_PADDING

    const centerX = Math.min(
      Math.max(
        reference.x + reference.width / 2 - floating.width / 2,
        VIEWPORT_PADDING,
      ),
      vw - floating.width - VIEWPORT_PADDING,
    )

    const aboveY = reference.y - floating.height - GAP
    const belowY = reference.y + reference.height + GAP

    if (fits(centerX, aboveY)) {
      return { x: centerX, y: aboveY }
    }

    if (fits(centerX, belowY)) {
      return { x: centerX, y: belowY }
    }

    const sideY = Math.min(
      Math.max(reference.y, VIEWPORT_PADDING),
      vh - floating.height - VIEWPORT_PADDING,
    )

    const rightX = reference.x + reference.width + GAP
    if (rightX + floating.width <= vw - VIEWPORT_PADDING) {
      return { x: rightX, y: sideY }
    }

    const leftX = reference.x - floating.width - GAP
    if (leftX >= VIEWPORT_PADDING) {
      return { x: leftX, y: sideY }
    }

    return {
      x: centerX,
      y: Math.min(Math.max(belowY, VIEWPORT_PADDING), vh - floating.height - VIEWPORT_PADDING),
    }
  },
}
