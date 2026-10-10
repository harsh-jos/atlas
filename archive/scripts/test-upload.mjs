// E2E check for image upload: drive the editor UI, then verify the asset serves.
// Usage: node scripts/test-upload.mjs <editUrl> <imagePath>
import { chromium } from 'playwright';

const url = process.argv[2];
const image = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.setInputFiles('input[type=file]', image);
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/editor.png' });

const body = await page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
const match = body.match(/\/assets\/[0-9a-f-]+/);
console.log('inserted-into-body:', Boolean(match), match ? match[0] : '');
if (match) {
  const resp = await page.request.get('http://localhost:3000' + match[0]);
  console.log('serve-status:', resp.status(), 'content-type:', resp.headers()['content-type']);
}
await browser.close();
