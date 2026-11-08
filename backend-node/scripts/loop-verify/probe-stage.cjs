/**
 * 渲染最新产物，量出每段实际高度 vs Figma 真值。
 * 用法：node /tmp/probe-latest.cjs <componentId> <groupId> <sessionId> [真值JSON]
 */
const puppeteer = require('/Users/smigoo/工作/mvgo/backend-node/node_modules/puppeteer-core');
const { existsSync } = require('fs');
const { execSync } = require('child_process');

const COMPONENT_ID = process.argv[2];
const GROUP_ID = process.argv[3] || '6a51f7caed28c5d5b13c61a5';
const SESSION_ID = process.argv[4] || '';
const TRUTH = process.argv[5] ? JSON.parse(process.argv[5]) : {};

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm64-*/chrome-mac-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of cands) {
    if (c.includes('*')) {
      try {
        const r = execSync(`ls -d ${c} 2>/dev/null | head -1`).toString().trim();
        if (r && existsSync(r)) return r;
      } catch { /* noop */ }
    } else if (existsSync(c)) return c;
  }
  return null;
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('no chrome'); process.exit(2); }
  const url = `http://localhost:2610/preview/${COMPONENT_ID}?groupId=${GROUP_ID}${SESSION_ID ? `&sessionId=${SESSION_ID}` : ''}`;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));

  const data = await page.evaluate(() => {
    const stage = document.querySelector('.mc-preview-stage') || document.querySelector('[class*="preview-stage"]');
    const root =
      stage?.querySelector('[class*="slot-con"]') ||
      stage?.querySelector('div > div') ||
      null;
    const host = stage?.firstElementChild;
    const gr = root?.getBoundingClientRect();
    const kids = root ? Array.from(root.children) : [];
    const pick = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 70),
        sectionId: el.getAttribute('data-section-id') || '',
        h: Math.round(r.height * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        y: Math.round(r.top * 10) / 10,
        flex: cs.flexGrow + ' ' + cs.flexShrink + ' ' + cs.flexBasis,
        marginTop: cs.marginTop,
        minHeight: cs.minHeight,
        overflow: cs.overflow,
        children: el.children.length,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      };
    };
    return {
      stageBox: stage ? { w: Math.round(stage.getBoundingClientRect().width), h: Math.round(stage.getBoundingClientRect().height) } : null,
      hostBox: host ? pick(host) : null,
      rootBox: root ? { cls: String(root.className).slice(0, 80), h: Math.round(gr.height * 10) / 10, scrollH: root.scrollHeight, clientH: root.clientHeight, overflow: getComputedStyle(root).overflow } : null,
      kids: kids.map(pick),
    };
  });
  await page.screenshot({ path: `/tmp/probe-${COMPONENT_ID}.png`, fullPage: false });
  console.log(JSON.stringify({ url, errs: errs.slice(0, 3), ...data }, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
