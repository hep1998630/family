// lib/export/familyExport.ts
//
// «تصدير العائلة»: turns the database rows into a platform-neutral export —
// family.json (this app's own clean format) and family.ged (GEDCOM 5.5.1,
// which MyHeritage / Ancestry / FamilySearch / Gramps import). Pure
// functions only, so they can be unit-tested; the browser side (fetching,
// photos, zip) lives in runExport.ts.
//
// App internals are left out: canvas positions, shortcut rows (resolved to
// the real person and never exported twice), raw root_id (→ branches),
// timestamps, admins, saved views and anything auth-related.

import { findRootPerson } from '@/lib/tree/layout'
import { extForMime } from '@/lib/photos/avatars'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'

export interface FamilyData {
  roots: RootRow[]
  people: PersonRow[]
  partnerships: PartnershipRow[]
  parentChild: ParentChildRow[]
}

export interface ExportPerson {
  id: string
  name: string
  nickname: string | null
  gender: 'male' | 'female' | null
  birth_date: string | null
  bio: string | null
  /** Path inside the zip (`photos/<id>.<ext>`), or null. */
  photo: string | null
  /** Set when the person has a photo that couldn't be downloaded. */
  photo_missing_url?: string
  father_id: string | null
  mother_id: string | null
  /** Every recorded parent — also when their gender (so father/mother) is unknown. */
  parent_ids: string[]
}

export interface FamilyExport {
  format: 'family-tree-export'
  version: 1
  exported_at: string
  branches: { id: string; name: string; founder_id: string | null; member_ids: string[] }[]
  people: ExportPerson[]
  marriages: { id: string; partner_ids: [string, string] }[]
}

/** What happened to each person's photo: a path in the zip, or the URL that failed. */
export type PhotoResult = { path: string } | { missingUrl: string }

// ── Cleaning the rows ─────────────────────────────────────────────────────────

interface Clean {
  people: PersonRow[]                          // real people only
  byId: Map<string, PersonRow>
  marriages: { id: string; a: string; b: string }[]
  parentsOf: Map<string, string[]>             // child → resolved parent ids
}

/** Resolves shortcut rows to the real person and drops duplicates / dangling links. */
function clean(data: FamilyData): Clean {
  const all = new Map(data.people.map(p => [p.id, p]))
  const real = (id: string | null): string | null => {
    let current = id
    for (let i = 0; current && i < 10; i++) {
      const p = all.get(current)
      if (!p) return null
      if (!p.is_shortcut) return p.id
      current = p.original_person_id
    }
    return null
  }

  const people = data.people
    .filter(p => !p.is_shortcut)
    .map(p => ({ ...p, mother_id: real(p.mother_id) }))
  const byId = new Map(people.map(p => [p.id, p]))

  const seenPairs = new Set<string>()
  const marriages: Clean['marriages'] = []
  for (const ps of data.partnerships) {
    const a = real(ps.person_a_id), b = real(ps.person_b_id)
    if (!a || !b || a === b) continue
    const key = [a, b].sort().join('|')
    if (seenPairs.has(key)) continue
    seenPairs.add(key)
    marriages.push({ id: ps.id, a, b })
  }

  const parentsOf = new Map<string, string[]>()
  for (const pc of data.parentChild) {
    const parent = real(pc.parent_id), child = real(pc.child_id)
    if (!parent || !child || parent === child) continue
    const list = parentsOf.get(child) ?? []
    if (!list.includes(parent)) list.push(parent)
    parentsOf.set(child, list)
  }

  return { people, byId, marriages, parentsOf }
}

/** Father / mother from the parent links, genders and mother_id; null when it can't be told. */
function parentsFor(person: PersonRow, c: Clean): Pick<ExportPerson, 'father_id' | 'mother_id' | 'parent_ids'> {
  const linked = c.parentsOf.get(person.id) ?? []
  const motherId = person.mother_id && person.mother_id !== person.id && c.byId.has(person.mother_id)
    ? person.mother_id
    : linked.find(id => c.byId.get(id)?.gender === 'female') ?? null
  const others = linked.filter(id => id !== motherId)
  const fatherId = others.find(id => c.byId.get(id)?.gender === 'male')
    // With the mother known, a single other parent of unknown gender is the father.
    ?? (motherId && others.length === 1 && c.byId.get(others[0])?.gender !== 'female' ? others[0] : null)
  const parent_ids = [...new Set([fatherId, motherId, ...linked].filter((x): x is string => !!x))]
  return { father_id: fatherId, mother_id: motherId, parent_ids }
}

// ── family.json ───────────────────────────────────────────────────────────────

