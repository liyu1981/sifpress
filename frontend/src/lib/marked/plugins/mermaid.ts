import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { $inputRule, $nodeSchema, $remark, $view } from '@milkdown/kit/utils'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import { nextDiagramId, registerDiagramRerender, renderMermaidChart } from '../mermaid'

const id = 'diagram'

const remarkMermaid = () => (tree: unknown) => {
  visit(tree as Root, 'code', (node, index, parent) => {
    if (node.lang === 'mermaid' && parent !== undefined && index !== null && index !== undefined) {
      parent.children.splice(index, 1, { type: id, value: node.value } as never)
    }
  })
}

export const remarkMermaidPlugin = $remark('remarkMermaid', () => remarkMermaid)

export const diagramSchema = $nodeSchema(id, () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: '' },
    identity: { default: '' },
  },
  parseDOM: [
    {
      tag: `div[data-type="${id}"]`,
      preserveWhitespace: 'full',
      getAttrs: (dom) => ({
        value: dom.getAttribute('data-value') ?? '',
        identity: dom.getAttribute('data-id') ?? '',
      }),
    },
  ],
  toDOM: (node) => {
    const div = document.createElement('div')
    div.dataset.type = id
    div.dataset.value = node.attrs.value ?? ''
    div.dataset.id = node.attrs.identity ?? ''
    div.textContent = node.attrs.value ?? ''
    return div
  },
  parseMarkdown: {
    match: (node) => node.type === id,
    runner: (state, node, type) => {
      state.addNode(type, {
        value: node.value ?? '',
        identity: nextDiagramId(),
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === id,
    runner: (state, node) => {
      state.addNode('code', undefined, node.attrs.value ?? '', {
        lang: 'mermaid',
      })
    },
  },
}))

function createDiagramView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
) {
  const root = document.createElement('div')
  root.className = 'milkdown-diagram'

  const body = document.createElement('div')
  body.className = 'milkdown-diagram-body'
  root.appendChild(body)

  const actions = document.createElement('div')
  actions.className = 'milkdown-diagram-actions'
  root.appendChild(actions)

  const editButton = document.createElement('button')
  editButton.type = 'button'
  editButton.className = 'milkdown-diagram-edit'
  editButton.textContent = '✎'
  editButton.title = 'Edit diagram'
  actions.appendChild(editButton)

  let chart = (node.attrs.value as string) ?? ''
  let editing = false
  let cancelled = false

  const renderSvg = (): void => {
    body.textContent = ''
    const loading = document.createElement('div')
    loading.className = 'milkdown-diagram-loading'
    loading.textContent = 'Loading diagram…'
    body.appendChild(loading)

    const renderId = (node.attrs.identity as string) || nextDiagramId()
    renderMermaidChart(chart, renderId)
      .then((svg) => {
        if (!cancelled) {
          body.innerHTML = svg
        }
      })
      .catch(() => {
        if (!cancelled) {
          renderError()
        }
      })
  }

  const renderError = (): void => {
    body.textContent = ''
    const pre = document.createElement('pre')
    pre.className = 'milkdown-diagram-error'
    pre.textContent = chart
    body.appendChild(pre)
  }

  const renderEmpty = (): void => {
    body.textContent = ''
    const hint = document.createElement('div')
    hint.className = 'milkdown-diagram-empty'
    hint.textContent = 'Mermaid diagram'
    body.appendChild(hint)
  }

  const startEdit = (): void => {
    editing = true
    actions.style.display = 'none'
    body.textContent = ''

    const textarea = document.createElement('textarea')
    textarea.className = 'milkdown-diagram-input'
    textarea.value = chart
    textarea.spellcheck = false
    body.appendChild(textarea)
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    const commit = (): void => {
      if (!editing) {
        return
      }
      editing = false
      actions.style.display = ''
      const next = textarea.value
      try {
        const pos = getPos()
        if (pos === undefined) {
          return
        }
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            value: next,
          }),
        )
      } catch {
        // node no longer in the document
      }
      setChart(next)
    }

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        commit()
      }
    })
    textarea.addEventListener('blur', commit)
  }

  editButton.addEventListener('click', startEdit)

  const setChart = (next: string): void => {
    chart = next
    if (editing) {
      return
    }
    if (chart.trim() === '') {
      renderEmpty()
    } else {
      renderSvg()
    }
  }

  const unregister = registerDiagramRerender(() => {
    if (!editing) {
      setChart(chart)
    }
  })

  setChart(chart)

  return {
    dom: root,
    update(updatedNode: Node) {
      if (updatedNode.type.name !== id) {
        return false
      }
      if (updatedNode.attrs.value === node.attrs.value) {
        return true
      }
      node = updatedNode
      setChart((updatedNode.attrs.value as string) ?? '')
      return true
    },
    stopEvent(event: Event) {
      const target = event.target as HTMLElement
      return (
        root.contains(target) &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')
      )
    },
    destroy() {
      cancelled = true
      unregister()
      root.remove()
    },
  }
}

export const diagramNodeView = $view(diagramSchema.node, () => createDiagramView)

export const insertDiagramInputRule = $inputRule((ctx) => {
  return new InputRule(/^```mermaid$/, (state, _match, start, end) => {
    const nodeType = diagramSchema.type(ctx)
    const $start = state.doc.resolve(start)
    if (
      !$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)
    ) {
      return null
    }
    return state.tr.delete(start, end).setBlockType(start, start, nodeType, {
      value: '',
      identity: nextDiagramId(),
    })
  })
})
