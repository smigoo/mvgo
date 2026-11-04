'use strict';
/**
 * 运行监测大屏原型 · 本地 Mock HTTP/WS 服务（S3）
 *
 * 零依赖：只用 node:http / node:fs / node:path / node:crypto / node:url。
 * 唯一口径：../CONTRACT.md（§1 响应信封、§2 分页、§4 接口清单）。
 * 启动：node mock/server.js → http://127.0.0.1:8791/
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const D = require('./data.js');

const HOST = '127.0.0.1';
const PORT = 8791;
const WEB_DIR = path.resolve(__dirname, '..', 'web');
const WS_PATH = '/ws/detection/event';

/* ------------------------------------------------------------------ *
 * 1. 响应信封（CONTRACT §1）与入参校验
 * ------------------------------------------------------------------ */

function ok(data) {
  return { code: 200, message: 'ok', data: data === undefined ? {} : data };
}
function fail(code, message) {
  return { code, message, data: null };
}

/** 依次检查必填参数，返回第一个缺失项的错误信封；全部存在返回 null */
function requireParams(url, names) {
  for (let i = 0; i < names.length; i++) {
    const v = url.searchParams.get(names[i]);
    if (v === null || String(v).trim() === '') {
      return fail(400, '缺少必填参数 ' + names[i]);
    }
  }
  return null;
}

/** sectionNum 支持重复传参与逗号分隔 */
function sectionNumsOf(url) {
  return D.parseSectionNums(url.searchParams.getAll('sectionNum'));
}

function checkSections(nums) {
  if (!nums.length) return fail(400, '缺少必填参数 sectionNum');
  for (let i = 0; i < nums.length; i++) {
    if (!D.resolveSection(nums[i])) return fail(400, '路段编码不存在: ' + nums[i]);
  }
  return null;
}

function pageParams(url) {
  const pageNum = url.searchParams.get('pageNum');
  const pageSize = url.searchParams.get('pageSize');
  return {
    pageNum: pageNum === null || pageNum === '' ? 1 : parseInt(pageNum, 10),
    pageSize: pageSize === null || pageSize === '' ? 20 : parseInt(pageSize, 10)
  };
}

/* ------------------------------------------------------------------ *
 * 2. 路由表（25 个 HTTP + 1 个 WS）
 * ------------------------------------------------------------------ */

const ROUTES = [];

function route(method, p, source, handler) {
  ROUTES.push({ method, path: p, source, handler });
}

/* -------------------- §4.1 有文档依据（16 HTTP） -------------------- */

// #1 D1 当日总流量
route('GET', '/operation/flow/todayFlow', 'D1', (url) => {
  const nums = sectionNumsOf(url);
  const err = checkSections(nums);
  if (err) return err;
  const typeRaw = url.searchParams.get('type');
  const type = typeRaw === null || typeRaw === '' ? 1 : parseInt(typeRaw, 10);
  if (type !== 1 && type !== 2) return fail(400, '参数 type 非法，仅支持 1(24小时)/2(就近一小时)');
  return ok(D.buildTodayFlow(nums, type));
});

// #2 D2 车型分布概览
route('GET', '/operation/flow/todayVehicleTypeStatic', 'D2', (url) => {
  const nums = sectionNumsOf(url);
  const err = checkSections(nums);
  if (err) return err;
  return ok(D.buildVehicleType(nums));
});

// #3 D2 车型细分散点趋势
route('GET', '/operation/flow/todayVehicleTypeTrend', 'D2', (url) => {
  const nums = sectionNumsOf(url);
  const err = checkSections(nums);
  if (err) return err;
  const typeRaw = url.searchParams.get('type');
  const type = typeRaw === null || typeRaw === '' ? 1 : parseInt(typeRaw, 10);
  if (type !== 1 && type !== 2) return fail(400, '参数 type 非法，仅支持 1(按小时)/2(按15分钟)');
  return ok(D.buildVehicleTypeTrend(nums, type));
});

