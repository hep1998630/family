import { describe, expect, it } from 'vitest'
import { findArabic, matchesArabic, normalizeArabic } from './arabic'

describe('Arabic name search', () => {
  it('finds names however the hamza, taa marbuta and alef maqsura are typed', () => {
    expect(matchesArabic('أحمد', 'احمد')).toBe(true)
    expect(matchesArabic('إبراهيم', 'ابراهيم')).toBe(true)
    expect(matchesArabic('آمنة', 'امنه')).toBe(true)
    expect(matchesArabic('فاطمة', 'فاطمه')).toBe(true)
    expect(matchesArabic('مصطفى', 'مصطفي')).toBe(true)
    expect(matchesArabic('مؤمن', 'مومن')).toBe(true)
    expect(matchesArabic('هانئ', 'هاني')).toBe(true)
    expect(matchesArabic('ٱلله', 'الله')).toBe(true)
  })

  it('works the other way round too (typed with hamza, stored without)', () => {
    expect(matchesArabic('احمد', 'أحمد')).toBe(true)
    expect(matchesArabic('فاطمه', 'فاطمة')).toBe(true)
  })

  it('ignores tashkeel and tatweel', () => {
    expect(matchesArabic('مُحَمَّد', 'محمد')).toBe(true)
    expect(matchesArabic('محمد', 'مُحَمَّد')).toBe(true)
    expect(matchesArabic('عبـــد الله', 'عبد')).toBe(true)
  })

  it('ignores extra spaces and letter case', () => {
    expect(matchesArabic('عبد  الرحمن', ' عبد الرحمن ')).toBe(true)
    expect(matchesArabic('Ahmed', 'ahm')).toBe(true)
  })

  it('still tells different names apart', () => {
    expect(matchesArabic('أحمد', 'محمد')).toBe(false)
    expect(matchesArabic('سارة', 'ساري')).toBe(false)
    expect(matchesArabic('علي', '')).toBe(false)
    expect(matchesArabic(null, 'علي')).toBe(false)
  })

  it('normalizeArabic folds as described', () => {
    expect(normalizeArabic(' أَحْمَدُ  إبراهيم آمنة ٱلنور فاطمة مصطفى مؤمن هانئ ')).toBe('احمد ابراهيم امنه النور فاطمه مصطفي مومن هاني')
  })

  it('finds where the match is in the original text, for highlighting', () => {
    expect(findArabic('سعيد أحمد', 'احمد')).toEqual([5, 9])
    // Tashkeel inside and right after the match is included.
    const name = 'مُحَمَّدٌ'
    const [start, end] = findArabic(name, 'محمد')!
    expect(name.slice(start, end)).toBe('مُحَمَّدٌ')
    expect(findArabic('علي', 'عمر')).toBeNull()
  })
})
