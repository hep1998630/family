// «إعدادات الموقع» (migration 008), against the fake Supabase — never the
// real database:
//  - the owner sees the button; changing the name updates the header, the
//    page <title>, the login page and the home-screen manifest;
//  - a save the database refuses (0 rows) shows an Arabic error;
//  - an editor does NOT see the button, but does see «فتح الشجرة الأخرى ↗»
//    when it's set; the public /view never shows that link;
//  - before 008 is run (no table) the site still works as «شجرة العائلة».
//
//   npm run e2e:site-settings
import { chromium } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { makeSeed } from './seed.mjs'
import { USER } from './mock-supabase.mjs'

const OTHER = 'https://other-family.example.app'
const { check, finish } = checker()
const browser = await chromium.launch()

async function adminPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ctx.setDefaultTimeout(60_000)
  await ctx.addCookies([authCookie()])
  return ctx.newPage()
}
const openMenu = page => page.getByRole('button', { name: /^الحساب/ }).click()

// ── 1. the owner ──
{
  console.log('── owner')
  const { app, mockUrl, stop } = await startApp({ seed: makeSeed() })
  const state = async () => (await (await fetch(`${mockUrl}/__mock/state`)).json()).db
  try {
    const page = await adminPage()
    await page.goto(`${app}/edit`)
    check(await page.title() === 'شجرة العائلة', `default title: «${await page.title()}»`)
    await openMenu(page)
    const settingsButton = page.getByRole('button', { name: 'إعدادات الموقع' })
    check(await settingsButton.isVisible(), 'the owner sees «إعدادات الموقع»')
    check(await page.getByText('فتح الشجرة الأخرى').count() === 0, 'no other-site link while none is set')
    await settingsButton.click()
    const dialog = page.getByRole('dialog')

    // A refused save (RLS: 0 rows) is an error, not «تم الحفظ».
    await fetch(`${mockUrl}/__mock/refuse`, { method: 'POST', body: JSON.stringify(['site_settings', 'PATCH']) })
    await dialog.getByLabel('اسم العائلة').fill('عائلة الأم')
    await dialog.getByRole('button', { name: 'حفظ الإعدادات' }).click()
    await dialog.getByRole('alert').waitFor()
    check((await dialog.getByRole('alert').textContent()).includes('لم يتم الحفظ'), `refused save: «${await dialog.getByRole('alert').textContent()}»`)
    check((await state()).site_settings[0].family_name === 'شجرة العائلة', 'nothing was changed')
    await fetch(`${mockUrl}/__mock/refuse`, { method: 'DELETE' })

    // Bad link → field error, nothing sent.
    await dialog.getByLabel('رابط شجرة العائلة الأخرى (اختياري)').fill('http://not-secure.example')
    await dialog.getByRole('button', { name: 'حفظ الإعدادات' }).click()
    const urlField = dialog.getByLabel('رابط شجرة العائلة الأخرى (اختياري)')
    check(await urlField.getAttribute('aria-invalid') === 'true', 'a non-https link is refused in the form')

    // A real save.
    await urlField.fill(OTHER)
    await dialog.getByRole('button', { name: 'حفظ الإعدادات' }).click()
    await dialog.getByText('تم حفظ الإعدادات.').waitFor()
    check(true, 'saved: «تم حفظ الإعدادات.»')
    const row = (await state()).site_settings[0]
    check(row.family_name === 'عائلة الأم' && row.other_site_url === OTHER, 'the row was updated')
    await page.waitForFunction(() => document.title === 'عائلة الأم', null, { timeout: 15_000 }).catch(() => {})
    check(await page.title() === 'عائلة الأم', `the page title follows: «${await page.title()}»`)
    check(await page.locator('header h1').first().textContent() === 'عائلة الأم', 'the header follows')
    await dialog.getByRole('button', { name: 'إغلاق' }).click()

    await openMenu(page)
    const link = page.getByRole('link', { name: 'فتح الشجرة الأخرى ↗' })
    check(await link.getAttribute('href') === OTHER && await link.getAttribute('target') === '_blank'
      && (await link.getAttribute('rel')).includes('noopener'), 'the owner gets the other-site link (new tab, noopener)')

    const manifest = await (await fetch(`${app}/manifest.webmanifest`)).json()
    check(manifest.name === 'عائلة الأم' && manifest.short_name === 'عائلة الأم', `home-screen name: «${manifest.name}»`)
    const login = await (await browser.newPage()).goto(`${app}/login`)
    check((await login.text()).includes('عائلة الأم'), 'the login page shows the name')

    // The public page: the name, never the other family's link.
    const pub = await browser.newPage()
    await pub.goto(`${app}/view`)
    await pub.waitForLoadState('networkidle')
    check(await pub.title() === 'عائلة الأم', 'the public page has the name too')
    check(!(await pub.content()).includes(OTHER), 'the public page never contains the other-site link')
  } finally {
    await stop()
  }
}

// ── 2. an editor ──
{
  console.log('── editor')
  const seed = makeSeed()
  seed.admins = [{ id: USER.id, role: 'editor', name: 'محرر', created_at: new Date().toISOString() }]
  seed.site_settings = [{ id: 1, family_name: 'عائلة الأب', other_site_url: OTHER, updated_at: new Date().toISOString() }]
  const { app, stop } = await startApp({ seed })
  try {
    const page = await adminPage()
    await page.goto(`${app}/edit`)
    await openMenu(page)
    check(await page.getByRole('button', { name: 'إعدادات الموقع' }).count() === 0, 'an editor does not see «إعدادات الموقع»')
    check(await page.getByRole('link', { name: 'فتح الشجرة الأخرى ↗' }).getAttribute('href') === OTHER, 'an editor sees the other-site link')

    // The public page, signed in or not: no link.
    for (const signedIn of [true, false]) {
      const pub = signedIn ? await adminPage() : await browser.newPage()
      await pub.goto(`${app}/view`)
      await pub.waitForLoadState('networkidle')
      check(!(await pub.content()).includes(OTHER), `/view ${signedIn ? '(signed in)' : '(visitor)'} never shows the other-site link`)
    }
  } finally {
    await stop()
  }
}

// ── 3. before migration 008 ──
{
  console.log('── before 008 is run')
  const { app, stop } = await startApp({ seed: makeSeed(), missingTables: ['site_settings'] })
  try {
    const page = await adminPage()
    const res = await page.goto(`${app}/edit`)
    check(res.ok() && await page.title() === 'شجرة العائلة', 'the site works, as «شجرة العائلة»')
    await openMenu(page)
    await page.getByRole('button', { name: 'إعدادات الموقع' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('اسم العائلة').fill('عائلة الأم')
    await dialog.getByRole('button', { name: 'حفظ الإعدادات' }).click()
    await dialog.getByRole('alert').waitFor()
    check((await dialog.getByRole('alert').textContent()).includes('008'), `saving explains the missing migration: «${await dialog.getByRole('alert').textContent()}»`)
    const manifest = await (await fetch(`${app}/manifest.webmanifest`)).json()
    check(manifest.name === 'شجرة العائلة', 'the manifest still works')
  } finally {
    await stop()
  }
}

await browser.close()
finish()
