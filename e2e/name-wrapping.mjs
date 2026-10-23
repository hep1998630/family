// Names must never break inside a word — not even with very large text
// (a real report from a phone with a large system font).
//
//   npm run e2e:name-wrapping
//
// Uses the real names from the report, at 360px and 412px, with text at
// 100%, 150% and 200% — scaled two ways: the browser's default font size
// (what a text-size setting changes) and a forced root font size (what an
// enlarged phone font can do even to a page that sets pixel sizes).
// For every rendered name, each word must sit in ONE line box
// (Range.getClientRects) and stay inside its card.
// Runs against an in-memory fake Supabase — never the real database.
//
// E2E_SHOTS=<dir> also saves a screenshot of each family-view case there.
import fs from 'node:fs'
import { chromium, devices } from 'playwright'
import { checker, startApp } from './harness.mjs'

const t = '2026-01-01T00:00:00.000Z'
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const ROOT = id()
const people = [], partnerships = [], parent_child = []
const add = (name, gender, extra = {}) => {
  const p = { id: id(), name, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
    root_id: ROOT, gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
    created_at: `2026-01-01T00:00:00.${String(n).padStart(3, '0')}Z`, updated_at: t, ...extra }
  people.push(p); return p
}
const marry = (a, b) => partnerships.push({ id: id(), person_a_id: a.id, person_b_id: b.id, created_at: t })
const child = (father, mother, name, gender) => {
  const c = add(name, gender, { mother_id: mother.id })
  parent_child.push({ id: id(), parent_id: father.id, child_id: c.id, created_at: t })
  parent_child.push({ id: id(), parent_id: mother.id, child_id: c.id, created_at: t })
  return c
}
const father = add('عبد الله', 'male')
const mother = add('ستنا بنت عبد الرحمن', 'female')
marry(father, mother)
const focus = child(father, mother, 'شرف الدين', 'male')
const wife = add('تميمة', 'female')
marry(focus, wife)
for (const [name, gender] of [['الطيب', 'male'], ['تميمة', 'female'], ['ستنا بنت عبد الرحمن', 'female'], ['عبد الله', 'male'], ['شرف الدين', 'male']]) {
  child(focus, wife, name, gender)
}
const seed = { roots: [{ id: ROOT, name: 'عائلة الطيب', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t }], people, partnerships, parent_child }

// Every word of every name: how many line boxes it occupies, and whether
// it pokes outside the box it belongs to.
const measure = names => names.map(el => {
  const box = (el.closest('button, .person-node, .family-focus') ?? el).getBoundingClientRect()
  const text = el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild : null
  const words = []
  if (text) {
    const re = /\S+/g
    let m
    while ((m = re.exec(text.data))) {
      const r = document.createRange()
      r.setStart(text, m.index); r.setEnd(text, m.index + m[0].length)
      const rects = [...r.getClientRects()].filter(x => x.width > 0)
      const lines = new Set(rects.map(x => Math.round(x.top))).size
      const outside = rects.some(x => x.left < box.left - 1 || x.right > box.right + 1)
      words.push({ word: m[0], lines, outside })
    }
  }
  return { name: el.textContent, words, fontSize: getComputedStyle(el).fontSize }
})

const { check, finish } = checker()
const { app, stop } = await startApp({ seed })
const shots = process.env.E2E_SHOTS
if (shots) fs.mkdirSync(shots, { recursive: true })

try {
  const browser = await chromium.launch()
  for (const width of [360, 412]) {
    for (const scale of [1, 1.5, 2]) {
      for (const how of scale === 1 ? ['default'] : ['setting', 'forced']) {
        const label = `${width}px, text ${scale * 100}%${how === 'default' ? '' : ` (${how})`}`
        console.log(`── ${label}`)
        const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width, height: 860 } })
        ctx.setDefaultTimeout(60_000)
        const page = await ctx.newPage()
        if (how === 'setting') {
          const cdp = await ctx.newCDPSession(page)
          await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * scale } })
        }
        if (how === 'forced') {
          await ctx.addInitScript(px => {
            document.addEventListener('DOMContentLoaded', () => {
              const s = document.createElement('style')
              s.textContent = `html { font-size: ${px}px !important }`
              document.head.append(s)
            })
          }, 18 * scale)
        }

        for (const mode of ['family', 'tree']) {
          await ctx.addInitScript(m => localStorage.setItem('family-tree:view', m), mode)
          await page.goto(`${app}/view?root=${ROOT}&focus=${focus.id}`)
          // (The second half of each selector also finds the names in the old markup.)
          const selector = mode === 'family'
            ? '[data-testid="family-view"] :is(.name-text, h2, button > span > span.text-lg)'
            : '.person-node :is(.name-text, p.text-sm)'
          await page.waitForSelector(selector, { state: 'attached' })
          await page.evaluate(() => document.fonts.ready)
          await page.waitForTimeout(300)
          const names = await page.$$eval(selector, measure)
          const split = names.flatMap(n => n.words.filter(w => w.lines > 1).map(w => `«${w.word}» in «${n.name}»`))
          const outside = names.flatMap(n => n.words.filter(w => w.outside).map(w => `«${w.word}» in «${n.name}»`))
          check(names.length >= 9, `${mode}: found ${names.length} names`)
          check(split.length === 0, `${mode}: no word split across lines${split.length ? ` — split: ${split.join(', ')}` : ''}`)
          check(outside.length === 0, `${mode}: no word sticks out of its card${outside.length ? ` — ${outside.join(', ')}` : ''}`)
          if (mode === 'family') {
            // Nothing on the page (top bar included) may stick out sideways.
            const offscreen = await page.evaluate(() => [...document.querySelectorAll('body *')]
              .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) })
              .map(el => `${el.tagName} «${el.textContent.trim().slice(0, 20)}»`))
            check(offscreen.length === 0, `family: nothing sticks out sideways${offscreen.length ? ` — ${offscreen.slice(0, 5).join(', ')}` : ''}`)
            if (shots) {
              await page.getByText('الوالدان', { exact: true }).evaluate(el => el.scrollIntoView())
              await page.screenshot({ path: `${shots}/family-${width}-${scale * 100}-${how}.png`, fullPage: false })
            }
          }
        }
        await ctx.close()
      }
    }
  }
  await browser.close()
} finally {
  await stop()
}
finish()
