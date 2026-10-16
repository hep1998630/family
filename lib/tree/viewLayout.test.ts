import { describe, expect, it } from 'vitest'
import { computeLayout, computeViewLayout } from './layout'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'
import type { TreeNode } from '@/types'

const t = '2026-01-01T00:00:00.000Z'
const root = (id: string): RootRow => ({ id, name: id, canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
const person = (id: string, gender: 'male' | 'female', extra: Partial<PersonRow> = {}): PersonRow => ({
  id, name: id, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
  root_id: 'A', gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
  created_at: t, updated_at: t, ...extra,
})
const marry = (a: string, b: string): PartnershipRow => ({ id: `${a}+${b}`, person_a_id: a, person_b_id: b, created_at: t })
const link = (parent: string, child: string): ParentChildRow => ({ id: `${parent}>${child}`, parent_id: parent, child_id: child, created_at: t })

// grandpa
//  └─ M ═ W1, W2
//      ├─ K1 (M+W1) ═ K1a, K1b
//      │    ├─ GK1 (K1+K1a) ─ GGK
//      │    └─ GK2 (K1+K1b)
//      ├─ K2 (M, mother_id W1 — no parent_child row for W1)
//      ├─ K3 (M+W2)
//      └─ L  (legacy: only M linked, no mother recorded)
//  └─ U (M's brother) ─ UK
const people = [
  person('grandpa', 'male'), person('M', 'male'), person('U', 'male'), person('UK', 'male'),
  person('W1', 'female'), person('W2', 'female'),
  person('K1', 'male', { mother_id: 'W1' }), person('K2', 'female', { mother_id: 'W1' }),
  person('K3', 'male', { mother_id: 'W2' }), person('L', 'male'),
  person('K1a', 'female'), person('K1b', 'female'),
  person('GK1', 'male', { mother_id: 'K1a' }), person('GK2', 'female', { mother_id: 'K1b' }),
  person('GGK', 'female'),
]
const partnerships = [marry('M', 'W1'), marry('W2', 'M'), marry('K1', 'K1a'), marry('K1b', 'K1')]
const parentChild = [
  link('grandpa', 'M'), link('grandpa', 'U'), link('U', 'UK'),
  link('M', 'K1'), link('W1', 'K1'),
  link('M', 'K2'),
  link('M', 'K3'), link('W2', 'K3'),
  link('M', 'L'),
  link('K1', 'GK1'), link('K1a', 'GK1'), link('K1', 'GK2'), link('K1b', 'GK2'),
  link('GK1', 'GGK'),
]
const roots = [root('A')]

function view(topId: string, opts: Parameters<typeof computeViewLayout>[5] = {}, ps = people, pc = parentChild) {
  const v = computeViewLayout(topId, roots, ps, partnerships, pc, opts)
  if (!v) throw new Error('no layout')
  return v
}
const ids = (nodes: TreeNode[]) => nodes.map(n => n.person.id)
const real = (v: ReturnType<typeof view>) => ids(v.layout.allNodes.filter(n => !n.isReference)).sort()
const find = (v: ReturnType<typeof view>, id: string) => v.layout.allNodes.find(n => n.person.id === id)!

describe('computeViewLayout — depth', () => {
  it('«الأبناء فقط» (1): the top person, partners and children (with their spouses) only', () => {
    const v = view('M', { maxDepth: 1 })
    expect(real(v)).toEqual(['K1', 'K1a', 'K1b', 'K2', 'K3', 'L', 'M', 'W1', 'W2'])
    expect(v.layout.rootNode.person.id).toBe('M')
    // K1's own family is cut off (not shown as a "show more" in a saved view, but flagged)
    expect(find(v, 'K1').truncated).toBe(true)
  })

  it('«حتى الأحفاد» (2): grandchildren with all their partners', () => {
    const v = view('M', { maxDepth: 2 })
    expect(real(v)).toEqual(['GK1', 'GK2', 'K1', 'K1a', 'K1b', 'K2', 'K3', 'L', 'M', 'W1', 'W2'])
    expect(ids(find(v, 'K1').partners)).toEqual(['K1a', 'K1b'])
    expect(find(v, 'GK1').truncated).toBe(true)
  })

  it('«كل الذرية» (null): every descendant, and nobody above or beside the top person', () => {
    const v = view('M', { maxDepth: null })
    expect(real(v)).toContain('GGK')
    for (const outside of ['grandpa', 'U', 'UK']) expect(real(v)).not.toContain(outside)
    expect(v.layout.allNodes.some(n => n.truncated)).toBe(false)
    expect(v.ambiguousChildIds).toEqual([])
  })

  it('places everyone exactly once', () => {
    const all = real(view('M'))
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('computeViewLayout — partner filter (top person only)', () => {
  it('first wife: only her beside him, only their children; the legacy child is reported', () => {
    const v = view('M', { partnerFilterId: 'W1' })
    expect(ids(v.layout.rootNode.partners)).toEqual(['W1'])
    // K2 counts as hers through mother_id alone
    expect(ids(v.layout.rootNode.children).sort()).toEqual(['K1', 'K2'])
    expect(real(v)).not.toContain('W2')
    expect(real(v)).not.toContain('K3')
    expect(real(v)).not.toContain('L')
    expect(v.ambiguousChildIds).toEqual(['L'])
  })

  it('below the top level everyone keeps all their partners', () => {
    const v = view('M', { partnerFilterId: 'W1' })
    expect(ids(find(v, 'K1').partners)).toEqual(['K1a', 'K1b'])
    expect(ids(find(v, 'K1').children).sort()).toEqual(['GK1', 'GK2'])
    expect(real(v)).toContain('GGK')
  })

  it('second wife: only her children; the same legacy child is still reported', () => {
    const v = view('M', { partnerFilterId: 'W2' })
    expect(ids(v.layout.rootNode.partners)).toEqual(['W2'])
    expect(ids(v.layout.rootNode.children)).toEqual(['K3'])
    expect(v.ambiguousChildIds).toEqual(['L'])
  })

  it('combines with a depth cap', () => {
    const v = view('M', { partnerFilterId: 'W1', maxDepth: 1 })
    expect(real(v)).toEqual(['K1', 'K1a', 'K1b', 'K2', 'M', 'W1'])
    expect(real(v)).not.toContain('GK1')
  })

  it('works from the mother’s side too', () => {
    const v = view('W1', { partnerFilterId: 'M' })
    expect(ids(v.layout.rootNode.children).sort()).toEqual(['K1', 'K2'])
    // L has only his father recorded, so he might be hers: reported, not shown
    expect(v.ambiguousChildIds).toEqual(['L'])
  })
})

describe('computeViewLayout — starting anywhere', () => {
  it('starts at a woman who married in from another branch and still shows her children', () => {
    const ps = [...people, person('B-founder', 'male', { root_id: 'B' }), person('bride', 'female', { root_id: 'B' }),
      person('baby', 'male', { mother_id: 'bride' })]
    const pc = [...parentChild, link('B-founder', 'bride'), link('UK', 'baby'), link('bride', 'baby')]
    const v = computeViewLayout('bride', [root('A'), root('B')], ps, [...partnerships, marry('UK', 'bride')], pc, {})!
    expect(v.layout.root.id).toBe('B')
    expect(ids(v.layout.rootNode.children)).toEqual(['baby'])
    // her husband lives in another branch: shown as a link to his own place
    expect(v.layout.rootNode.partners[0].isReference).toBe(true)
  })

  it('shows a wife as a normal card when her own parents are outside the view', () => {
    // W1 is grandpa's daughter-in-law AND U's daughter (a cousin marriage).
    const pc = [...parentChild, link('U', 'W1')]
    const full = computeLayout(roots, people, partnerships, pc)[0]
    expect(full.allNodes.find(n => n.person.id === 'W1' && n.ownerPersonId === 'M')?.isReference).toBe(true)

    const v = view('M', {}, people, pc)
    expect(find(v, 'W1').isReference).toBeFalsy()
  })

  it('returns null for an unknown person', () => {
    expect(computeViewLayout('nobody', roots, people, partnerships, parentChild)).toBeNull()
  })
})
