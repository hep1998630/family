import { describe, expect, it } from 'vitest'
import {
  computeDepthFromRoot, computeLayout, findRootPerson,
  NODE_HEIGHT, NODE_WIDTH, SHOW_MORE_GAP, SHOW_MORE_HEIGHT,
} from './layout'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'

let clock = 0
const at = () => `2026-01-01T00:00:${String(clock++).padStart(2, '0')}.000+00:00`
const root = (id: string): RootRow => ({ id, name: id, canvas_x: 0, canvas_y: 0, created_at: at(), updated_at: at() })
const person = (id: string, root_id: string, gender: 'male' | 'female' | null = 'male', extra: Partial<PersonRow> = {}): PersonRow => {
  const t = at()
  return {
    id, name: id, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
    root_id, gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
    created_at: t, updated_at: t, ...extra,
  }
}
const marry = (a: string, b: string): PartnershipRow => ({ id: `${a}+${b}`, person_a_id: a, person_b_id: b, created_at: at() })
const link = (parent: string, child: string): ParentChildRow => ({ id: `${parent}>${child}`, parent_id: parent, child_id: child, created_at: at() })

describe('a founder later linked to a father in another branch', () => {
  // Root B: G. Root A: F2 (G's son, but founder of A), wives Wa and Wb, kids k1 and k2.
  const A = root('A'), B = root('B')
  const G = person('G', 'B')
  const F2 = person('F2', 'A')
  const Wa = person('Wa', 'A', 'female'), Wb = person('Wb', 'A', 'female')
  const k1 = person('k1', 'A', 'male', { mother_id: 'Wa' }), k2 = person('k2', 'A', 'female', { mother_id: 'Wb' })
  const people = [G, F2, Wa, Wb, k1, k2]
  const partnerships = [marry('F2', 'Wa'), marry('F2', 'Wb')]
  const parentChild = [link('G', 'F2'), link('F2', 'k1'), link('Wa', 'k1'), link('F2', 'k2'), link('Wb', 'k2')]

  it('stays the founder of his branch', () => {
    expect(findRootPerson('A', people, parentChild)?.id).toBe('F2')
  })

  it('and his branch is drawn in full: him, both wives, both children', () => {
    const [layout] = computeLayout([A], people, partnerships, parentChild)
    const drawn = layout.allNodes.filter(n => !n.isReference).map(n => n.person.id).sort()
    expect(drawn).toEqual(['F2', 'Wa', 'Wb', 'k1', 'k2'])
  })

  it("G's branch doesn't pull him in", () => {
    const [layout] = computeLayout([B], people, partnerships, parentChild)
    expect(layout.allNodes.map(n => n.person.id)).toEqual(['G'])
  })
})

describe('computeDepthFromRoot follows the parent in the same branch', () => {
  // Root A: founder → son → grandson → great-grandson → great-great-grandchild.
  // Each generation's mother married in from root B, where she has parents.
  const people: PersonRow[] = [person('M0', 'B', 'male'), person('founder', 'A')]
  const partnerships: PartnershipRow[] = []
  const parentChild: ParentChildRow[] = []
  let father = 'founder'
  for (const gen of ['son', 'grandson', 'great', 'great2']) {
    const mother = `${gen}-mum`
    people.push(person(mother, 'B', 'female'), person(gen, 'A'))
    parentChild.push(link('M0', mother)) // her own father, in her branch
    partnerships.push(marry(father, mother))
    // Mother's link listed LAST — the old code kept only the last parent row.
    parentChild.push(link(father, gen), link(mother, gen))
    father = gen
  }

  it('a great-great-grandchild whose mothers married in is at depth 4', () => {
    expect(computeDepthFromRoot('great2', people, parentChild)).toBe(4)
    expect(computeDepthFromRoot('great', people, parentChild)).toBe(3)
    expect(computeDepthFromRoot('founder', people, parentChild)).toBe(0)
  })

  it('with that depth + 1 as the cap, the node is drawn', () => {
    const maxDepth = Math.max(3, computeDepthFromRoot('great2', people, parentChild) + 1)
    const [layout] = computeLayout([root('A')], people, partnerships, parentChild, maxDepth)
    expect(layout.allNodes.some(n => n.person.id === 'great2' && !n.isReference)).toBe(true)
  })

  it('survives a loop in bad data', () => {
    const loop = [person('x', 'A'), person('y', 'A')]
    expect(computeDepthFromRoot('x', loop, [link('x', 'y'), link('y', 'x')])).toBeGreaterThanOrEqual(0)
  })
})

describe('the «عرض أجيال إضافية» button never covers a card', () => {
  // Founder → 3 sons → 3 grandsons each → 4 great-grandsons each, who all
  // have children: at the default depth (3) the great-grandsons are cut off
  // and stacked as leaves, each with a button under it.
  const A = root('A')
  const people: PersonRow[] = [person('f', 'A')]
  const partnerships: PartnershipRow[] = []
  const parentChild: ParentChildRow[] = []
  const child = (parent: string, id: string) => { people.push(person(id, 'A')); parentChild.push(link(parent, id)) }
  for (let s = 0; s < 3; s++) {
    child('f', `s${s}`)
    for (let g = 0; g < 3; g++) {
      child(`s${s}`, `s${s}g${g}`)
      for (let gg = 0; gg < 4; gg++) {
        const id = `s${s}g${g}gg${gg}`
        child(`s${s}g${g}`, id)
        people.push(person(`${id}-wife`, 'A', 'female')); partnerships.push(marry(id, `${id}-wife`))
        child(id, `${id}-kid`)
      }
    }
  }
  const [layout] = computeLayout([A], people, partnerships, parentChild, 3)

  it('there are cut-off nodes to test', () => {
    expect(layout.allNodes.filter(n => n.truncated)).toHaveLength(36)
  })

  it('no button rect intersects any node rect', () => {
    const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
    const hit = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const nodes = layout.allNodes.map(n => rect(n.x, n.y, NODE_WIDTH, NODE_HEIGHT))
    const buttons = layout.allNodes.filter(n => n.truncated)
      .map(n => rect(n.x, n.y + NODE_HEIGHT + SHOW_MORE_GAP, NODE_WIDTH, SHOW_MORE_HEIGHT))
    const overlaps = buttons.filter(b => nodes.some(n => hit(b, n)))
    expect(overlaps).toEqual([])
  })
})
