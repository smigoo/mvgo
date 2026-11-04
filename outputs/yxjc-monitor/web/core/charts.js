/* 运行监测大屏 · 共享图表工具（零依赖 / 纯内联 SVG）
 * 契约：CONTRACT.md §3.2
 *   YXJC.charts.line(el, { series:[{name,color,data:[{x,y}],dashed?,area?}], yMin?, yMax?, xLabels?, thresholds?:[{value,color,label}] })
 *   YXJC.charts.bar(el,  { items:[{label,value,color}], max?, horizontal? })
 *   YXJC.charts.pie(el,  { items:[{label,value,color}], donut? })
 *   YXJC.charts.gauge(el,{ value, max, color, label, unit })
 * 全部返回 render()，可重复调用。颜色写死十六进制（禁止 CSS 变量）。
 */
(function () {
  'use strict';

  var YXJC = (window.YXJC = window.YXJC || {});

  var C = {
    cyan: '#22d3ee',
    blue: '#3b82f6',
    amber: '#f59e0b',
    red: '#ef4444',
    green: '#22c55e',
    purple: '#a78bfa',
    text: '#dbeafe',
    muted: '#7f9bb5',
    grid: 'rgba(120,160,200,0.16)',
    axis: 'rgba(120,160,200,0.30)',
    panel: '#050b14'
  };
  var PALETTE = ['#22d3ee', '#3b82f6', '#f59e0b', '#22c55e', '#a78bfa', '#f472b6', '#14b8a6', '#eab308'];
  var FONT = "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

  var seq = 0;
  function uid(prefix) { seq += 1; return prefix + seq; }

  function resolveEl(el) {
    if (!el) return null;
    if (typeof el === 'string') return document.querySelector(el);
    return el;
  }

  function dims(el) {
    var w = el.clientWidth || 0;
    var h = el.clientHeight || 0;
    if (!w) w = 640;
    if (!h) h = 220;
    return { w: Math.round(w), h: Math.round(h) };
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 轴数值紧凑格式 */
  function axisNum(v) {
    var a = Math.abs(v);
    if (a >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (a >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (a >= 1000) return Math.round(v).toLocaleString('en-US');
    if (a >= 10) return String(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }

  function valNum(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '-';
    var a = Math.abs(v);
    if (a >= 1000) return Math.round(v).toLocaleString('en-US');
    if (a >= 10) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
  }

  function trunc(s, max) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
  }

  /* line 专用提示层（定位 div，不进 SVG） */
  function ensureTip(el) {
    try {
      if (window.getComputedStyle && getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
      }
    } catch (e) { /* ignore */ }
    var tip = null;
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].classList && el.children[i].classList.contains('yxjc-chart-tip')) {
        tip = el.children[i];
        break;
      }
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'yxjc-chart-tip';
    }
    return tip;
  }

  function svgOpen(W, H) {
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" ' +
      'style="display:block;overflow:visible;font-family:' + FONT + '">';
  }

  function text(x, y, str, opt) {
    opt = opt || {};
    return '<text x="' + x + '" y="' + y + '"' +
      ' text-anchor="' + (opt.anchor || 'middle') + '"' +
      ' font-size="' + (opt.size || 11) + '"' +
      ' fill="' + (opt.fill || C.muted) + '"' +
      (opt.weight ? ' font-weight="' + opt.weight + '"' : '') +
      ' style="font-variant-numeric:tabular-nums">' + esc(str) + '</text>';
  }

  /* ============================ line ============================ */
  function line(el, opts) {
    opts = opts || {};
    var node = resolveEl(el);
    var tip = node ? ensureTip(node) : null;

    function render() {
      if (!node) return;
      var d = dims(node);
      var W = d.w, H = d.h;
      var series = opts.series || [];
      var xLabels = opts.xLabels || [];

      var n = xLabels.length;
      series.forEach(function (s) {
        if (s && s.data) n = Math.max(n, s.data.length);
      });
      if (n < 1) n = 1;

      var multi = series.length > 1;
      var padL = 48, padR = 18, padB = 28, padT = multi ? 30 : 16;
      var iw = Math.max(10, W - padL - padR);
      var ih = Math.max(10, H - padT - padB);

      /* ---- y 域 ---- */
      var vals = [];
      series.forEach(function (s) {
        (s.data || []).forEach(function (p) {
          if (p && isFinite(p.y)) vals.push(p.y);
        });
      });
      (opts.thresholds || []).forEach(function (t) {
        if (t && isFinite(t.value)) vals.push(t.value);
      });

      var dmin = vals.length ? Math.min.apply(null, vals) : 0;
      var dmax = vals.length ? Math.max.apply(null, vals) : 1;
      var yMin, yMax;
      if (opts.yMin !== null && opts.yMin !== undefined) yMin = Number(opts.yMin);
      else yMin = dmin >= 0 ? 0 : dmin - (dmax - dmin) * 0.08;
      if (opts.yMax !== null && opts.yMax !== undefined) yMax = Number(opts.yMax);
      else yMax = dmax === yMin ? yMin + 1 : dmax + (dmax - yMin) * 0.08;
      if (!isFinite(yMin)) yMin = 0;
      if (!isFinite(yMax) || yMax <= yMin) yMax = yMin + 1;

      function px(i) { return padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); }
      function py(v) { return padT + ih * (1 - (v - yMin) / (yMax - yMin)); }

      var out = [svgOpen(W, H)];

      /* ---- 渐变 defs ---- */
      var defs = '';
      series.forEach(function (s, idx) {
        if (!s || !s.area) return;
        var gid = 'ycg' + idx + '_' + seq;
        s.__gid = gid;
        var col = s.color || PALETTE[idx % PALETTE.length];
        defs += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + col + '" stop-opacity="0.36"/>' +
          '<stop offset="100%" stop-color="' + col + '" stop-opacity="0.02"/>' +
          '</linearGradient>';
      });
      if (defs) out.push('<defs>' + defs + '</defs>');

      /* ---- 网格 + y 轴 ---- */
      var ticks = 4;
      for (var t = 0; t <= ticks; t++) {
        var gy = padT + (ih * t) / ticks;
        var gv = yMax - ((yMax - yMin) * t) / ticks;
        out.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + iw) + '" y2="' + gy +
          '" stroke="' + C.grid + '" stroke-width="1"/>');
        out.push(text(padL - 8, gy + 4, axisNum(gv), { anchor: 'end', fill: C.muted }));
      }
      /* 基线 */
      out.push('<line x1="' + padL + '" y1="' + (padT + ih) + '" x2="' + (padL + iw) + '" y2="' + (padT + ih) +
        '" stroke="' + C.axis + '" stroke-width="1"/>');

      /* ---- 预警线 ---- */
      (opts.thresholds || []).forEach(function (th) {
        if (!th || !isFinite(th.value)) return;
        var ty = py(th.value);
        if (ty < padT - 2 || ty > padT + ih + 2) return;
        var col = th.color || C.red;
        out.push('<line x1="' + padL + '" y1="' + ty + '" x2="' + (padL + iw) + '" y2="' + ty +
          '" stroke="' + col + '" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.9"/>');
        if (th.label) {
          out.push(text(padL + iw - 2, ty - 4, th.label, { anchor: 'end', fill: col }));
        }
      });

      /* ---- 各序列 ---- */
      series.forEach(function (s, idx) {
        if (!s) return;
        var data = s.data || [];
        if (!data.length) return;
        var col = s.color || PALETTE[idx % PALETTE.length];
        var pts = [];
        data.forEach(function (p, i) {
          if (!p || !isFinite(p.y)) return;
          pts.push({ x: px(i), y: py(p.y), raw: p, i: i });
        });
        if (!pts.length) return;

        /* 面积 */
        if (s.area) {
          var gid = s.__gid || ('ycg' + idx);
          var baseY = padT + ih;
          var areaD = 'M ' + pts[0].x + ' ' + baseY + ' L ' +
            pts.map(function (p) { return p.x + ' ' + p.y; }).join(' L ') +
            ' L ' + pts[pts.length - 1].x + ' ' + baseY + ' Z';
          out.push('<path d="' + areaD + '" fill="url(#' + gid + ')" stroke="none"/>');
        }
        /* 折线 */
        var dstr = pts.map(function (p, k) { return (k ? 'L ' : 'M ') + p.x + ' ' + p.y; }).join(' ');
        out.push('<path d="' + dstr + '" fill="none" stroke="' + col + '" stroke-width="' +
          (s.width || 2) + '" stroke-linejoin="round" stroke-linecap="round"' +
          (s.dashed ? ' stroke-dasharray="6 4"' : '') + '/>');
        /* 点 */
        pts.forEach(function (p) {
          out.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' +
            (s.dashed ? 2.2 : 2.8) + '" fill="' + C.panel + '" stroke="' + col +
            '" stroke-width="1.6"/>');
        });
      });

      /* ---- x 轴标签 ---- */
      if (n > 0 && (xLabels.length || series.length)) {
        var step = Math.max(1, Math.ceil(n / 7));
        for (var i = 0; i < n; i += step) {
          var lbl = xLabels[i];
          if (lbl === null || lbl === undefined) {
            var s0 = series[0];
            var p0 = s0 && s0.data && s0.data[i];
            lbl = p0 && p0.x !== undefined ? p0.x : '';
          }
          if (lbl === '') continue;
          var anchor = 'middle';
          var tx = px(i);
          if (tx < padL + 6) { anchor = 'start'; }
          if (tx > padL + iw - 6) { anchor = 'end'; }
          out.push(text(tx, H - 8, trunc(lbl, 12), { anchor: anchor, fill: C.muted }));
        }
      }

      /* ---- 图例（多序列） ---- */
      if (multi) {
        var lx = padL;
        series.forEach(function (s, idx) {
          if (!s) return;
          var col = s.color || PALETTE[idx % PALETTE.length];
          var name = trunc(s.name || ('序列' + (idx + 1)), 10);
          out.push('<rect x="' + lx + '" y="' + (padT - 20) + '" width="8" height="8" rx="1" fill="' +
            col + '"/>');
          out.push(text(lx + 12, padT - 13, name, { anchor: 'start', fill: C.text }));
          lx += 24 + name.length * 11;
          if (lx > padL + iw - 40) lx = padL;
        });
      }

      /* ---- 悬停热区（直接写进 SVG 字符串，规避 SVG innerHTML 兼容差异） ---- */
      var hits = '';
      series.forEach(function (s, si) {
        (s.data || []).forEach(function (p, pi) {
          if (!p || !isFinite(p.y)) return;
          hits += '<circle class="yxjc-hit" data-si="' + si + '" data-pi="' + pi +
            '" cx="' + px(pi) + '" cy="' + py(p.y) + '" r="10" fill="transparent" ' +
            'style="pointer-events:all;cursor:crosshair"/>';
        });
      });
      if (hits) out.push('<g>' + hits + '</g>');
      out.push('</svg>');

      node.innerHTML = out.join('');
      if (tip) node.appendChild(tip);

      /* ---- 悬停 tooltip ---- */
      if (tip) {
        tip.style.opacity = '0';
        var hitEls = node.querySelectorAll('.yxjc-hit');
        Array.prototype.forEach.call(hitEls, function (h) {
          h.addEventListener('mouseenter', function () {
            var si = +h.getAttribute('data-si');
            var pi = +h.getAttribute('data-pi');
            var s = series[si] || {};
            var p = (s.data || [])[pi] || {};
            var lbl = xLabels[pi];
            if (lbl === null || lbl === undefined) lbl = p.x !== undefined ? p.x : ('#' + (pi + 1));
            var col = s.color || PALETTE[si % PALETTE.length];
            tip.innerHTML =
              '<div style="color:' + col + ';font-weight:600;margin-bottom:2px">' +
              esc(s.name || ('序列' + (si + 1))) + '</div>' +
              '<div style="color:#8fa8bf">' + esc(lbl) + '</div>' +
              '<div style="color:#eaf6ff">' + esc(valNum(p.y)) + '</div>';
            var hostRect = node.getBoundingClientRect();
            var ptRect = h.getBoundingClientRect();
            tip.style.left = (ptRect.left + ptRect.width / 2 - hostRect.left) + 'px';
            tip.style.top = (ptRect.top + ptRect.height / 2 - hostRect.top - 8) + 'px';
            tip.style.opacity = '1';
          });
          h.addEventListener('mouseleave', function () { tip.style.opacity = '0'; });
        });
      }
    }

    render();
    return render;
  }

  /* ============================ bar ============================ */
  function bar(el, opts) {
    opts = opts || {};
    var node = resolveEl(el);

    function render() {
      if (!node) return;
      var d = dims(node);
      var W = d.w, H = d.h;
      var items = (opts.items || []).filter(function (it) { return it; });
      var horizontal = !!opts.horizontal;
      var out = [svgOpen(W, H)];

      if (!items.length) {
        out.push(text(W / 2, H / 2, '暂无数据', { fill: C.muted, size: 12 }));
        out.push('</svg>');
        node.innerHTML = out.join('');
        return;
      }

      var vmax = 0;
      items.forEach(function (it) { if (isFinite(it.value)) vmax = Math.max(vmax, it.value); });
      var max = opts.max !== null && opts.max !== undefined && isFinite(opts.max)
        ? Number(opts.max)
        : (vmax > 0 ? vmax * 1.12 : 1);
      if (max <= 0) max = 1;

      function colOf(it, i) { return it.color || PALETTE[i % PALETTE.length]; }

      if (!horizontal) {
        var padL = 40, padR = 12, padT = 18, padB = 28;
        var iw = Math.max(10, W - padL - padR);
        var ih = Math.max(10, H - padT - padB);
        var ticks = 3;
        for (var t = 0; t <= ticks; t++) {
          var gy = padT + (ih * t) / ticks;
          var gv = max - (max * t) / ticks;
          out.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + iw) + '" y2="' + gy +
            '" stroke="' + C.grid + '" stroke-width="1"/>');
          out.push(text(padL - 8, gy + 4, axisNum(gv), { anchor: 'end', fill: C.muted }));
        }
        var slot = iw / items.length;
        var bw = Math.min(slot * 0.56, 34);
        items.forEach(function (it, i) {
          var cx = padL + slot * i + slot / 2;
          var v = isFinite(it.value) ? it.value : 0;
          var bh = (ih * Math.max(0, v)) / max;
          var y = padT + ih - bh;
          var col = colOf(it, i);
          out.push('<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' +
            Math.max(1, bh) + '" rx="2" fill="' + col + '" opacity="0.9"/>');
          out.push(text(cx, y - 5, valNum(v), { fill: C.text, size: 11 }));
          out.push(text(cx, H - 8, trunc(it.label, Math.max(3, Math.floor(slot / 11))),
            { fill: C.muted, size: 11 }));
        });
      } else {
        var hpadL = 70, hpadR = 46, hpadT = 8, hpadB = 12;
        var hiw = Math.max(10, W - hpadL - hpadR);
        var hih = Math.max(10, H - hpadT - hpadB);
        var rowH = hih / items.length;
        var bh2 = Math.min(rowH * 0.52, 18);
        for (var t2 = 0; t2 <= 3; t2++) {
          var gx = hpadL + (hiw * t2) / 3;
          out.push('<line x1="' + gx + '" y1="' + hpadT + '" x2="' + gx + '" y2="' + (hpadT + hih) +
            '" stroke="' + C.grid + '" stroke-width="1"/>');
        }
        items.forEach(function (it, i) {
          var cy = hpadT + rowH * i + rowH / 2;
          var v = isFinite(it.value) ? it.value : 0;
          var bwv = (hiw * Math.max(0, v)) / max;
          var col = colOf(it, i);
          out.push(text(hpadL - 8, cy + 4, trunc(it.label, 6), { anchor: 'end', fill: C.text, size: 11 }));
          out.push('<rect x="' + hpadL + '" y="' + (cy - bh2 / 2) + '" width="' + Math.max(1, bwv) +
            '" height="' + bh2 + '" rx="2" fill="' + col + '" opacity="0.9"/>');
          out.push(text(hpadL + Math.max(1, bwv) + 6, cy + 4, valNum(v),
            { anchor: 'start', fill: C.text, size: 11 }));
        });
      }

      out.push('</svg>');
      node.innerHTML = out.join('');
    }

    render();
    return render;
  }

  /* ============================ pie ============================ */
  function pie(el, opts) {
    opts = opts || {};
    var node = resolveEl(el);

    function polar(cx, cy, r, a) {
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
    function arcPath(cx, cy, r, r2, a0, a1) {
      var full = a1 - a0 >= Math.PI * 1.9999;
      if (full) {
        // 整圆：用两段半圆拼
        if (r2 === null || r2 === undefined) {
          return 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx + r) + ' ' + cy +
            ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx - r) + ' ' + cy + ' Z';
        }
        return 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx + r) + ' ' + cy +
          ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx - r) + ' ' + cy + ' Z ' +
          'M ' + (cx - r2) + ' ' + cy + ' A ' + r2 + ' ' + r2 + ' 0 1 0 ' + (cx + r2) + ' ' + cy +
          ' A ' + r2 + ' ' + r2 + ' 0 1 0 ' + (cx - r2) + ' ' + cy + ' Z';
      }
      var p0 = polar(cx, cy, r, a0);
      var p1 = polar(cx, cy, r, a1);
      var large = a1 - a0 > Math.PI ? 1 : 0;
      if (r2 === null || r2 === undefined) {
        return 'M ' + cx + ' ' + cy + ' L ' + p0.x + ' ' + p0.y +
          ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x + ' ' + p1.y + ' Z';
      }
      var q1 = polar(cx, cy, r2, a1);
      var q0 = polar(cx, cy, r2, a0);
      return 'M ' + p0.x + ' ' + p0.y +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x + ' ' + p1.y +
        ' L ' + q1.x + ' ' + q1.y +
        ' A ' + r2 + ' ' + r2 + ' 0 ' + large + ' 0 ' + q0.x + ' ' + q0.y + ' Z';
    }

    function render() {
      if (!node) return;
      var d = dims(node);
      var W = d.w, H = d.h;
      var items = (opts.items || []).filter(function (it) { return it && isFinite(it.value); });
      var donut = !!opts.donut;
      var out = [svgOpen(W, H)];

      var total = 0;
      items.forEach(function (it) { total += Math.max(0, it.value); });

      if (!items.length || total <= 0) {
        out.push(text(W / 2, H / 2, '暂无数据', { fill: C.muted, size: 12 }));
        out.push('</svg>');
        node.innerHTML = out.join('');
        return;
      }

      var legendW = W >= 300 ? Math.min(170, W * 0.42) : 0;
      var plotW = W - legendW;
      var cx = plotW / 2;
      var cy = H / 2 + 2;
      var r = Math.max(12, Math.min(plotW, H) / 2 - 14);
      var r2 = donut ? r * 0.62 : null;

      var start = -Math.PI / 2;
      items.forEach(function (it, i) {
        var frac = Math.max(0, it.value) / total;
        var a0 = start;
        var a1 = start + frac * Math.PI * 2;
        var col = it.color || PALETTE[i % PALETTE.length];
        var path = arcPath(cx, cy, r, r2, a0, a1);
        out.push('<path d="' + path + '" fill="' + col + '" opacity="0.92" stroke="#050b14" stroke-width="1">' +
          '<title>' + esc(it.label) + '：' + esc(valNum(it.value)) + '（' +
          esc((frac * 100).toFixed(1)) + '%）</title></path>');
        start = a1;
      });

      /* 环形中心总量 */
      if (donut) {
        out.push(text(cx, cy - 2, valNum(total), { fill: '#eaf6ff', size: Math.max(15, Math.min(24, r * 0.42)), weight: '600' }));
        out.push(text(cx, cy + 16, '合计', { fill: C.muted, size: 11 }));
      }

      /* 图例 */
      if (legendW > 0) {
        var lx = plotW + 10;
        var rowH = Math.min(20, (H - 12) / items.length);
        var ly = cy - (rowH * items.length) / 2 + rowH / 2 + 4;
        items.forEach(function (it, i) {
          var col = it.color || PALETTE[i % PALETTE.length];
          var y = ly + rowH * i;
          out.push('<rect x="' + lx + '" y="' + (y - 4) + '" width="8" height="8" rx="1" fill="' + col + '"/>');
          out.push(text(lx + 13, y + 4, trunc(it.label, 8), { anchor: 'start', fill: C.text, size: 11 }));
          var pct = ((Math.max(0, it.value) / total) * 100).toFixed(0) + '%';
          out.push(text(W - 4, y + 4, pct, { anchor: 'end', fill: C.muted, size: 11 }));
        });
      }

      out.push('</svg>');
      node.innerHTML = out.join('');
    }

    render();
    return render;
  }

  /* ============================ gauge ============================ */
  function gauge(el, opts) {
    opts = opts || {};
    var node = resolveEl(el);

    function polar(cx, cy, r, a) {
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
    function arc(cx, cy, r, a0, a1) {
      var p0 = polar(cx, cy, r, a0);
      var p1 = polar(cx, cy, r, a1);
      var large = a1 - a0 > Math.PI ? 1 : 0;
      return 'M ' + p0.x + ' ' + p0.y + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x + ' ' + p1.y;
    }

    function render() {
      if (!node) return;
      var d = dims(node);
      var W = d.w, H = d.h;
      var max = Number(opts.max);
      if (!isFinite(max) || max <= 0) max = 100;
      var value = Number(opts.value);
      if (!isFinite(value)) value = 0;
      var frac = Math.max(0, Math.min(1, value / max));
      var color = opts.color || C.cyan;
      var label = opts.label || '';
      var unit = opts.unit || '';

      var out = [svgOpen(W, H)];
      var cx = W / 2;
      var r = Math.max(16, Math.min(W / 2 - 16, H * 0.82));
      var cy = Math.min(H - 14, H * 0.88);
      var baseLabelY = Math.min(H - 3, cy + 14);
      var sw = Math.max(8, r * 0.15);

      /* 底弧 */
      out.push('<path d="' + arc(cx, cy, r, Math.PI, Math.PI * 2) + '" fill="none" stroke="rgba(120,160,200,0.22)" stroke-width="' + sw + '" stroke-linecap="round"/>');
      /* 值弧 */
      if (frac > 0.0001) {
        out.push('<path d="' + arc(cx, cy, r, Math.PI, Math.PI + Math.PI * frac) +
          '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>');
      }
      /* 刻度 0 / max */
      out.push(text(cx - r, baseLabelY, '0', { fill: C.muted, size: 11 }));
      out.push(text(cx + r, baseLabelY, axisNum(max), { fill: C.muted, size: 11 }));

      /* 指针 */
      var na = Math.PI + Math.PI * frac;
      var tipP = polar(cx, cy, r * 0.7, na);
      out.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + tipP.x + '" y2="' + tipP.y +
        '" stroke="' + color + '" stroke-width="2" stroke-linecap="round" opacity="0.9"/>');
      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="3.2" fill="' + color + '"/>');

      /* 数值 */
      var big = Math.max(18, Math.min(30, r * 0.44));
      out.push(text(cx, cy - r * 0.28, valNum(value) + (unit ? ' ' + unit : ''),
        { fill: '#eaf6ff', size: big, weight: '600' }));
      if (label) {
        out.push(text(cx, cy - r * 0.28 + big * 0.95, label, { fill: C.muted, size: 11 }));
      }

      out.push('</svg>');
      node.innerHTML = out.join('');
    }

    render();
    return render;
  }

  YXJC.charts = {
    line: line,
    bar: bar,
    pie: pie,
    gauge: gauge,
    palette: PALETTE.slice(),
    colors: C
  };
})();
