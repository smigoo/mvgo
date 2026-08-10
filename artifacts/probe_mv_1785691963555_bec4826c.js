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
  const failedRequests = [];

  page.on('console', async (msg) => {
    const location = msg.location();
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location,
    });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message || String(err), stack: err.stack || '' });
  });
  page.on('response', (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 || url.includes('/preview/') || url.includes('/workspace/') || url.includes('/src/') || url.includes('/node_modules/')) {
      responses.push({ url, status, resourceType: res.request().resourceType() });
    }
  });
  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'request failed', resourceType: req.resourceType() });
  });

  const url = 'http://127.0.0.1:2610/preview/mv-1785691963555-bec4826c?type=vue3&groupId=6a51f7caed28c5d5b13c61a5';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
      bodyText: document.body.innerText.slice(0, 800),
    };
  });

  console.log(JSON.stringify({ state, consoleLogs, pageErrors, responses, failedRequests }, null, 2));
  await browser.close();
})();
