import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'
import { buildLineage, closeFamilyIds } from './lineage'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'

const t = '2026-01-01T00:00:00.000Z'
const root = (id: string): RootRow => ({ id, name: id, canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
const person = (id: string, root_id: string, gender: 'male' | 'female' | null, extra: Partial<PersonRow> = {}): PersonRow => ({
  id, name: id, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
  root_id, gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
  created_at: t, updated_at: t, ...extra,
})
const marry = (a: string, b: string): PartnershipRow => ({ id: `${a}+${b}`, person_a_id: a, person_b_id: b, created_at: t })
const link = (parent: string, child: string): ParentChildRow => ({ id: `${parent}>${child}`, parent_id: parent, child_id: child, created_at: t })

/** Ids of the real (non-reference) nodes in a laid-out branch. */
function realNodeIds(rootId: string, people: PersonRow[], ps: PartnershipRow[], pc: ParentChildRow[], roots = [root(rootId)]) {
  const [lr] = computeLayout(roots.filter(r => r.id === rootId), people, ps, pc)
  return lr.allNodes.filter(n => !n.isReference).map(n => n.person.id)
}
const count = (ids: string[], id: string) => ids.filter(x => x === id).length

describe('computeLayout with children linked to both parents', () => {
  it('places a child of a couple exactly once, under the couple', () => {
    const people = [person('father', 'A', 'male'), person('mother', 'A', 'female'),
      person('kid', 'A', 'male', { mother_id: 'mother' })]
    const ps = [marry('father', 'mother')]
    const pc = [link('father', 'kid'), link('mother', 'kid')]

    const [lr] = computeLayout([root('A')], people, ps, pc)
    const ids = lr.allNodes.filter(n => !n.isReference).map(n => n.person.id)
    expect(count(ids, 'kid')).toBe(1)
    expect(lr.edges).toHaveLength(1)

    const father = lr.allNodes.find(n => n.person.id === 'father')!
    const kid = lr.allNodes.find(n => n.person.id === 'kid')!
    expect(father.children.map(c => c.person.id)).toEqual(['kid'])
    expect(father.partners.map(p => p.person.id)).toEqual(['mother'])
    expect(kid.y).toBeGreaterThan(father.y)
  })

  it('places each child once when a man has two wives', () => {
    const people = [person('f', 'A', 'male'), person('m1', 'A', 'female'), person('m2', 'A', 'female'),
      person('k1', 'A', null, { mother_id: 'm1' }), person('k2', 'A', null, { mother_id: 'm2' })]
    const ps = [marry('f', 'm1'), marry('f', 'm2')]
    const pc = [link('f', 'k1'), link('m1', 'k1'), link('f', 'k2'), link('m2', 'k2')]
    const ids = realNodeIds('A', people, ps, pc)
    expect(count(ids, 'k1')).toBe(1)
    expect(count(ids, 'k2')).toBe(1)
  })

  it('places a child once when both parents are cousins in the same branch', () => {
    // founder → sons s1, s2 → s1's son marries s2's daughter → their child.
    const people = [person('founder', 'A', 'male'), person('s1', 'A', 'male'), person('s2', 'A', 'male'),
      person('cousinM', 'A', 'male'), person('cousinF', 'A', 'female'),
      person('kid', 'A', 'female', { mother_id: 'cousinF' })]
    const ps = [marry('cousinM', 'cousinF')]
    const pc = [link('founder', 's1'), link('founder', 's2'), link('s1', 'cousinM'), link('s2', 'cousinF'),
      link('cousinM', 'kid'), link('cousinF', 'kid')]
    const ids = realNodeIds('A', people, ps, pc)
    for (const id of ['founder', 's1', 's2', 'cousinM', 'cousinF', 'kid']) expect(count(ids, id)).toBe(1)
  })

  it("doesn't draw a married-in mother's children in her birth family's branch", () => {
    // mother belongs to branch B (her parents are there) and married into A.
    const people = [person('bFounder', 'B', 'male'), person('mother', 'B', 'female'),
      person('aFounder', 'A', 'male'), person('kid', 'A', 'male', { mother_id: 'mother' })]
    const ps = [marry('aFounder', 'mother')]
    const pc = [link('bFounder', 'mother'), link('aFounder', 'kid'), link('mother', 'kid')]
    const roots = [root('A'), root('B')]

    expect(count(realNodeIds('A', people, ps, pc, roots), 'kid')).toBe(1)
    expect(count(realNodeIds('B', people, ps, pc, roots), 'kid')).toBe(0)
  })

  it('still places a legacy child linked to only one parent', () => {
    const people = [person('father', 'A', 'male'), person('mother', 'A', 'female'), person('kid', 'A', 'male')]
    const ids = realNodeIds('A', people, [marry('father', 'mother')], [link('father', 'kid')])
    expect(count(ids, 'kid')).toBe(1)
  })
})

describe('buildLineage', () => {
  const people = [person('مصطفى', 'A', 'male'), person('فاطمة', 'A', 'female'),
    person('محمد', 'A', 'male', { mother_id: 'فاطمة' }), person('تهاني', 'A', 'female')]
  const pc = [link('مصطفى', 'محمد'), link('فاطمة', 'محمد'), link('فاطمة', 'تهاني')]
  const lineage = buildLineage(people, pc)

  it('labels a person with their father', () => {
    expect(lineage.label(people[2])).toBe('محمد مصطفى')
  })
  it('uses just the name when the father is unknown', () => {
    expect(lineage.label(people[0])).toBe('مصطفى')
    expect(lineage.label(people[3])).toBe('تهاني') // only her mother is linked
  })
  it('finds the mother via mother_id or a female parent', () => {
    expect(lineage.motherOf('محمد')?.id).toBe('فاطمة')
    expect(lineage.motherOf('تهاني')?.id).toBe('فاطمة')
    expect(lineage.fatherOf('تهاني')).toBeUndefined()
  })
})

describe('closeFamilyIds', () => {
  it('returns parents, children and siblings — the people never offered as a partner', () => {
    const pc = [link('dad', 'me'), link('mum', 'me'), link('dad', 'brother'), link('mum', 'sister'),
      link('me', 'kid'), link('uncle', 'cousin')]
    expect([...closeFamilyIds('me', pc)].sort()).toEqual(['brother', 'dad', 'kid', 'mum', 'sister'])
  })
})
