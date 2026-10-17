import { describe, expect, it } from 'vitest'
import { parse } from 'gedcom'
import { buildFamilyExport, buildGedcom, buildReadme, gedcomDate, photoPath, photoTargets, type FamilyData, type PhotoResult } from './familyExport'
import type { PersonRow } from '@/lib/supabase/types'

const t = '2026-01-01T00:00:00+00:00'
const person = (id: string, name: string, gender: 'male' | 'female' | null, root = 'A', extra: Partial<PersonRow> = {}): PersonRow => ({
  id, name, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
  root_id: root, gender, is_shortcut: false, original_person_id: null, canvas_x: 12, canvas_y: 34,
  created_at: t, updated_at: t, ...extra,
})
const marry = (a: string, b: string) => ({ id: `m:${a}+${b}`, person_a_id: a, person_b_id: b, created_at: t })
const link = (parent: string, child: string) => ({ id: `pc:${parent}>${child}`, parent_id: parent, child_id: child, created_at: t })

// Branch A: مصطفى with three wives; children split between them.
//   علي     — father + mother (فاطمة) both linked
//   حسن    — father linked, mother only through mother_id (زينب)
//   مريم    — father + mother (خديجة)
//   عمر     — only the father linked, nothing about the mother
// Branch B: سارة (daughter of يوسف) marries علي across branches — in branch A
// she appears as a shortcut row, which is what the marriage and child point at.
// كريم: a child whose only parent has no recorded gender.
const data: FamilyData = {
  roots: [
    { id: 'A', name: 'عائلة المصطفى', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t },
    { id: 'B', name: 'عائلة يوسف', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t },
  ],
  people: [
    person('wife1', 'فاطمة', 'female', 'A', { created_at: '2026-01-02T00:00:00+00:00' }),
    person('founder', 'مصطفى فضل الله', 'male', 'A', {
      created_at: '2025-12-31T00:00:00+00:00', nickname: 'أبو علي', birth_date: '١٩٤٥',
      bio: 'مؤسس العائلة.\nعاش في القاهرة — راسلوه على a@b.com', photo_url: 'https://cdn.example/avatars/founder.jpg',
    }),
    person('wife2', 'زينب', 'female', 'A', { created_at: '2026-01-02T00:00:00+00:00', birth_date: 'حوالي 1950' }),
    person('wife3', 'خديجة', 'female', 'A', { created_at: '2026-01-02T00:00:00+00:00', birth_date: 'ربيع 1952' }),
    person('ali', 'علي', 'male', 'A', { mother_id: 'wife1', birth_date: '12/5/1970' }),
    person('hasan', 'حسن', 'male', 'A', { mother_id: 'wife2', birth_date: '1972-03-09' }),
    person('maryam', 'مريم', 'female', 'A', { mother_id: 'wife3', birth_date: '31/2/1974' }),
    person('omar', 'عمر', 'male', 'A', { birth_date: '1976' }),
    person('sara-shortcut', 'سارة', 'female', 'A', { is_shortcut: true, original_person_id: 'sara' }),
    person('ahmad', 'أحمد', 'male', 'A', { mother_id: 'sara-shortcut' }),
    person('yusuf', 'يوسف', 'male', 'B', { created_at: '2025-01-01T00:00:00+00:00', photo_url: 'https://cdn.example/avatars/yusuf.png' }),
    person('sara', 'سارة', 'female', 'B'),
    person('unknown', 'نور', null, 'B'),
    person('karim', 'كريم', 'male', 'B'),
  ],
  partnerships: [
    marry('founder', 'wife1'), marry('wife2', 'founder'), marry('founder', 'wife3'),
    marry('ali', 'sara-shortcut'),
    marry('sara', 'ali'), // the same marriage recorded twice (once via the shortcut)
  ],
  parentChild: [
    link('founder', 'ali'), link('wife1', 'ali'),
    link('founder', 'hasan'),
    link('founder', 'maryam'), link('wife3', 'maryam'),
    link('founder', 'omar'),
    link('ali', 'ahmad'), link('sara-shortcut', 'ahmad'),
    link('yusuf', 'sara'),
    link('unknown', 'karim'),
  ],
}

const photos = new Map<string, PhotoResult>([
  ['founder', { path: 'photos/founder.jpg' }],
  ['yusuf', { missingUrl: 'https://cdn.example/avatars/yusuf.png' }],
])
const exp = buildFamilyExport(data, photos, new Date('2026-10-17T10:00:00Z'))
const byId = (id: string) => exp.people.find(p => p.id === id)!

