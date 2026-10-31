// lib/search/arabic.ts
//
// Arabic-aware matching for every name search box: people type names the
// way they usually write them — without tashkeel, with ا for أ/إ/آ, ه for ة,
// ي for ى — so «احمد» must find «أحمد», «فاطمه» «فاطمة», «مصطفي» «مصطفى».

// Tashkeel (fatha … sukun, shadda, the superscript alef, Quranic marks) and
// tatweel «ـ» are dropped entirely.
const DROPPED = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/

const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ة': 'ه',
  'ى': 'ي',
  'ؤ': 'و',
  'ئ': 'ي',
}

/**
 * The text folded for comparison, plus where each folded character came
 * from in the original (so a match can be highlighted in the original).
 */
function fold(text: string): { folded: string; from: number[] } {
  let folded = ''
  const from: number[] = []
  let lastWasSpace = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (DROPPED.test(ch)) continue
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue // runs of spaces count as one
      lastWasSpace = true
      folded += ' '
      from.push(i)
      continue
    }
    lastWasSpace = false
    folded += (FOLD[ch] ?? ch).toLowerCase()
    from.push(i)
  }
  return { folded, from }
}

/** The text in its comparable form (also trimmed). */
export function normalizeArabic(text: string): string {
  return fold(text).folded.trim()
}

/** Whether `text` contains `query`, comparing both normalised. */
export function matchesArabic(text: string | null | undefined, query: string): boolean {
  const q = normalizeArabic(query)
  return !!q && !!text && fold(text).folded.includes(q)
}

/**
 * Where `query` matches inside `text`, as [start, end) in the ORIGINAL text
 * (taking in any tashkeel on the last letter) — or null.
 */
export function findArabic(text: string, query: string): [number, number] | null {
  const q = normalizeArabic(query)
  if (!q) return null
  const { folded, from } = fold(text)
  const at = folded.indexOf(q)
  if (at === -1) return null
  let end = from[at + q.length - 1] + 1
  while (end < text.length && DROPPED.test(text[end])) end++
  return [from[at], end]
}
