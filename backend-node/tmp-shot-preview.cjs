/**
 * 一次性截图：预览页组件 vs 设计稿（本轮验证用，不入库）
 * 用法：node tmp-shot-preview.cjs <componentId> <groupId> <sessionId> <outPath>
 */
const puppeteer = require('puppeteer-core');
const { existsSync } = require('fs');
const { execSync } = require('child_process');

const [, , COMPONENT_ID, GROUP_ID, SESSION_ID, OUT] = process.argv;

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
      } catch {}
    } else if (existsSync(c)) return c;
  }
  return null;
}

(async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.error('NO_CHROME');
    process.exit(2);
  }
  const url = `http://localhost:2610/preview/${COMPONENT_ID}?groupId=${GROUP_ID}&sessionId=${SESSION_ID}`;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.mc-preview-stage', { timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3500));
    const stage = await page.$('.mc-preview-stage');
    if (stage) await stage.screenshot({ path: OUT });
    else await page.screenshot({ path: OUT });
    const info = await page.evaluate(() => ({
      url: location.href,
      hasStage: !!document.querySelector('.mc-preview-stage'),
      text: (document.body.innerText || '').slice(0, 300),
      sections: Array.from(document.querySelectorAll('[data-section-id]')).map((e) => e.getAttribute('data-section-id')),
    }));
    console.log('SHOT_OK', OUT);
    console.log(JSON.stringify(info, null, 1));
  } catch (e) {
    console.error('SHOT_FAIL', e.message);
    if (errs.length) console.error(errs.slice(0, 5).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
