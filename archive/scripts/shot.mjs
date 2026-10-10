// Dev-only screenshot helper: slices a page into readable vertical chunks.
// Usage: node scripts/shot.mjs <url> <outPrefix>
import { chromium } from 'playwright';

const url = process.argv[2];
const out = process.argv[3] ?? '/tmp/shot';
const WIDTH = Number(process.argv[4]) || 960;
const SLICE = Number(process.argv[5]) || 1000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: SLICE }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.error('console.error:', m.text()));
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const height = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < height; y += SLICE) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}-${i}.png` });
  i += 1;
}
console.log(`slices=${i} height=${height}`);
await browser.close();
