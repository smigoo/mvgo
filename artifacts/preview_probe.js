const puppeteer = require('/Users/smigoo/工作/mvgo/backend-node/node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const consoleLogs = [];
  const pageErrors = [];
  const responses = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('/preview/')) {
      responses.push({ url, status: res.status() });
    }
  });

  await page.goto('http://127.0.0.1:2610/preview/mc-1785682311850-5e7d84d1', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 8000));

  const state = await page.evaluate(() => {
    const stage = document.querySelector('.mc-preview-stage');
    const rect = stage?.getBoundingClientRect?.();
    return {
      href: location.href,
      title: document.title,
      status: stage?.getAttribute('data-preview-status') || null,
      errorType: stage?.getAttribute('data-preview-error-type') || null,
      stageRect: rect ? { width: rect.width, height: rect.height } : null,
      hasLoginPage: !!document.querySelector('.login-page'),
      bodyText: document.body.innerText.slice(0, 500),
    };
  });

  console.log(JSON.stringify({ state, consoleLogs, pageErrors, responses }, null, 2));
  await browser.close();
})();
