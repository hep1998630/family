// A made-up multi-generation family (41 people): wider than a phone and
// taller than one screen once laid out as the full tree.
export function makeSeed() {
  let n = 0
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const t = '2026-01-01T00:00:00.000Z'
  const ROOT = id()
  const roots = [{ id: ROOT, name: 'عائلة المصطفى', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t }]
  const people = [], partnerships = [], parent_child = []

  const add = (name, gender, extra = {}) => {
    const p = { id: id(), name, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
      root_id: ROOT, gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
      created_at: t, updated_at: t, ...extra }
    people.push(p); return p
  }
  const marry = (a, b) => { const [x, y] = [a.id, b.id].sort(); partnerships.push({ id: id(), person_a_id: x, person_b_id: y, created_at: t }) }
  const child = (father, mother, name, gender) => {
    const c = add(name, gender, { mother_id: mother?.id ?? null })
    parent_child.push({ id: id(), parent_id: father.id, child_id: c.id, created_at: t })
    return c
  }

  const founder = add('مصطفى', 'male')
  const wife = add('فاطمة', 'female')
  marry(founder, wife)

  const sons = ['محمد', 'أحمد', 'علي', 'حسن', 'إبراهيم']
  const daughters = ['تهاني', 'مريم', 'خديجة']
  const wives = ['سارة', 'نور', 'هدى', 'ليلى', 'رنا']
  const grandkids = [['يوسف', 'male'], ['زينب', 'female'], ['عمر', 'male'], ['آمنة', 'female']]

  sons.forEach((s, i) => {
    const son = child(founder, wife, s, 'male')
    const w = add(wives[i], 'female')
    marry(son, w)
    grandkids.forEach(([g, gen], j) => {
      const gk = child(son, w, g, gen)
      if (i < 2 && j === 0) {
        const gw = add('ريم', 'female'); marry(gk, gw)
        child(gk, gw, 'مصطفى', 'male'); child(gk, gw, 'فاطمة', 'female')
      }
    })
  })
  daughters.forEach(d => child(founder, wife, d, 'female'))

  return { roots, people, partnerships, parent_child }
}