export function buildFamilyExport(
  data: FamilyData,
  photos: Map<string, PhotoResult>,
  exportedAt: Date,
): FamilyExport {
  const c = clean(data)
  const cleanPc = [...c.parentsOf].flatMap(([child, parents]) =>
    parents.map(parent => ({ id: `${parent}>${child}`, parent_id: parent, child_id: child, created_at: '' })))

  return {
    format: 'family-tree-export',
    version: 1,
    exported_at: exportedAt.toISOString(),
    branches: data.roots.map(root => ({
      id: root.id,
      name: root.name,
      founder_id: findRootPerson(root.id, c.people, cleanPc)?.id ?? null,
      member_ids: c.people.filter(p => p.root_id === root.id).map(p => p.id),
    })),
    people: c.people.map(p => {
      const photo = photos.get(p.id)
      return {
        id: p.id,
        name: p.name,
        nickname: p.nickname,
        gender: p.gender,
        birth_date: p.birth_date,
        bio: p.bio,
        photo: photo && 'path' in photo ? photo.path : null,
        ...(photo && 'missingUrl' in photo ? { photo_missing_url: photo.missingUrl } : {}),
        ...parentsFor(p, c),
      }
    }),
    marriages: c.marriages.map(m => ({ id: m.id, partner_ids: [m.a, m.b] })),
  }
}

/** The photos to download: one per real person who has one. */
export function photoTargets(data: FamilyData): { personId: string; url: string }[] {
  return data.people
    .filter(p => !p.is_shortcut && p.photo_url && /^https?:\/\//.test(p.photo_url))
    .map(p => ({ personId: p.id, url: p.photo_url! }))
}

/** `photos/<id>.<ext>`, the extension taken from the content type or the URL. */
export function photoPath(personId: string, url: string, contentType?: string | null): string {
  const byType = extForMime(contentType)
  const byUrl = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  return `photos/${personId}.${byType ?? (byUrl === 'jpeg' ? 'jpg' : byUrl) ?? 'jpg'}`
}

// ── family.ged (GEDCOM 5.5.1) ─────────────────────────────────────────────────

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const toAsciiDigits = (s: string) => s
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))

function validDay(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * birth_date is free text. A proper GEDCOM date when it parses cleanly
 * («1990», «1990-05-12», «12/5/1990» day first, «5/1990», «حوالي 1945»),
 * otherwise a date phrase in parentheses, kept word for word.
 */
export function gedcomDate(text: string): string {
  const raw = text.trim()
  const s = toAsciiDigits(raw).replace(/\s+/g, ' ')
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})$/))) return m[1]
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)) && validDay(+m[1], +m[2], +m[3])) {
    return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)) && validDay(+m[3], +m[2], +m[1])) {
    return `${+m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}`
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return `${MONTHS[+m[1] - 1]} ${m[2]}`
  if ((m = s.match(/^(?:حوالي|حوالى|تقريبا|تقريباً|نحو|سنة حوالي)\s*(\d{4})$/))) return `ABT ${m[1]}`
  if ((m = s.match(/^قبل\s*(\d{4})$/))) return `BEF ${m[1]}`
  if ((m = s.match(/^بعد\s*(\d{4})$/))) return `AFT ${m[1]}`
  return `(${raw.replace(/[()]/g, '')})`
}

/** One tag's text as GEDCOM lines: CONT for line breaks, CONC for long lines, «@» doubled. */
function textLines(level: number, tag: string, text: string): string[] {
  const out: string[] = []
  const lines = text.replace(/\r\n?/g, '\n').replace(/@/g, '@@').split('\n')
  lines.forEach((line, i) => {
    const chunks = line.match(/[\s\S]{1,200}/g) ?? ['']
    chunks.forEach((chunk, j) => {
      const prefix = i === 0 && j === 0 ? `${level} ${tag}` : `${level + 1} ${j === 0 ? 'CONT' : 'CONC'}`
      out.push(chunk ? `${prefix} ${chunk}` : prefix)
    })
  })
  return out
}

interface Fam { xref: string; husb?: string; wife?: string; children: string[] }

/** Couples (and single parents) as GEDCOM families, with HUSB / WIFE set by gender. */
function buildFams(exp: FamilyExport): Fam[] {
  const gender = new Map(exp.people.map(p => [p.id, p.gender]))
  const fams = new Map<string, Fam>()
  const famFor = (ids: string[]): Fam => {
    const key = [...ids].sort().join('|')
    let fam = fams.get(key)
    if (!fam) {
      fam = { xref: `@F${fams.size + 1}@`, children: [] }
      if (ids.length === 1) {
        if (gender.get(ids[0]) === 'female') fam.wife = ids[0]
        else fam.husb = ids[0]
      } else {
        const [a, b] = ids
        // The man is HUSB; with one gender unknown, the other takes the opposite role.
        const aIsWife = gender.get(a) === 'female' || (gender.get(a) !== 'male' && gender.get(b) === 'male')
        fam.husb = aIsWife ? b : a
        fam.wife = aIsWife ? a : b
      }
      fams.set(key, fam)
    }
    return fam
  }

  for (const m of exp.marriages) famFor(m.partner_ids)
  for (const p of exp.people) {
    const known = p.father_id && p.mother_id ? [p.father_id, p.mother_id] : p.parent_ids.slice(0, 2)
    if (known.length > 0) famFor(known).children.push(p.id)
  }
  return [...fams.values()]
}

