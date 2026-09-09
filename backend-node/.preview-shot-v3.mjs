import puppeteer from 'puppeteer';

const url = process.argv[2];
const out = process.argv[3] || '/tmp/mvgo-preview.png';
const waitMs = parseInt(process.argv[4] || '12000', 10);

console.log('Launching browser...');
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

console.log('Waiting for SPA initialization...');
await new Promise((r) => setTimeout(r, waitMs));

// Try to wait for preview component or error card
try {
  await page.waitForSelector(
    '.mc-preview-component-root, .mc-preview-error-card, [data-preview-status="ready"]',
    { timeout: 10000 }
  );
  console.log('Preview component or error card detected');
  await new Promise((r) => setTimeout(r, 2000));
} catch (e) {
  console.log('No preview component detected, taking screenshot anyway');
}

// Check for canvas (echarts)
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});

// Get page title and URL
const pageInfo = await page.evaluate(() => {
  return {
    title: document.title,
    url: window.location.href,
    bodyText: document.body.innerText.substring(0, 200),
  };
});

console.log('Page info:', JSON.stringify(pageInfo, null, 2));
console.log('Canvas info:', JSON.stringify(canvasInfo, null, 2));

await page.screenshot({ path: out, fullPage: true });
console.log('Screenshot saved to:', out);

await browser.close();
