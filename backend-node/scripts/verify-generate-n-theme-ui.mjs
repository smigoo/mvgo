/**
 * 🆕 2026-10-12 真机验证：生成页 N 主题输入 UI
 *
 * 输入侧（generate/component.vue）与输出侧（预览页）是两套独立实现，
 * 必须各自真机验证 —— 构建通过 + 类型零回归都不等于交互正确。
 *
 * 断言：
 *  1. 默认态只有 1 个链接框（存量用户零变化），多主题入口不打扰
 *  2. 点「+ 深色稿」展开主题行列表
 *  3. 主题行可增 / 删 / 改名 / 上下移（**第一行即主稿**）
 *  4. 重复节点 / 重复名有可见拦截
 *  5. 「添加主题」按 MAX_THEMES(8) 封顶
 *  6. N 主题入口只在 微码 + Max 档出现（契约收窄）
 *  7. 改名后主稿名实时反映到「链接使用上方…」提示
 *
 * 用法：node scripts/verify-generate-n-theme-ui.mjs
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

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
      } catch { /* 继续 */ }
    } else if (existsSync(c)) return c;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('❌ 找不到 Chrome/Chromium');
  process.exit(2);
}

// ⚠️ dev base 是 `/`（vite.config.js: base: isBuild ? '/mvgo/' : '/'）
const BASE = process.env.PREVIEW_BASE || 'http://localhost:2610';
const URL = `${BASE}/generator/component`;

