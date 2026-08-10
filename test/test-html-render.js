import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testHtmlRender() {
  const htmlPath = '/Users/smigoo/工作/mvgo/test/html-upload-test.html';
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  
  console.log('📄 读取 HTML 文件:', htmlPath);
  console.log('📏 HTML 大小:', (htmlContent.length / 1024).toFixed(2), 'KB');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // 设置视口
    await page.setViewport({ width: 1200, height: 800 });
    
    // 禁用 JavaScript（安全要求）
    await page.setJavaScriptEnabled(false);
    
    // 拦截网络请求（只允许 data: URL）
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('data:')) {
        req.continue();
      } else {
        req.abort();
      }
    });
    
    // 加载 HTML
    console.log('🚀 渲染 HTML...');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 截图
    const outputPath = '/Users/smigoo/工作/mvgo/test/html-render-preview.png';
    await page.screenshot({ 
      path: outputPath,
      fullPage: true
    });
    
    const stats = fs.statSync(outputPath);
    console.log('✅ 截图成功:', outputPath);
    console.log('📸 截图大小:', (stats.size / 1024).toFixed(2), 'KB');
    
    // 提取页面信息
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        hasChart: !!document.querySelector('.bar-chart'),
        hasStats: !!document.querySelector('.stats-grid'),
        statCount: document.querySelectorAll('.stat-item').length
      };
    });
    
    console.log('📊 页面信息:');
    console.log('  - 标题:', pageInfo.title);
    console.log('  - 尺寸:', pageInfo.width, 'x', pageInfo.height);
    console.log('  - 包含图表:', pageInfo.hasChart ? '是' : '否');
    console.log('  - 包含统计:', pageInfo.hasStats ? '是' : '否');
    console.log('  - 统计项数量:', pageInfo.statCount);
    
    return {
      success: true,
      outputPath,
      pageInfo
    };
    
  } finally {
    await browser.close();
  }
}

testHtmlRender()
  .then(result => {
    if (result.success) {
      console.log('\n✅ HTML 渲染测试通过');
      process.exit(0);
    } else {
      console.log('\n❌ HTML 渲染测试失败');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ 测试异常:', err.message);
    process.exit(1);
  });
