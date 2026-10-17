// The family the saved-view checks use: the made-up seed, plus a second
// wife (منى) and daughter (سلمى) for محمد, a son of his with no recorded
// mother (قاسم), and two saved views.
import { makeSeed } from './seed.mjs'

export function savedViewsScenario() {
  const seed = makeSeed()
  const t = '2026-01-01T00:00:00.000Z'
  const byName = (name, root = seed.roots[0].id) => seed.people.find(p => p.name === name && p.root_id === root)
  const add = (id, name, gender, extra = {}) => {
    const p = { ...byName('مصطفى'), id, name, gender, mother_id: null, ...extra }
    seed.people.push(p)
    return p
  }
  const founder = seed.people[0]
  const mohammed = byName('محمد')
  const sara = byName('سارة')
  const mona = add('00000000-0000-4000-8000-0000000000f1', 'منى', 'female')
  const salma = add('00000000-0000-4000-8000-0000000000f2', 'سلمى', 'female', { mother_id: mona.id })
  const qasim = add('00000000-0000-4000-8000-0000000000f3', 'قاسم', 'male')
  seed.partnerships.push({ id: '00000000-0000-4000-8000-0000000000f4', person_a_id: mohammed.id, person_b_id: mona.id, created_at: t })
  seed.parent_child.push(
    { id: '00000000-0000-4000-8000-0000000000f5', parent_id: mohammed.id, child_id: salma.id, created_at: t },
    { id: '00000000-0000-4000-8000-0000000000f6', parent_id: mona.id, child_id: salma.id, created_at: t },
    { id: '00000000-0000-4000-8000-0000000000f7', parent_id: mohammed.id, child_id: qasim.id, created_at: t },
  )
  const viewSara = {
    id: '00000000-0000-4000-8000-0000000000a1', name: 'ذرية محمد مصطفى من سارة', top_person_id: mohammed.id,
    depth: null, partner_id: sara.id, sort_order: 0, created_by: null, created_at: t, updated_at: t,
  }
  const viewKids = {
    id: '00000000-0000-4000-8000-0000000000a2', name: 'أبناء مصطفى', top_person_id: founder.id,
    depth: 1, partner_id: null, sort_order: 1, created_by: null, created_at: t, updated_at: t,
  }
  seed.saved_views = [viewKids, viewSara] // stored out of order on purpose
  return { seed, founder, mohammed, sara, mona, salma, qasim, viewSara, viewKids }
}
