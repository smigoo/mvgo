import puppeteer from 'puppeteer';

const url = process.argv[2];
const out = process.argv[3] || '/tmp/mvgo-preview.png';
const waitMs = parseInt(process.argv[4] || '8000', 10);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});
page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)));

console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('DOMContentLoaded, waiting', waitMs, 'ms for SPA render...');
await new Promise((r) => setTimeout(r, waitMs));

// 尝试等待预览容器
try {
  await page.waitForSelector('[class*="preview"], [class*="component"], iframe', { timeout: 10000 });
  console.log('Preview container found');
  await new Promise((r) => setTimeout(r, 3000));
} catch {
  console.log('No preview container found, taking screenshot anyway');
}

const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | '));
console.log('Body text preview:', bodyText);

const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});

await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ canvasInfo, consoleErrors: consoleErrors.slice(0, 5) }, null, 2));
await browser.close();