export function buildGedcom(exp: FamilyExport): string {
  const xref = new Map(exp.people.map((p, i) => [p.id, `@I${i + 1}@`]))
  const fams = buildFams(exp)
  const d = new Date(exp.exported_at)
  const lines: string[] = [
    '0 HEAD',
    '1 SOUR FAMILY_TREE_EXPORT',
    '2 NAME شجرة العائلة',
    `1 DATE ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    '1 SUBM @SUBM1@',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 LANG Arabic',
    '0 @SUBM1@ SUBM',
    '1 NAME شجرة العائلة',
  ]

  for (const p of exp.people) {
    const name = p.name.replace(/\//g, ' ').trim()
    lines.push(`0 ${xref.get(p.id)} INDI`)
    // Full name as the given name — no surname is forced on anyone.
    lines.push(...textLines(1, 'NAME', name), ...textLines(2, 'GIVN', name))
    if (p.nickname) lines.push(...textLines(2, 'NICK', p.nickname))
    lines.push(`1 SEX ${p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : 'U'}`)
    if (p.birth_date?.trim()) lines.push('1 BIRT', `2 DATE ${gedcomDate(p.birth_date)}`)
    if (p.bio?.trim()) lines.push(...textLines(1, 'NOTE', p.bio))
    if (p.photo) {
      lines.push('1 OBJE', `2 FILE ${p.photo}`, `3 FORM ${p.photo.split('.').pop()}`)
    }
    for (const f of fams) if (f.children.includes(p.id)) lines.push(`1 FAMC ${f.xref}`)
    for (const f of fams) if (f.husb === p.id || f.wife === p.id) lines.push(`1 FAMS ${f.xref}`)
    // The export's id, so family.json and family.ged can be matched up.
    lines.push(`1 REFN ${p.id}`, '2 TYPE family-tree-export')
  }

  for (const f of fams) {
    lines.push(`0 ${f.xref} FAM`)
    if (f.husb) lines.push(`1 HUSB ${xref.get(f.husb)}`)
    if (f.wife) lines.push(`1 WIFE ${xref.get(f.wife)}`)
    for (const child of f.children) lines.push(`1 CHIL ${xref.get(child)}`)
  }

  lines.push('0 TRLR')
  return lines.join('\n') + '\n'
}

// ── README.txt ────────────────────────────────────────────────────────────────

export function buildReadme(exp: FamilyExport): string {
  const missing = exp.people.filter(p => p.photo_missing_url)
  const photos = exp.people.filter(p => p.photo).length
  const date = exp.exported_at.slice(0, 10)
  const lines = [
    `تصدير شجرة العائلة — ${date}`,
    '==========================',
    '',
    'هذا الملف يحتوي على بيانات العائلة كاملة، لنقلها إلى أي موقع أو برنامج آخر:',
    '',
    `• family.ged — ملف GEDCOM (الإصدار 5.5.1)، الصيغة القياسية لأشجار العائلة. يمكن استيراده في`,
    '  MyHeritage و Ancestry و FamilySearch و Gramps وغيرها.',
    '• family.json — البيانات نفسها بصيغة JSON منظمة (للمبرمجين أو لأي أداة تقرأ JSON).',
    '• photos/ — صور الأشخاص. اسم كل صورة هو رقم الشخص في الملفين أعلاه.',
    '',
    `العدد: ${exp.people.length} شخصاً، ${exp.marriages.length} زواجاً، ${exp.branches.length} فرعاً، ${photos} صورة.`,
    ...(missing.length > 0 ? [
      '',
      `تعذّر تنزيل ${missing.length} صورة، وهذه روابطها الأصلية:`,
      ...missing.map(p => `  - ${p.name}: ${p.photo_missing_url}`),
    ] : []),
    '',
    '--------------------------------------------------------------------',
    '',
    `Family tree export — ${date}`,
    '',
    'This archive holds the whole family, ready to move to another site or program:',
    '',
    '• family.ged — GEDCOM 5.5.1, the standard family-tree format. Import it into',
    '  MyHeritage, Ancestry, FamilySearch, Gramps and most genealogy software.',
    '  Names are in Arabic (UTF-8).',
    '• family.json — the same data as structured JSON (format "family-tree-export",',
    '  version 1): branches, people (with father_id / mother_id / parent_ids and the',
    '  photo path) and marriages. Ids are the same in both files.',
    '• photos/ — each person\'s photo, named by their id.',
    '',
    `Totals: ${exp.people.length} people, ${exp.marriages.length} marriages, ${exp.branches.length} branches, ${photos} photos.`,
    ...(missing.length > 0 ? [
      '',
      `${missing.length} photo(s) could not be downloaded; their original links:`,
      ...missing.map(p => `  - ${p.id}: ${p.photo_missing_url}`),
    ] : []),
    '',
  ]
  return lines.join('\n')
}
