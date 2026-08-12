import type { Root, Image } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Obsidian-style image directives in the alt text:
 *
 *   ![Alt|640](url)          width only
 *   ![Alt|400x240](url)      width x height
 *   ![Alt|x200](url)         height only
 *   ![Alt|center](url)       centered block image
 *   ![Alt|float-left|240](url)  float + size, in any order
 *
 * Directives are pipe-separated; unknown segments stay in the caption.
 */

const SIZE_PATTERN = /^(\d*)x(\d*)$|^(\d+)$/

const POSITION_CLASS: Record<string, string> = {
  left: 'md-img-float-left',
  right: 'md-img-float-right',
  center: 'md-img-center',
  'float-left': 'md-img-float-left',
  'float-right': 'md-img-float-right',
}

export const remarkImageDirectives: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'image', (node: Image) => {
      const parts = (node.alt ?? '').split('|')
      const caption: string[] = []
      let width: number | undefined
      let height: number | undefined
      let position: string | undefined

      for (const part of parts) {
        const size = SIZE_PATTERN.exec(part)

        if (size) {
          if (size[3] !== undefined) {
            width = Number(size[3])
          } else {
            if (size[1] !== '') width = Number(size[1])
            if (size[2] !== '') height = Number(size[2])
          }
          continue
        }

        const positionClass = POSITION_CLASS[part]

        if (positionClass !== undefined) {
          position = positionClass
          continue
        }

        caption.push(part)
      }

      if (width === undefined && height === undefined && position === undefined) {
        return
      }

      const hProperties: Record<string, unknown> = {
        ...((node.data?.hProperties as Record<string, unknown> | undefined) ?? {}),
      }

      if (width !== undefined) hProperties.width = width
      if (height !== undefined) hProperties.height = height
      if (position !== undefined) hProperties.className = [position]

      node.alt = caption.length > 0 ? caption.join('|') : undefined
      node.data = { ...node.data, hProperties } as Image['data']
    })
  }
}
