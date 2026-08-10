#!/usr/bin/env node
/**
 * 全自动测试-修复循环系统
 * 
 * 功能：
 * 1. 自动启动后端服务
 * 2. 遍历所有 12 种组合（6 单组件 + 6 批量）
 * 3. 收集错误并自动修复
 * 4. 重试失败项
 * 5. 生成完整测试报告
 * 
 * 运行方式：
 * node scripts/auto-test-loop.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// 配置
const CONFIG = {
  backendPort: 13030,
  frontendPort: 2610,
  maxRetries: 3,
  timeoutMs: 300000, // 5 分钟
  reportDir: path.join(__dirname, '../test-output'),
  logFile: path.join(__dirname, '../test-output/auto-test.log'),
  auth: {
    username: 'admin',
    password: 'Admin123!'
  }
};

// 全局 session cookie
let sessionCookie = null;

// 测试矩阵
const TEST_MATRIX = [
  // 单组件 × 6
  { mode: 'single', source: 'screenshot', type: 'vue3', tier: 'lite', name: '弹窗2.png', file: 'test/弹窗2.png' },
  { mode: 'single', source: 'screenshot', type: 'microcode', tier: 'lite', name: 'cp-环境监测.png', file: 'test/cp-环境监测.png' },
  { mode: 'single', source: 'figma', type: 'vue3', tier: 'lite', name: '运行监测-7879', figmaUrl: 'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-7879' },
  { mode: 'single', source: 'figma', type: 'vue3', tier: 'max', name: '运行监测-8417', figmaUrl: 'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-8417' },
  { mode: 'single', source: 'figma', type: 'microcode', tier: 'lite', name: '智慧养护-98934', figmaUrl: 'https://www.figma.com/design/My711tWcrpjOZlFBmz5y1B/?node-id=1-98934' },
  { mode: 'single', source: 'figma', type: 'microcode', tier: 'max', name: '智慧养护-98934', figmaUrl: 'https://www.figma.com/design/My711tWcrpjOZlFBmz5y1B/?node-id=1-98934' },
  
  // 批量 × 6（打包前 3 个）
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'lite', name: '批量-截图混合', items: [
    { source: 'screenshot', type: 'vue3', tier: 'lite', file: 'test/弹窗2.png' },
    { source: 'screenshot', type: 'microcode', tier: 'lite', file: 'test/cp-环境监测.png' },
  ]},
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'lite', name: '批量-Figma Vue3', items: [
    { source: 'figma', type: 'vue3', tier: 'lite', figmaUrl: 'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-7879' },
  ]},
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'max', name: '批量-Figma Vue3 Max', items: [
    { source: 'figma', type: 'vue3', tier: 'max', figmaUrl: 'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-8417' },
  ]},
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'lite', name: '批量-Figma 微码', items: [
    { source: 'figma', type: 'microcode', tier: 'lite', figmaUrl: 'https://www.figma.com/design/My711tWcrpjOZlFBmz5y1B/?node-id=1-98934' },
  ]},
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'max', name: '批量-Figma 微码 Max', items: [
    { source: 'figma', type: 'microcode', tier: 'max', figmaUrl: 'https://www.figma.com/design/My711tWcrpjOZlFBmz5y1B/?node-id=1-98934' },
  ]},
  { mode: 'batch', source: 'mixed', type: 'mixed', tier: 'lite', name: '批量-全混合', items: [
    { source: 'screenshot', type: 'vue3', tier: 'lite', file: 'test/弹窗2.png' },
    { source: 'screenshot', type: 'microcode', tier: 'lite', file: 'test/cp-设备监测.png' },
    { source: 'figma', type: 'vue3', tier: 'lite', figmaUrl: 'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-7879' },
  ]},
];

// 登录函数
async function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(CONFIG.auth);
    
    const options = {
      hostname: 'localhost',
      port: CONFIG.backendPort,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            // 提取 session cookie
            const cookies = res.headers['set-cookie'];
            if (cookies && cookies.length > 0) {
              sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
              logger.info('登录成功', { user: result.user, cookie: sessionCookie });
              resolve(result);
            } else {
              reject(new Error('未获取到 session cookie'));
            }
          } else {
            reject(new Error(result.message || '登录失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 日志工具
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
  }
  
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
    this.stream.write(logLine);
    console.log(logLine.trim());
  }
  
  info(msg, data) { this.log('INFO', msg, data); }
  error(msg, data) { this.log('ERROR', msg, data); }
  success(msg, data) { this.log('SUCCESS', msg, data); }
  warn(msg, data) { this.log('WARN', msg, data); }
  
  close() { this.stream.end(); }
}

const logger = new Logger(CONFIG.logFile);

// HTTP 请求工具（自动携带 session cookie）
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers = { ...options.headers };
    // 自动注入认证 cookie（login 接口本身不需要）
    if (sessionCookie && !url.includes('/auth/login')) {
      headers['Cookie'] = sessionCookie;
    }
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers,
      timeout: CONFIG.timeoutMs,
    };
    
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// 等待服务启动
async function waitForService(port, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await httpRequest(`http://localhost:${port}/`);
      if (res.status < 500) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// 启动后端服务
async function startBackend() {
  logger.info('启动后端服务...');
  
  const backendDir = path.join(__dirname, '../backend-node');
  const proc = spawn('npm', ['run', 'start:dev'], {
    cwd: backendDir,
    detached: true,
    stdio: 'ignore',
  });
  
  proc.unref();
  logger.info('后端进程已启动 (PID: ' + proc.pid + ')');
  
  const ready = await waitForService(CONFIG.backendPort, 90000);
  if (!ready) {
    throw new Error('后端服务启动超时');
  }
  
  logger.success('后端服务已就绪');
  return proc;
}

// 执行单个测试
async function runTest(testCase) {
  const startTime = Date.now();
  const result = {
    testCase,
    status: 'pending',
    sessionId: null,
    duration: 0,
    error: null,
    retryCount: 0,
    outputPath: null,
  };
  
  logger.info(`开始测试: ${testCase.name} (${testCase.mode}/${testCase.source}/${testCase.type}/${testCase.tier})`);
  
  try {
    if (testCase.mode === 'single') {
      // 单组件测试
      const body = {
        sourceType: testCase.source,
        componentType: testCase.type,
        generationTier: testCase.tier,
      };
      
      if (testCase.source === 'screenshot') {
        const imagePath = path.join(__dirname, '..', testCase.file);
        if (!fs.existsSync(imagePath)) {
          throw new Error(`截图文件不存在: ${imagePath}`);
        }
        const imageBuffer = fs.readFileSync(imagePath);
        body.imageBase64 = imageBuffer.toString('base64');
        body.componentName = testCase.name.replace('.png', '');
      } else if (testCase.source === 'figma') {
        body.figmaUrl = testCase.figmaUrl;
        body.componentName = testCase.name;
      }
      
      const res = await httpRequest('http://localhost:13030/api/lite/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      
      if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
        throw new Error(`API 返回错误: ${res.status} - ${JSON.stringify(res.data)}`);
      }
      
      result.sessionId = res.data.sessionId || res.data.taskId;
      logger.info(`任务已提交: ${result.sessionId}`);
      
      // 轮询任务状态（优先 progress 免认证端点，兜底 tasks/status 需认证）
      let completed = false;
      let pollCount = 0;
      while (!completed && pollCount < 90) {
        await new Promise(r => setTimeout(r, 5000));
        pollCount++;
        
        // 1) 优先读 progress 端点（免认证，SSE 格式）
        let taskStatus = null;
        let taskError = null;
        try {
          const progressRes = await httpRequest(`http://localhost:13030/api/progress/${result.sessionId}`);
          if (progressRes.status === 200) {
            // SSE 响应格式：data: {...}\n\ndata: {...}\n
            let progressData = progressRes.data;
            if (typeof progressData === 'string') {
              const lines = progressData.split('\n').filter(l => l.startsWith('data: '));
              const events = lines.map(l => { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter(Boolean);
              // 找最终态事件
              const completeEvent = events.find(e => e.type === 'complete');
              const errorEvent = events.find(e => e.type === 'error');
              const statusEvent = events.find(e => e.type === 'task-status');
              
              if (completeEvent) {
                taskStatus = 'completed';
                result.outputPath = completeEvent.workspacePath || completeEvent.outputPath;
              } else if (errorEvent) {
                taskStatus = 'failed';
                taskError = errorEvent.message || errorEvent.error;
              } else if (statusEvent) {
                taskStatus = statusEvent.status;
              }
            } else if (Array.isArray(progressData)) {
              const last = progressData[progressData.length - 1];
              if (last) {
                if (last.type === 'complete') taskStatus = 'completed';
                else if (last.type === 'error') { taskStatus = 'failed'; taskError = last.message || last.error; }
                else if (last.type === 'task-status') taskStatus = last.status;
              }
            }
          }
        } catch (e) {}
        
        // 2) progress 未拿到最终态，用认证端点兜底
        if (!taskStatus) {
          try {
            const statusRes = await httpRequest(`http://localhost:13030/api/tasks/status/${result.sessionId}`);
            if (statusRes.status === 200) {
              taskStatus = statusRes.data.status;
              taskError = statusRes.data.error || statusRes.data.lastError;
            }
          } catch (e) {}
        }
        
        if (taskStatus === 'completed') {
          completed = true;
          result.status = 'success';
          // 查找 workspace 输出路径
          try {
            const statusRes = await httpRequest(`http://localhost:13030/api/tasks/status/${result.sessionId}`);
            result.outputPath = statusRes.data?.result?.outputPath || statusRes.data?.outputPath || null;
          } catch (e) {}
          logger.success(`测试成功: ${testCase.name}`, { sessionId: result.sessionId, outputPath: result.outputPath });
        } else if (taskStatus === 'failed' || taskStatus === 'cancelled') {
          throw new Error(`任务失败: ${taskError || '未知错误'}`);
        } else if (taskStatus) {
          logger.info(`任务进行中: ${taskStatus} (${pollCount * 5}s)`);
        } else {
          logger.info(`等待任务状态... (${pollCount * 5}s)`);
        }
      }
      
      if (!completed) {
        throw new Error('任务超时（7.5 分钟）');
      }
      
    } else if (testCase.mode === 'batch') {
      // 批量测试
      const items = testCase.items.map((item, idx) => {
        if (item.source === 'screenshot') {
          const imagePath = path.join(__dirname, '..', item.file);
          const imageBuffer = fs.readFileSync(imagePath);
          return {
            sourceType: 'screenshot',
            componentType: item.type,
            generationTier: item.tier,
            imageData: `data:image/png;base64,${imageBuffer.toString('base64')}`,
            componentName: item.file.replace('.png', ''),
          };
        } else if (item.source === 'figma') {
          return {
            sourceType: 'figma',
            componentType: item.type,
            generationTier: item.tier,
            figmaUrl: item.figmaUrl,
            componentName: `batch-item-${idx}`,
          };
        }
      });
      
      const res = await httpRequest('http://localhost:13030/api/lite/batch/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { items },
      });
      
      if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
        throw new Error(`批量 API 返回错误: ${res.status} - ${JSON.stringify(res.data)}`);
      }
      
      result.sessionId = res.data.batchId || res.data.sessionId;
      logger.info(`批量任务已提交: ${result.sessionId}`);
      
      // 轮询批量任务状态（用 progress 端点 + tasks/status 兜底）
      let completed = false;
      let pollCount = 0;
      let lastCompletedCount = 0;
      while (!completed && pollCount < 120) {
        await new Promise(r => setTimeout(r, 5000));
        pollCount++;
        
        // 查批量状态（认证端点）
        let batchData = null;
        try {
          const statusRes = await httpRequest(`http://localhost:13030/api/lite/batch/${result.sessionId}`);
          if (statusRes.status === 200) batchData = statusRes.data;
        } catch (e) {}
        
        if (batchData) {
          if (batchData.status === 'completed') {
            completed = true;
            result.status = 'success';
            result.outputPath = batchData.results?.map(r => r.outputPath).filter(Boolean);
            logger.success(`批量测试成功: ${testCase.name}`, { batchId: result.sessionId, outputs: result.outputPath });
          } else if (batchData.status === 'failed' || batchData.status === 'cancelled') {
            throw new Error(`批量任务失败: ${batchData.error || '未知错误'}`);
          } else {
            const completedCount = batchData.tasks?.filter(t => t.status === 'completed').length || 0;
            const totalCount = batchData.tasks?.length || 0;
            if (completedCount !== lastCompletedCount) {
              logger.info(`批量任务进行中: ${completedCount}/${totalCount} (${pollCount * 5}s)`);
              lastCompletedCount = completedCount;
            }
          }
        } else {
          logger.info(`等待批量任务状态... (${pollCount * 5}s)`);
        }
      }
      
      if (!completed) {
        throw new Error('批量任务超时（10 分钟）');
      }
    }
    
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    result.duration = Date.now() - startTime;
    logger.error(`测试失败: ${testCase.name}`, { error: error.message, stack: error.stack });
  }
  
  result.duration = Date.now() - startTime;
  return result;
}

// 自动修复逻辑
async function autoFix(testCase, error) {
  logger.warn(`尝试自动修复: ${testCase.name}`, { error });
  
  // 常见错误修复
  if (error.includes('ECONNREFUSED') || error.includes('502')) {
    logger.info('检测到后端服务挂掉，重启...');
    await startBackend();
    return true;
  }
  
  if (error.includes('429') || error.includes('rate limit')) {
    logger.warn('触发限流，等待 60 秒后重试...');
    await new Promise(r => setTimeout(r, 60000));
    return true;
  }
  
  if (error.includes('timeout')) {
    logger.warn('任务超时，可能是模型响应慢，继续重试...');
    return true;
  }
  
  if (error.includes('figma') || error.includes('Figma')) {
    logger.error('Figma API 错误，跳过此项');
    return false;
  }
  
  // 其他错误，重试一次
  return true;
}

// 生成测试报告
function generateReport(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(CONFIG.reportDir, `test-report-${timestamp}.md`);
  
  const totalTests = results.length;
  const passedTests = results.filter(r => r.status === 'success').length;
  const failedTests = results.filter(r => r.status === 'failed').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  let report = `# 自动化测试报告\n\n`;
  report += `**生成时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
  report += `## 📊 概览\n\n`;
  report += `- **总测试数**: ${totalTests}\n`;
  report += `- **通过**: ${passedTests} ✅\n`;
  report += `- **失败**: ${failedTests} ❌\n`;
  report += `- **通过率**: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`;
  report += `- **总耗时**: ${(totalDuration / 1000 / 60).toFixed(1)} 分钟\n\n`;
  
  report += `## 📋 详细结果\n\n`;
  report += `| # | 名称 | 模式 | 来源 | 类型 | 规格 | 状态 | 耗时 | 重试 |\n`;
  report += `|---|------|------|------|------|------|------|------|------|\n`;
  
  results.forEach((r, idx) => {
    const status = r.status === 'success' ? '✅' : '❌';
    const duration = (r.duration / 1000).toFixed(1) + 's';
    report += `| ${idx + 1} | ${r.testCase.name} | ${r.testCase.mode} | ${r.testCase.source} | ${r.testCase.type} | ${r.testCase.tier} | ${status} | ${duration} | ${r.retryCount} |\n`;
  });
  
  if (failedTests > 0) {
    report += `\n## ❌ 失败详情\n\n`;
    results.filter(r => r.status === 'failed').forEach((r, idx) => {
      report += `### ${idx + 1}. ${r.testCase.name}\n\n`;
      report += `- **Session ID**: ${r.sessionId || 'N/A'}\n`;
      report += `- **错误**: ${r.error}\n`;
      report += `- **耗时**: ${(r.duration / 1000).toFixed(1)}s\n\n`;
    });
  }
  
  if (passedTests > 0) {
    report += `\n## ✅ 成功输出\n\n`;
    results.filter(r => r.status === 'success').forEach((r, idx) => {
      report += `### ${idx + 1}. ${r.testCase.name}\n\n`;
      report += `- **Session ID**: ${r.sessionId}\n`;
      if (r.outputPath) {
        if (Array.isArray(r.outputPath)) {
          report += `- **输出文件**:\n`;
          r.outputPath.forEach(p => report += `  - \`${p}\`\n`);
        } else {
          report += `- **输出文件**: \`${r.outputPath}\`\n`;
        }
      }
      report += `- **耗时**: ${(r.duration / 1000).toFixed(1)}s\n\n`;
    });
  }
  
  report += `\n---\n**测试完成时间**: ${new Date().toLocaleString('zh-CN')}\n`;
  
  fs.writeFileSync(reportPath, report, 'utf-8');
  logger.success(`测试报告已生成: ${reportPath}`);
  
  return reportPath;
}

// 主循环
async function main() {
  logger.info('=== 自动化测试循环启动 ===');
  
  // 启动后端
  try {
    await startBackend();
  } catch (error) {
    logger.error('后端启动失败', { error: error.message });
    process.exit(1);
  }
  
  // 登录获取 session
  try {
    await login();
  } catch (error) {
    logger.error('登录失败', { error: error.message });
    process.exit(1);
  }
  
  // 执行测试
  const results = [];
  const failedTests = [];
  
  for (const testCase of TEST_MATRIX) {
    let testResult = await runTest(testCase);
    results.push(testResult);
    
    // 失败时自动修复并重试
    if (testResult.status === 'failed') {
      const canFix = await autoFix(testCase, testResult.error);
      if (canFix && testResult.retryCount < CONFIG.maxRetries) {
        testResult.retryCount++;
        logger.info(`重试测试: ${testCase.name} (第 ${testResult.retryCount} 次)`);
        await new Promise(r => setTimeout(r, 5000)); // 等待 5 秒
        testResult = await runTest(testCase);
        results[results.length - 1] = testResult;
      }
    }
  }
  
  // 生成报告
  const reportPath = generateReport(results);
  
  logger.info('=== 自动化测试循环完成 ===');
  logger.info(`报告位置: ${reportPath}`);
  
  logger.close();
  
  // 输出摘要到控制台
  console.log('\n' + '='.repeat(60));
  console.log('测试完成！');
  console.log(`报告: ${reportPath}`);
  console.log('='.repeat(60) + '\n');
}

// 运行
main().catch(error => {
  logger.error('主循环异常', { error: error.message, stack: error.stack });
  process.exit(1);
});
