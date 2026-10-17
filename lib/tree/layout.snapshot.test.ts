import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'
// The made-up 41-person family the e2e checks use.
import { makeSeed } from '../../e2e/seed.mjs'
import type { LayoutedRoot } from '@/types'

/** Every node's position and kind, one line each — a full picture of a layout. */
function describeLayout(lr: LayoutedRoot) {
  return {
    nodes: lr.allNodes.map(n =>
      `${n.person.name} ${n.person.id.slice(-4)} @${n.x},${n.y}${n.isReference ? ' ref' : ''}${n.truncated ? ' more' : ''}`),
    edges: lr.edges.map(e => e.id.replace(/0{8}-0000-4000-8000-0{8}/g, '')),
    partnershipEdges: lr.partnershipEdges.length,
  }
}

// Guards the full-branch tree: refactors of the layout engine (e.g. for
// saved views) must not move a single node in the existing tree.
describe('full-branch tree layout (unchanged)', () => {
  const seed = makeSeed()

  it('lays out the whole branch exactly as before', () => {
    const [lr] = computeLayout(seed.roots, seed.people, seed.partnerships, seed.parent_child)
    expect(describeLayout(lr)).toMatchSnapshot()
  })

  it('lays out the default 3-generation view exactly as before', () => {
    const [lr] = computeLayout(seed.roots, seed.people, seed.partnerships, seed.parent_child, 3)
    expect(describeLayout(lr)).toMatchSnapshot()
  })
})
