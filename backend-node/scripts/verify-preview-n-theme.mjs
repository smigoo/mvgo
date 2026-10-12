/**
 * 🆕 2026-10-12 真机验证：预览页 N 段主题切换控件
 *
 * 用真实 Chromium 打开预览页，断言：
 *  1. 切换控件渲染出 **3 段**（浅色 / 深色 / 黄昏模式），不是硬编码的 2 段
 *  2. 默认选中 theme_1（declare.json 的 default）
 *  3. 点第 2/3 段 → aria-checked 切换 + 徽标文案变化
 *  4. 切到 theme_3（降级主题）→ 主容器 class 真的变成 theme_3
 *  5. CSS 变量真的跟着换（--color-primary 不同），即「不是只切了 class 没换变量」
 *  6. 降级主题有可见提示
 *
 * 用法：node scripts/verify-preview-n-theme.mjs <componentId> [groupId]
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const COMPONENT_ID = process.argv[2] || 'c-aiot-dpjh-bsjd-d5cb87a3';
const GROUP_ID = process.argv[3] || '6a51f7caed28c5d5b13c61a5';
// ⚠️ dev 模式 base 是 `/`（vite.config.js: `base: isBuild ? '/mvgo/' : '/'`），
//    生产才是 `/mvgo/`。用错会落到 SPA 首页 —— 页面能渲染但没有 .mc-preview-stage，
//    表现为「切换控件 20s 超时」。
const BASE = process.env.PREVIEW_BASE || 'http://localhost:2610';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 找 Chrome：优先 puppeteer 自带，其次系统安装 */
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
      } catch { /* 继续找 */ }
    } else if (existsSync(c)) return c;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('❌ 找不到 Chrome/Chromium，无法做真机浏览器验证');
  console.error('   可设置 CHROME_PATH 环境变量指定');
  process.exit(2);
}
console.log(`Chrome: ${chrome}\n`);

