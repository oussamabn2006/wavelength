// Captures the report screenshots through the real app (NGINX on :8080).
//   cd frontend && npm i -D playwright && npx playwright install chromium
//   node ..\scripts\screenshots.mjs you@example.com demo1234
// Output: docs/screenshots/*.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const [email, password] = process.argv.slice(2)
const BASE = process.env.BASE_URL ?? 'http://localhost:8080'
if (!email || !password) {
  console.error('usage: node screenshots.mjs <email> <password>')
  process.exit(1)
}
const out = 'docs/screenshots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })

await page.goto(`${BASE}/`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)
await shot('00-guest-home')
await page.goto(`${BASE}/login`)
await shot('01-login')
await page.fill('input[type=email]', email)
await page.fill('input[type=password]', password)
await page.click('button[type=submit]')
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

const pages = [
  ['02-home', '/'], ['03-search', '/search'], ['04-library', '/library'],
  ['05-history', '/history'], ['06-stats', '/stats'], ['07-charts', '/charts'],
  ['08-account', '/account'], ['09-liked', '/liked'], ['10-queue', '/queue'],
]
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800) // let charts and covers settle
  await shot(name)
  console.log('saved', name)
}
await browser.close()