describe('family.json', () => {
  it('is versioned and platform-neutral', () => {
    expect(exp.format).toBe('family-tree-export')
    expect(exp.version).toBe(1)
    expect(exp.exported_at).toBe('2026-10-17T10:00:00.000Z')
    const keys = new Set(exp.people.flatMap(p => Object.keys(p)))
    for (const internal of ['canvas_x', 'canvas_y', 'is_shortcut', 'original_person_id', 'root_id', 'created_at', 'updated_at', 'photo_url']) {
      expect(keys.has(internal)).toBe(false)
    }
  })

  it('exports each real person once — shortcut rows are resolved, never duplicated', () => {
    expect(exp.people.map(p => p.id).sort()).toEqual(
      ['ahmad', 'ali', 'founder', 'hasan', 'karim', 'maryam', 'omar', 'sara', 'unknown', 'wife1', 'wife2', 'wife3', 'yusuf'])
    expect(exp.people.filter(p => p.name === 'سارة')).toHaveLength(1)
  })

  it('derives father and mother from links, gender and mother_id', () => {
    expect(byId('ali')).toMatchObject({ father_id: 'founder', mother_id: 'wife1' })
    expect(byId('hasan')).toMatchObject({ father_id: 'founder', mother_id: 'wife2' }) // mother only via mother_id
    expect(byId('maryam')).toMatchObject({ father_id: 'founder', mother_id: 'wife3' })
    expect(byId('omar')).toMatchObject({ father_id: 'founder', mother_id: null, parent_ids: ['founder'] })
    expect(byId('ahmad')).toMatchObject({ father_id: 'ali', mother_id: 'sara' }) // shortcut → real سارة
    // unknown gender: neither father nor mother, but still a parent
    expect(byId('karim')).toMatchObject({ father_id: null, mother_id: null, parent_ids: ['unknown'] })
  })

  it('keeps one record per marriage, cross-branch ones included', () => {
    const pairs = exp.marriages.map(m => [...m.partner_ids].sort().join('+')).sort()
    expect(pairs).toEqual(['ali+sara', 'founder+wife1', 'founder+wife2', 'founder+wife3'])
  })

  it('lists branches with their founder', () => {
    expect(exp.branches).toEqual([
      expect.objectContaining({ id: 'A', name: 'عائلة المصطفى', founder_id: 'founder' }),
      expect.objectContaining({ id: 'B', name: 'عائلة يوسف', founder_id: 'yusuf' }),
    ])
    expect(exp.branches[0].member_ids).not.toContain('sara-shortcut')
  })

  it('records photos, and the link of one that failed', () => {
    expect(byId('founder').photo).toBe('photos/founder.jpg')
    expect(byId('yusuf')).toMatchObject({ photo: null, photo_missing_url: 'https://cdn.example/avatars/yusuf.png' })
    expect(byId('ali').photo).toBeNull()
    expect('photo_missing_url' in byId('ali')).toBe(false)
  })

  it('keeps Arabic text exactly', () => {
    expect(byId('founder')).toMatchObject({ name: 'مصطفى فضل الله', nickname: 'أبو علي', birth_date: '١٩٤٥' })
  })
})

describe('photos', () => {
  it('downloads one photo per real person', () => {
    expect(photoTargets(data).map(p => p.personId)).toEqual(['founder', 'yusuf'])
  })
  it('names the file by id, extension from the content type or URL', () => {
    expect(photoPath('x', 'https://cdn.example/a/x.PNG')).toBe('photos/x.png')
    expect(photoPath('x', 'https://cdn.example/a/x', 'image/webp')).toBe('photos/x.webp')
    expect(photoPath('x', 'https://cdn.example/a/x.jpeg')).toBe('photos/x.jpg')
  })
})

describe('GEDCOM dates (birth_date is free text)', () => {
  it.each([
    ['1990', '1990'],
    ['١٩٤٥', '1945'],
    ['1972-03-09', '9 MAR 1972'],
    ['12/5/1970', '12 MAY 1970'],
    ['5/1990', 'MAY 1990'],
    ['حوالي 1950', 'ABT 1950'],
    ['قبل 1900', 'BEF 1900'],
    ['31/2/1974', '(31/2/1974)'], // not a real day → kept as a phrase
    ['ربيع 1952', '(ربيع 1952)'],
    ['مثلاً (تقريبي)', '(مثلاً تقريبي)'],
  ])('%s → %s', (input, expected) => {
    expect(gedcomDate(input)).toBe(expected)
  })
})