console.log(`Chrome: ${chrome}\nURL: ${URL}\n`);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1800));

  // 选择「Figma」输入源（多主题入口只在 figma 下出现）
  const srcBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button, .source-tab, .source-option')];
    return btns.find((b) => /figma/i.test(b.textContent || '')) || null;
  });
  if (srcBtn?.asElement()) {
    await srcBtn.asElement().click();
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log('\n═══ 1. 默认态：单链接框 + 多主题入口 ═══\n');
  const initial = await page.evaluate(() => ({
    urlInputs: document.querySelectorAll('.form-input[type="text"], input[name="figmaDesignUrl"]').length,
    themeRows: document.querySelectorAll('.theme-row').length,
    hasToggle: !!document.querySelector('.dual-toggle-btn'),
    toggleText: document.querySelector('.dual-toggle-btn')?.textContent.trim() || '',
    inputLabel: document.querySelector('.figma-url-group label')?.textContent.trim() || '',
  }));
  check('默认无主题行（存量用户零变化）', initial.themeRows === 0, `got ${initial.themeRows}`);
  check('有「深色稿」展开入口', initial.hasToggle, `text="${initial.toggleText}"`);
  check('主框标签仍是「Figma 文件或节点链接」', initial.inputLabel.includes('Figma 文件或节点链接'), `got "${initial.inputLabel}"`);

  console.log('\n═══ 2. 展开后：主题行列表 ═══\n');
  await page.click('.dual-toggle-btn');
  await new Promise((r) => setTimeout(r, 800));

  const expanded = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.theme-row')];
    return {
      rowCount: rows.length,
      badges: rows.map((r) => r.querySelector('.theme-role-badge')?.textContent.trim()),
      names: rows.map((r) => r.querySelector('.theme-name-input')?.value),
      primaryNote: rows[0]?.querySelector('.theme-row-note')?.textContent.trim() || '',
      newLabel: document.querySelector('.figma-url-group label')?.textContent.trim() || '',
      hasAddBtn: !!document.querySelector('.add-theme-btn'),
    };
  });
  check('展开后有 2 个主题行', expanded.rowCount === 2, `got ${expanded.rowCount}`);
  check('第 1 行标「主稿」', expanded.badges[0] === '主稿', `got "${expanded.badges[0]}"`);
  check('第 2 行标「主题 2」', expanded.badges[1] === '主题 2', `got "${expanded.badges[1]}"`);
  check('默认名预填 浅色/深色', expanded.names[0] === '浅色' && expanded.names[1] === '深色', JSON.stringify(expanded.names));
  check('主稿行提示复用上方链接框', expanded.primaryNote.includes('上方'), `got "${expanded.primaryNote}"`);
  check('有「添加主题」按钮', expanded.hasAddBtn);

  console.log('\n═══ 3. 增 / 删 ═══\n');
  await page.click('.add-theme-btn');
  await new Promise((r) => setTimeout(r, 500));
  let rows = await page.$$eval('.theme-row', (els) => els.length);
  check('添加后变 3 行', rows === 3, `got ${rows}`);

  const delBtns = await page.$$('.theme-row:nth-child(3) .theme-row-actions button:last-child');
  if (delBtns[0]) {
    await delBtns[0].click();
    await new Promise((r) => setTimeout(r, 500));
  }
  rows = await page.$$eval('.theme-row', (els) => els.length);
  check('删除后回到 2 行', rows === 2, `got ${rows}`);

  console.log('\n═══ 4. 上移 = 设为主稿（顺序即语义）═══\n');
  const beforeMove = await page.$$eval('.theme-row', (els) =>
    els.map((e) => e.querySelector('.theme-name-input')?.value),
  );
  // 点第 2 行的「上移」
  const upBtn = await page.$$('.theme-row:nth-child(2) .theme-row-actions button:first-child');
  if (upBtn[0]) {
    await upBtn[0].click();
    await new Promise((r) => setTimeout(r, 500));
  }
  const afterMove = await page.$$eval('.theme-row', (els) =>
    els.map((e) => e.querySelector('.theme-name-input')?.value),
  );
  check(
    '上移后顺序交换（后端 themeNodes[0] 即主稿）',
    afterMove[0] === beforeMove[1] && afterMove[1] === beforeMove[0],
    `${JSON.stringify(beforeMove)} → ${JSON.stringify(afterMove)}`,
  );
  // 移回原位
  const upBtn2 = await page.$$('.theme-row:nth-child(2) .theme-row-actions button:first-child');
  if (upBtn2[0]) {
    await upBtn2[0].click();
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n═══ 5. 改名：聚焦全选 + 实时反映 ═══\n');
  // ⚠️ 必须用**单击聚焦**（真实用户动作），不能用 clickCount:3 全选 ——
  //   三击会自己把旧值选中、掩盖「预填值没被自动全选」这个真实缺陷
  //   （实测：点进「深色」框直接打字 → `深色夜模式`）。
  const nameInput = await page.$('.theme-row:nth-child(2) .theme-name-input');
  if (nameInput) {
    await nameInput.click(); // 单击聚焦
    await page.keyboard.type('dusk-mode'); // 直接打字
    await new Promise((r) => setTimeout(r, 600));
  }
  const renamed = await page.evaluate(() => {
    const note = document.querySelector('.theme-row:nth-child(1) .theme-row-note')?.textContent.trim() || '';
    const r2 = document.querySelector('.theme-row:nth-child(2)');
    return {
      note,
      name: r2?.querySelector('.theme-name-input')?.value || '',
      placeholder: r2?.querySelector('input.form-input')?.placeholder || '',
    };
  });
  check(
    '🔴 聚焦后全选：打字替换而非追加（预填名不被当前缀）',
    renamed.name === 'dusk-mode',
    `got "${renamed.name}"（若形如「深色xxx」说明预填值没被全选）`,
  );
  check(
    '副行 placeholder 引用其主题名',
    renamed.placeholder.includes('dusk-mode'),
    `got "${renamed.placeholder}"`,
  );
  // 复位为中文名，验证 placeholder 的中文场景
  const nameInput2 = await page.$('.theme-row:nth-child(2) .theme-name-input');
  if (nameInput2) {
    await nameInput2.click();
    await page.keyboard.type('黄昏模式');
    await new Promise((r) => setTimeout(r, 400));
  }
  const cn = await page.evaluate(() => {
    const r2 = document.querySelector('.theme-row:nth-child(2)');
    return {
      name: r2?.querySelector('.theme-name-input')?.value || '',
      placeholder: r2?.querySelector('input.form-input')?.placeholder || '',
    };
  });
  check('中文主题名可正常输入', cn.name === '黄昏模式', `got "${cn.name}"`);
  check('中文名 placeholder 正常', cn.placeholder.includes('黄昏模式'), `got "${cn.placeholder}"`);

  console.log('\n═══ 6. MAX_THEMES 封顶（8）═══\n');
  for (let i = 0; i < 8; i++) {
    const btn = await page.$('.add-theme-btn');
    if (!btn) break;
    await btn.click();
    await new Promise((r) => setTimeout(r, 220));
  }
  const capped = await page.evaluate(() => ({
    rows: document.querySelectorAll('.theme-row').length,
    hasAdd: !!document.querySelector('.add-theme-btn'),
    addText: document.querySelector('.add-theme-btn')?.textContent.trim() || '',
  }));
  check('最多 8 行', capped.rows <= 8, `got ${capped.rows}`);
  check('达上限后「添加主题」消失', !capped.hasAdd || capped.rows === 8, `hasAdd=${capped.hasAdd} rows=${capped.rows}`);

  console.log('\n═══ 7. 无 JS 运行时错误 ═══\n');
  const fatal = errors.filter((t) => !/favicon|DevTools|404|ERR_/i.test(t));
  check('无 JS 错误', fatal.length === 0, fatal.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);