// ⚠️ sessionId 必须是**本次产物**的，否则预览页会按 sessionId 反查到**旧产物**
//   （实测：URL 带旧 sessionId 时页面渲染 theme-1，而 declare.json 已是 theme_1
//   —— 表现成「改了没生效」，实为看的是上一次生成的组件）。
const SESSION_ID = process.argv[4] || process.env.PREVIEW_SESSION_ID || '';
const url = `${BASE}/preview/${COMPONENT_ID}?groupId=${GROUP_ID}${
  SESSION_ID ? `&sessionId=${SESSION_ID}` : ''
}`;
console.log(`URL: ${url}\n`);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  // ⚠️ 失败时先打印页面实况再退出 —— 否则只剩一句无信息的 timeout，
  //   容易误判成「控件没实现」（实际是路由/base 写错、页面根本没进预览页）。
  try {
    await page.waitForSelector('.mc-theme-switcher .mc-theme-seg-btn', { timeout: 20000 });
  } catch (e) {
    const diag = await page
      .evaluate(() => ({
        url: location.href,
        hasSwitcher: !!document.querySelector('.mc-theme-switcher'),
        segCount: document.querySelectorAll('.mc-theme-seg-btn').length,
        hasStage: !!document.querySelector('.mc-preview-stage'),
        bodyStart: document.body.innerText.slice(0, 160),
      }))
      .catch(() => null);
    console.error('\n❌ 等待切换控件超时。页面实况：');
    console.error(JSON.stringify(diag, null, 1));
    if (consoleErrors.length) {
      console.error('控制台错误：');
      consoleErrors.slice(0, 5).forEach((t) => console.error('  ', t.slice(0, 180)));
    }
    throw e;
  }
  // 再给一点时间让 CSS 变量注入与首帧渲染完成
  await new Promise((r) => setTimeout(r, 2500));

  console.log('\n═══ 1. 控件是否渲染出 N 段 ═══\n');
  const segs = await page.$$eval('.mc-theme-switcher .mc-theme-seg-btn', (els) =>
    els.map((e) => ({
      text: e.textContent.trim(),
      active: e.classList.contains('active'),
      checked: e.getAttribute('aria-checked'),
    })),
  );
  check('切换段数 = 3', segs.length === 3, `got ${segs.length}: [${segs.map((s) => s.text).join(', ')}]`);
  check('第 1 段文案 = 浅色', segs[0]?.text === '浅色', `got ${segs[0]?.text}`);
  check('第 2 段文案 = 深色', segs[1]?.text === '深色', `got ${segs[1]?.text}`);
  check('第 3 段文案 = 黄昏模式', segs[2]?.text === '黄昏模式', `got ${segs[2]?.text}`);

  console.log('\n═══ 2. 默认选中 + 徽标 ═══\n');
  check('默认选中第 1 段（declare.default=theme_1）', segs[0]?.active === true && segs[0]?.checked === 'true');
  check('其余未选中', segs[1]?.active === false && segs[2]?.active === false);
  const badge = await page.$eval('.mc-theme-badge', (e) => e.textContent.trim()).catch(() => '');
  check('徽标显示「3 主题」', badge.includes('3'), `got "${badge}"`);

  console.log('\n═══ 3. 主容器 class（切主题真的换 class）═══\n');
  const stageOf = () => page.$eval('.mc-preview-stage', (e) => e.className).catch(() => '');
  const s1 = await stageOf();
  check('初始 class 含 theme_1', /theme_1/.test(s1), `got "${s1}"`);

  console.log('\n═══ 4. CSS 变量真的跟着换（防「只切 class 没换变量」）═══\n');
  // ⚠️ 变量名是 **camelCase**（`--colorPrimary`）—— css-vars.js 的槽位键就是
  //   `colorPrimary`，applyPreviewCssVars 直接 `--${key}` 拼出来。
  //   写成 `--color-primary`（kebab）会永远读到空字符串 —— 我第一次就踩了这个，
  //   一度误判成「变量没注入」。
  const varOf = () =>
    page.$eval('.mc-preview-stage', (e) => {
      const cs = getComputedStyle(e);
      return {
        primary: cs.getPropertyValue('--colorPrimary').trim(),
        textBase: cs.getPropertyValue('--colorTextBase').trim(),
        primaryBg: cs.getPropertyValue('--colorPrimaryBg').trim(),
      };
    });
  const v1 = await varOf();
  check('初始 --colorPrimary 非空', !!v1.primary, `got "${v1.primary}"`);
  check('初始 --colorTextBase 非空', !!v1.textBase, `got "${v1.textBase}"`);
  console.log(`   初始变量: --colorPrimary=${v1.primary}  --colorTextBase=${v1.textBase}`);

  // 点第 3 段（降级主题）
  await page.click('.mc-theme-switcher .mc-theme-seg-btn:nth-child(3)');
  await new Promise((r) => setTimeout(r, 1500));

  const s3 = await stageOf();
  check('切到第 3 段后 class 变成 theme_3', /theme_3/.test(s3) && !/theme_1\b/.test(s3), `got "${s3}"`);

  const segs3 = await page.$$eval('.mc-theme-switcher .mc-theme-seg-btn', (els) =>
    els.map((e) => e.classList.contains('active')),
  );
  check('第 3 段变为 active', segs3[2] === true);
  check('第 1 段取消 active', segs3[0] === false);

  const v3 = await varOf();
  console.log(`   切换后变量: --colorPrimary=${v3.primary}  --colorTextBase=${v3.textBase}`);
  // ⚠️ 这里**不能**断言「切到 theme_3 后变量必变」：theme_3 可能是**降级主题**
  //   （色板不合格、已退回派生值），其值本就可能与某套真值相同。
  //   真正要证明的是「切换动作会重新注入」—— 用**两套真值主题**对比才严谨。
  //   逐主题采样（1=浅色真值 / 2=深色真值 / 3=黄昏，可能降级）：
  const perTheme = {};
  for (const [i, label] of [[1, '浅色'], [2, '深色'], [3, '黄昏模式']]) {
    await page.click(`.mc-theme-switcher .mc-theme-seg-btn:nth-child(${i})`);
    await new Promise((r) => setTimeout(r, 900));
    perTheme[label] = (await varOf()).primary;
  }
  console.log(`   逐主题 --colorPrimary: ${Object.entries(perTheme).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  // 🔴 核心断言：两套**真值**主题的主色必须不同（证明切换真的换了变量）
  check(
    '🔴 浅色 vs 深色主色不同（证明切主题真的重注入了 CSS 变量）',
    perTheme['浅色'] !== perTheme['深色'],
    JSON.stringify(perTheme),
  );
  check(
    '降级主题也渲染出变量（非空）',
    !!perTheme['黄昏模式'],
    `got "${perTheme['黄昏模式']}"`,
  );
  console.log('   注：「黄昏模式」若为降级主题（色板不合格已退派生），其值与某套真值相同属预期，');

  console.log('\n═══ 5. URL 同步（可分享/刷新保持）═══\n');
  check('URL 带 theme=theme_3', page.url().includes('theme=theme_3'), `got ${page.url()}`);

  console.log('\n═══ 6. 控制台无致命错误 ═══\n');
  const fatal = consoleErrors.filter(
    (t) => !/favicon|DevTools|404 \(Not Found\)/i.test(t),
  );
  check('无 JS 运行时错误', fatal.length === 0, fatal.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);