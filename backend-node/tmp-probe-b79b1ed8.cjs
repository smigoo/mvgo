const puppeteer = require('puppeteer');

(async () => {
  const url = 'http://localhost:2610/preview/c-device-monitor-b79b1ed8?groupId=6a51f7caed28c5d5b13c61a5&type=microcode';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const data = await page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        cls: String(el.className).slice(0, 60),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bgImage: cs.backgroundImage.slice(0, 140),
        bgSize: cs.backgroundSize,
        bgColor: cs.backgroundColor,
        display: cs.display,
        gridCols: cs.gridTemplateColumns,
        rows: cs.gridTemplateRows,
        overflow: cs.overflow,
        fontSize: cs.fontSize,
        color: cs.color,
      };
    };
    const root = document.querySelector('[class*="c-device-monitor-slot-con"]');
    const grid = document.querySelector('[data-section-id="2:8437"]');
    const cards = [...document.querySelectorAll('[class*="fg-grid-28437-card"]')].slice(0, 3).map(pick);
    const stats = [...document.querySelectorAll('[data-section-id="2:8787"],[data-section-id="2:8806"]')].map(pick);
    const tabs = document.querySelector('[data-section-id="89:37"]');
    return {
      root: pick(root),
      grid: pick(grid),
      cards,
      stats,
      tabs: pick(tabs),
      bodyScrollH: document.body.scrollHeight,
      cardCount: document.querySelectorAll('[class*="fg-grid-28437-card"]').length,
    };
  });

  console.log(JSON.stringify(data, null, 2));
  const el = await page.$('[class*="c-device-monitor-slot-con"]');
  if (el) await el.screenshot({ path: '/tmp/b79b1ed8-component.png' });
  await browser.close();
})().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