describe('family.ged', () => {
  const ged = buildGedcom(exp)
  type Node = { type: string; data?: { xref_id?: string; pointer?: string; value?: string }; children: Node[] }
  const tree = parse(ged) as unknown as Node
  const records = tree.children
  const indis = records.filter(r => r.type === 'INDI')
  const fams = records.filter(r => r.type === 'FAM')
  const ids = new Set(records.map(r => r.data?.xref_id).filter(Boolean))
  const value = (n: Node, type: string) => n.children.find(c => c.type === type)?.data?.value
  const refnOf = (n: Node) => value(n, 'REFN')
  const xrefOf = (id: string) => indis.find(i => refnOf(i) === id)!.data!.xref_id!
  const famOf = (husb: string | null, wife: string | null) => fams.find(f =>
    (f.children.find(c => c.type === 'HUSB')?.data?.pointer ?? null) === (husb && xrefOf(husb)) &&
    (f.children.find(c => c.type === 'WIFE')?.data?.pointer ?? null) === (wife && xrefOf(wife)))
  const childrenOf = (f: Node | undefined) => (f?.children ?? [])
    .filter(c => c.type === 'CHIL').map(c => refnOf(indis.find(i => i.data!.xref_id === c.data!.pointer)!)).sort()

  it('is GEDCOM 5.5.1 in UTF-8', () => {
    const head = records[0]
    expect(head.type).toBe('HEAD')
    expect(value(head, 'CHAR')).toBe('UTF-8')
    expect(head.children.find(c => c.type === 'GEDC')!.children.find(c => c.type === 'VERS')!.data!.value).toBe('5.5.1')
    expect(records.at(-1)!.type).toBe('TRLR')
  })

  it('has well-formed lines', () => {
    for (const line of ged.trimEnd().split('\n')) {
      expect(line).toMatch(/^\d+ (@[A-Z0-9_]+@ )?[A-Z_][A-Z0-9_]*( .*)?$/)
      expect(line.length).toBeLessThanOrEqual(255)
    }
  })

  it('resolves every cross-reference', () => {
    const pointers = records.flatMap(function walk(n: Node): string[] {
      return [...(n.data?.pointer ? [n.data.pointer] : []), ...n.children.flatMap(walk)]
    })
    expect(pointers.length).toBeGreaterThan(20)
    for (const p of pointers) expect(ids.has(p)).toBe(true)
    // …and both directions agree: FAMS ⇄ HUSB/WIFE, FAMC ⇄ CHIL
    for (const indi of indis) {
      for (const c of indi.children) {
        const fam = fams.find(f => f.data!.xref_id === c.data?.pointer)
        if (c.type === 'FAMS') expect(fam!.children.some(x => ['HUSB', 'WIFE'].includes(x.type) && x.data!.pointer === indi.data!.xref_id)).toBe(true)
        if (c.type === 'FAMC') expect(fam!.children.some(x => x.type === 'CHIL' && x.data!.pointer === indi.data!.xref_id)).toBe(true)
      }
    }
  })

  it('has one INDI per person (no duplicate for the shortcut row), Arabic names intact', () => {
    expect(indis).toHaveLength(exp.people.length)
    expect(indis.filter(i => value(i, 'NAME') === 'سارة')).toHaveLength(1)
    const founder = indis.find(i => refnOf(i) === 'founder')!
    expect(value(founder, 'NAME')).toBe('مصطفى فضل الله')
    expect(founder.children.find(c => c.type === 'NAME')!.children.find(c => c.type === 'NICK')!.data!.value).toBe('أبو علي')
    expect(value(founder, 'SEX')).toBe('M')
    expect(founder.children.find(c => c.type === 'BIRT')!.children[0].data!.value).toBe('1945')
    expect(founder.children.find(c => c.type === 'OBJE')!.children.find(c => c.type === 'FILE')!.data!.value).toBe('photos/founder.jpg')
    expect(value(indis.find(i => refnOf(i) === 'unknown')!, 'SEX')).toBe('U')
  })

  it('keeps multi-line notes and «@» intact', () => {
    expect(ged).toContain('1 NOTE مؤسس العائلة.\n2 CONT عاش في القاهرة — راسلوه على a@@b.com')
  })

  it('splits the founder\'s children between his three marriages', () => {
    expect(childrenOf(famOf('founder', 'wife1'))).toEqual(['ali'])
    expect(childrenOf(famOf('founder', 'wife2'))).toEqual(['hasan'])
    expect(childrenOf(famOf('founder', 'wife3'))).toEqual(['maryam'])
  })

  it('gives a child with only one known parent a single-parent family', () => {
    expect(childrenOf(famOf('founder', null))).toEqual(['omar'])
    expect(childrenOf(fams.find(f => !f.children.some(c => c.type === 'WIFE') &&
      f.children.find(c => c.type === 'HUSB')?.data?.pointer === xrefOf('unknown')))).toEqual(['karim'])
    expect(childrenOf(famOf('yusuf', null))).toEqual(['sara'])
  })

  it('links the cross-branch marriage once, with its child', () => {
    expect(childrenOf(famOf('ali', 'sara'))).toEqual(['ahmad'])
    expect(fams.filter(f => f.children.some(c => c.data?.pointer === xrefOf('sara') && c.type === 'WIFE'))).toHaveLength(1)
  })
})

describe('README.txt', () => {
  it('explains the files in Arabic and English and lists failed photos', () => {
    const readme = buildReadme(exp)
    expect(readme).toContain('family.ged')
    expect(readme).toContain('MyHeritage')
    expect(readme).toContain('Gramps')
    expect(readme).toContain('تعذّر تنزيل 1 صورة')
    expect(readme).toContain('https://cdn.example/avatars/yusuf.png')
  })
})