// #4 D3 实时流量预测
route('GET', '/operation/forecast/realtime', 'D3', (url) => {
  const err = requireParams(url, ['sectionNum']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  return ok(D.buildRealtime(nums[0]));
});

// #5 D3 按小时统计
route('GET', '/operation/forecast/staticsByHour', 'D3', (url) => {
  const err = requireParams(url, ['sectionNum', 'startTime', 'endTime']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  return ok(D.buildStaticsByHour(nums[0], url.searchParams.get('startTime'), url.searchParams.get('endTime')));
});

// #6 D3 按日统计
route('GET', '/operation/forecast/staticsByDay', 'D3', (url) => {
  const err = requireParams(url, ['sectionNum', 'startDate', 'endDate']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  return ok(D.buildStaticsByDay(nums[0], url.searchParams.get('startDate'), url.searchParams.get('endDate')));
});

// #7 D3 节假日列表（无入参）
route('GET', '/operation/forecast/holiday', 'D3', () => ok(D.buildHoliday()));

// #8 D5 重点车辆类型统计
route('GET', '/operation/point/pointTypeStatics', 'D5', (url) => {
  const err = requireParams(url, ['sectionNum']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  return ok(D.buildPointTypeStatics(nums[0]));
});

// #9 D6 车辆明细（真分页）
route('GET', '/operation/point/pointCarDetail', 'D6', (url) => {
  const err = requireParams(url, ['sectionNum', 'carType']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;

  const carType = String(url.searchParams.get('carType')).trim();
  if (carType !== '1' && carType !== '2') {
    return fail(400, '参数 carType 非法，仅支持 1(重型货车)/2(超高车辆)');
  }
  const direction = url.searchParams.get('direction') || '';
  if (direction && direction !== '1' && direction !== '2') {
    return fail(400, '参数 direction 非法，仅支持 1(上行)/2(下行)');
  }
  const rows = D.buildCarDetailRows(nums[0], carType, direction, url.searchParams.get('licensePlate'));
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(rows, pageNum, pageSize));
});

// #10 D6 危化品运送类型分布
route('GET', '/operation/point/hazardousTypeDistribution', 'D6', (url) => {
  const err = requireParams(url, ['sectionNum']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  const direction = url.searchParams.get('direction') || '';
  if (direction && direction !== '1' && direction !== '2') {
    return fail(400, '参数 direction 非法，仅支持 1(上行)/2(下行)');
  }
  return ok(D.buildHazardousTypeDistribution(nums[0], direction));
});

// #11 D7 危化品运单列表（真分页）
route('GET', '/operation/point/wayBillRecord', 'D7', (url) => {
  const rows = D.buildWaybillRows(url.searchParams.get('licensePlate') || '');
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(rows, pageNum, pageSize));
});

// #12 D8 智能侦测事件列表（真分页）
route('GET', '/operation/detection/eventList', 'D8', (url) => {
  const err = requireParams(url, ['sectionNum']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;

  const eventType = url.searchParams.get('eventType') || '';
  if (eventType && !D.EVENT_TYPES.some((t) => t.code === eventType)) {
    return fail(400, '参数 eventType 非法，可选值: ' + D.EVENT_TYPES.map((t) => t.code).join('/'));
  }
  const rows = D.buildEventRows(nums[0], eventType || null);
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(rows, pageNum, pageSize));
});

// #13 WS /ws/detection/event —— 在 upgrade 事件中处理，不占 HTTP 路由表

// #14 D9 告警详情
route('GET', '/operation/detection/alertDetail', 'D9', (url) => {
  const err = requireParams(url, ['eventId']);
  if (err) return err;
  return ok(D.buildAlertDetail(String(url.searchParams.get('eventId')).trim()));
});

// #15 D9 提交告警处置记录
route('POST', '/operation/detection/alertDisposal', 'D9', (url, body) => {
  const miss = ['eventId', 'handleTime', 'handleContent'].filter(
    (k) => body[k] === undefined || body[k] === null || String(body[k]).trim() === ''
  );
  if (miss.length) return fail(400, '缺少必填参数 ' + miss[0]);
  return ok({});
});

// #16 D9 处置完成
route('POST', '/operation/detection/eventComplete', 'D9', (url, body) => {
  if (body.eventId === undefined || body.eventId === null || String(body.eventId).trim() === '') {
    return fail(400, '缺少必填参数 eventId');
  }
  return ok({});
});

// #17 D10 环境监测（maxThreshold/minThreshold 可为 null）
route('GET', '/operation/device/monitor', 'D10', (url) => {
  const err = requireParams(url, ['sectionNum', 'productCode', 'monitorType']);
  if (err) return err;
  const nums = sectionNumsOf(url);
  const secErr = checkSections(nums.slice(0, 1));
  if (secErr) return secErr;
  const productCode = String(url.searchParams.get('productCode')).trim();
  const monitorType = String(url.searchParams.get('monitorType')).trim();
  return ok(D.buildDeviceMonitor(nums[0], productCode, monitorType));
});

/* -------------------- §4.2 文档缺失、自拟（8 HTTP） -------------------- */

// #18 设备分页列表
route('GET', '/operation/device/list', '#18', (url) => {
  const nums = sectionNumsOf(url);
  const useNum = nums.length ? nums[0] : 'S001';
  const err = checkSections([useNum]);
  if (err) return err;

  let rows = D.buildDeviceRows(useNum);
  const status = url.searchParams.get('status');
  const keyword = url.searchParams.get('keyword');
  if (status) rows = rows.filter((r) => r.status === status);
  if (keyword) rows = rows.filter((r) => r.deviceName.indexOf(keyword) >= 0 || r.deviceCode.indexOf(keyword) >= 0);
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(rows, pageNum, pageSize));
});

// #19 设备详情
route('GET', '/operation/device/detail', '#19', (url) => {
  const err = requireParams(url, ['deviceId']);
  if (err) return err;
  return ok(D.buildDeviceDetail(String(url.searchParams.get('deviceId')).trim()));
});

// #20 提交报修
route('POST', '/operation/device/repair', '#20', (url, body) => {
  if (body.deviceId === undefined || body.deviceId === null || String(body.deviceId).trim() === '') {
    return fail(400, '缺少必填参数 deviceId');
  }
  const reason = body.repairReason !== undefined ? body.repairReason : body.reason;
  if (reason === undefined || reason === null || String(reason).trim() === '') {
    return fail(400, '缺少必填参数 repairReason');
  }
  return ok({
    repairId: 'RP' + Date.now(),
    deviceId: String(body.deviceId).trim(),
    repairReason: String(reason).trim(),
    reporter: body.reporter || '当前登录用户',
    submitTime: D.fmtDateTime(new Date()),
    status: 'PENDING'
  });
});

// #21 天气预警列表（分页）
route('GET', '/operation/detection/weatherAlarmList', '#21', (url) => {
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(D.buildWeatherAlarms(), pageNum, pageSize));
});

// #22 异常上报列表（分页）
route('GET', '/operation/detection/reportList', '#22', (url) => {
  const { pageNum, pageSize } = pageParams(url);
  return ok(D.paginate(D.buildReportRows(), pageNum, pageSize));
});

// #23 环境异常列表（分页）
route('GET', '/operation/detection/envAlarmList', '#23', (url) => {
  const { pageNum, pageSize } = pageParams(url);
  const monitorType = url.searchParams.get('monitorType');
  const all = D.buildEnvAlarms();
  const rows = monitorType ? all.filter((r) => r.monitorType === monitorType) : all;
  return ok(D.paginate(rows, pageNum, pageSize));
});

// #24 隧道路段 / 门架拓扑
route('GET', '/operation/monitor/route', '#24', (url) => {
  const one = url.searchParams.get('sectionNum');
  if (one && !D.resolveSection(one)) return fail(400, '路段编码不存在: ' + one);
  return ok(D.buildRoute(one));
});

// #25 协同上报处置
route('POST', '/operation/detection/eventHandle', '#25', (url, body) => {
  if (body.eventId === undefined || body.eventId === null || String(body.eventId).trim() === '') {
    return fail(400, '缺少必填参数 eventId');
  }
  const content = body.handleContent !== undefined ? body.handleContent : body.content;
  if (content === undefined || content === null || String(content).trim() === '') {
    return fail(400, '缺少必填参数 handleContent');
  }
  return ok({
    eventId: String(body.eventId).trim(),
    handleType: body.handleType || 'COORDINATED',
    handleContent: String(content).trim(),
    operator: body.operator || '当前登录用户',
    handleTime: body.handleTime || D.fmtDateTime(new Date()),
    status: 'PROCESSING'
  });
});

/* ------------------------------------------------------------------ *
 * 3. 静态资源托管 ../web
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function sendJson(res, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(200, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store'
  }, corsHeaders()));
  res.end(payload);
}

function sendText(res, status, text, type) {
  const payload = Buffer.from(text, 'utf8');
  res.writeHead(status, Object.assign({
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': payload.length
  }, corsHeaders()));
  res.end(payload);
}

function serveStatic(pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    return sendText(res, 400, 'Bad Request: 非法 URL 编码');
  }
  if (rel === '/' || rel === '') rel = '/index.html';

  const target = path.resolve(WEB_DIR, '.' + rel);
  if (target !== WEB_DIR && !target.startsWith(WEB_DIR + path.sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.stat(target, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return serveStatic(rel.replace(/\/?$/, '/') + 'index.html', res);
    }
    if (err || !stat.isFile()) {
      const hint = [
        '<!doctype html><meta charset="utf-8"><title>404</title>',
        '<body style="font-family:-apple-system,PingFang SC,sans-serif;background:#050b14;color:#9fb3c8;padding:48px">',
        '<h2 style="color:#22d3ee">404 · 静态资源不存在</h2>',
        '<p>mock 服务已启动，但 <code>web/index.html</code> 尚未生成。</p>',
        '<p>请求路径：<code>', rel.replace(/[<>&]/g, ''), '</code></p>',
        '<p>已实现端点：<code>http://127.0.0.1:', String(PORT), '/__mock/routes</code></p>',
        '</body>'
      ].join('');
      return sendText(res, 404, hint, 'text/html; charset=utf-8');
    }

    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    fs.readFile(target, (readErr, buf) => {
      if (readErr) return sendText(res, 500, 'Internal Server Error');
      res.writeHead(200, Object.assign({
        'Content-Type': type,
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache'
      }, corsHeaders()));
      res.end(buf);
    });
  });
}

/* ------------------------------------------------------------------ *
 * 4. HTTP 请求处理
 * ------------------------------------------------------------------ */

const MAX_BODY = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJsonBody(raw) {
  if (!raw || !raw.trim()) return { value: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { value: v };
    return { error: fail(400, '请求体必须是 JSON 对象') };
  } catch (e) {
    return { error: fail(400, '请求体不是合法 JSON') };
  }
}

function routeTable() {
  return {
    http: ROUTES.map((r) => ({ method: r.method, path: r.path, source: r.source })),
    ws: [{ path: WS_PATH, push: '每 5s 推送一条 detection 事件' }],
    count: { http: ROUTES.length, ws: 1, total: ROUTES.length + 1 }
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // 诊断端点（不属于业务契约，便于验证与排查）
  if (method === 'GET' && url.pathname === '/__mock/routes') {
    return sendJson(res, ok(routeTable()));
  }
  if (method === 'GET' && url.pathname === '/__mock/health') {
    return sendJson(res, ok({ status: 'UP', rev: D.LIVE.rev, uptimeSec: Math.round(process.uptime()) }));
  }

  const matched = ROUTES.filter((r) => r.path === url.pathname);
  if (matched.length) {
    const byMethod = matched.find((r) => r.method === method);
    if (!byMethod) {
      res.setHeader('Allow', matched.map((r) => r.method).join(', '));
      return sendJson(res, fail(405, '请求方法不支持: ' + method + ' ' + url.pathname));
    }
    let body = {};
    if (method === 'POST') {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      if (parsed.error) return sendJson(res, parsed.error);
      body = parsed.value;
    }
    try {
      return sendJson(res, byMethod.handler(url, body, req));
    } catch (e) {
      console.error('[mock] handler error', url.pathname, e);
      return sendJson(res, fail(500, '服务端内部错误: ' + (e && e.message ? e.message : 'unknown')));
    }
  }

  // 契约内的 WS 路径被 HTTP 直接访问时给出明确提示，便于前端排查
  if (url.pathname === WS_PATH) {
    return sendJson(res, fail(400, '该路径为 WebSocket 通道，请使用 ws:// 协议连接'));
  }

  if (method === 'GET') return serveStatic(url.pathname, res);
  return sendJson(res, fail(404, '接口不存在: ' + method + ' ' + url.pathname));
}

/* ------------------------------------------------------------------ *
 * 5. WebSocket（RFC 6455 手写实现，零依赖）
 * ------------------------------------------------------------------ */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_PUSH_MS = 5000;

/** 服务端 → 客户端文本帧（opcode 0x1，服务端不加掩码） */
function encodeTextFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x81; // FIN=1 + opcode=1(text)
  return Buffer.concat([header, payload]);
}

/** 控制帧（close / pong），payload 长度不超过 125 */
function encodeControlFrame(opcode, payload) {
  const body = payload || Buffer.alloc(0);
  const header = Buffer.alloc(2);
  header[0] = 0x80 | (opcode & 0x0f);
  header[1] = body.length;
  return Buffer.concat([header, body]);
}

/**
 * 解析客户端帧（客户端帧恒带 mask）。
 * @returns {{frames: Array, rest: Buffer}} frames: [{opcode, payload}]
 */
function decodeFrames(buf) {
  const frames = [];
  let off = 0;

  while (buf.length - off >= 2) {
    const b0 = buf[off];
    const b1 = buf[off + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;

    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      const big = buf.readBigUInt64BE(p);
      if (big > BigInt(4 * 1024 * 1024)) {
        // 超长帧直接丢弃，避免内存被打爆
        frames.push({ opcode: 0x8, payload: Buffer.alloc(0), overflow: true });
        return { frames, rest: Buffer.alloc(0) };
      }
      len = Number(big);
      p += 8;
    }

    let mask = null;
    if (masked) {
      if (buf.length - p < 4) break;
      mask = buf.slice(p, p + 4);
      p += 4;
    }
    if (buf.length - p < len) break;

    let payload = buf.slice(p, p + len);
    if (masked) {
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    frames.push({ opcode, payload, masked });
    off = p + len;
  }

  return { frames, rest: buf.slice(off) };
}

const wsClients = new Set();

function attachWebSocket(socket, req) {
  const client = { socket, alive: true, timer: null, buf: Buffer.alloc(0) };
  wsClients.add(client);
  if (socket.setNoDelay) socket.setNoDelay(true);

  const send = (obj) => {
    if (!client.alive) return;
    try {
      socket.write(encodeTextFrame(JSON.stringify(obj)));
    } catch (e) {
      closeClient(client);
    }
  };
  client.send = send;

  // 连上先回一条，前端不必等 5s 才有数据
  send(D.buildRandomEvent());
  client.timer = setInterval(() => send(D.buildRandomEvent()), WS_PUSH_MS);

  socket.on('data', (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    const { frames, rest } = decodeFrames(client.buf);
    client.buf = rest;
    frames.forEach((f) => {
      if (f.opcode === 0x8) {
        // close：回一个 close 帧后断开
        try {
          socket.write(encodeControlFrame(0x8, f.payload && f.payload.length ? f.payload : Buffer.from([0x03, 0xe8])));
        } catch (e) {}
        closeClient(client, true);
      } else if (f.opcode === 0x9) {
        // ping → pong
        try {
          socket.write(encodeControlFrame(0xa, f.payload));
        } catch (e) {
          closeClient(client);
        }
      } else if (f.opcode === 0xa) {
        // pong：忽略
      } else if (f.opcode === 0x1) {
        // 客户端文本：本通道只做服务端推送，忽略
      }
    });
  });

  socket.on('error', () => closeClient(client));
  socket.on('close', () => closeClient(client));

  console.log('[ws] +1 client, online=' + wsClients.size + ' path=' + (req && req.url));
}

function closeClient(client, alreadyClosed) {
  if (!client.alive) return;
  client.alive = false;
  if (client.timer) {
    clearInterval(client.timer);
    client.timer = null;
  }
  wsClients.delete(client);
  try {
    if (!alreadyClosed) client.socket.end();
    else client.socket.destroy();
  } catch (e) {}
  console.log('[ws] -1 client, online=' + wsClients.size);
}

function handleUpgrade(req, socket, head) {
  const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
  if (url.pathname !== WS_PATH) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  const version = String(req.headers['sec-websocket-version'] || '');
  if (!key || upgrade !== 'websocket' || version !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }

  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n' +
      '\r\n'
  );

  attachWebSocket(socket, req);
  if (head && head.length) socket.emit('data', head);
}

/* ------------------------------------------------------------------ *
 * 6. 启动
 * ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    console.error('[mock] request error', e);
    try {
      sendJson(res, fail(500, '服务端内部错误'));
    } catch (_) {}
  });
});

server.on('upgrade', handleUpgrade);

// 实时抖动：每 60s 让 todayFlow / realtime 的数值变化一次，轮询前端可见
const jitterTimer = setInterval(() => {
  const s = D.tick();
  console.log('[tick] rev=' + s.rev + ' flowFactor=' + s.flowFactor.toFixed(4) + ' realtimeFactor=' + s.realtimeFactor.toFixed(4));
}, 60000);

server.listen(PORT, HOST, () => {
  const indexPath = path.join(WEB_DIR, 'index.html');
  const hasIndex = fs.existsSync(indexPath);
  const httpCount = ROUTES.length;

  console.log('mock listening on http://' + HOST + ':' + PORT);
  console.log('mock endpoints: ' + httpCount + ' HTTP + 1 WS (ws://' + HOST + ':' + PORT + WS_PATH + ')');
  console.log(
    'mock contract check: CONTRACT §4 共 25 条路由 = 24 HTTP + 1 WS；已实现 ' +
      httpCount + ' HTTP + 1 WS，缺失 ' + (24 - httpCount) + ' 条、多余 ' +
      Math.max(0, httpCount - 24) + ' 条'
  );
  console.log('mock web root: ' + WEB_DIR + ' (index.html ' + (hasIndex ? 'OK' : 'MISSING → GET / 会返回 404') + ')');
  console.log('mock diagnostics: GET /__mock/routes , GET /__mock/health');
});

function shutdown(signal) {
  console.log('[mock] ' + signal + ' received, closing...');
  clearInterval(jitterTimer);
  wsClients.forEach((c) => closeClient(c));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
