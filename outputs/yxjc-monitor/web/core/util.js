/* 运行监测大屏 · 通用格式化/工具
 * 契约：CONTRACT.md §3.3 → window.YXJC.util.{fmtNum,fmtPct,shiftDays,rangeDates,el,on,poll}
 * 零依赖，纯 ES5 兼容写法。
 */
(function () {
  'use strict';

  var YXJC = (window.YXJC = window.YXJC || {});

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function toDate(d) {
    if (d instanceof Date) return new Date(d.getTime());
    if (typeof d === 'string') {
      var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      var t = new Date(d);
      if (!isNaN(t.getTime())) return t;
    }
    if (typeof d === 'number') return new Date(d);
    return new Date();
  }

  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* 千分位：fmtNum(12345.6, 1) → "12,345.6" */
  function fmtNum(n, digits) {
    digits = digits == null ? 0 : digits;
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '-';
    var num = Number(n);
    var fixed = num.toFixed(digits);
    var neg = fixed.charAt(0) === '-';
    if (neg) fixed = fixed.slice(1);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  /* 百分比：fmtPct(12.3456, 1) → "12.3%"（入参已是百分数，如 12.34 表示 12.34%） */
  function fmtPct(n, digits) {
    digits = digits == null ? 1 : digits;
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '-';
    return Number(n).toFixed(digits) + '%';
  }

  /* 日期偏移：shiftDays('2026-04-14', -1) → "2026-04-13" */
  function shiftDays(date, n) {
    var d = toDate(date);
    d.setDate(d.getDate() + Number(n || 0));
    return ymd(d);
  }

  /* 日期区间：rangeDates('2026-04-01','2026-04-03') → ['2026-04-01','2026-04-02','2026-04-03'] */
  function rangeDates(start, end) {
    var s = toDate(start);
    var e = toDate(end);
    var out = [];
    var cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    var guard = 0;
    while (cur.getTime() <= last.getTime() && guard < 10000) {
      out.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return out;
  }

  /* 极简 DOM 构造：el('div', {class:'a', text:'x'}, [child, 'text']) */
  function el(tag, attrs, children) {
    var node = document.createElement(tag || 'div');
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') {
          node.className = v;
        } else if (k === 'text') {
          node.textContent = v;
        } else if (k === 'html') {
          node.innerHTML = v;
        } else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (sk) { node.style[sk] = v[sk]; });
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) {
          node.setAttribute(k, '');
        } else {
          node.setAttribute(k, v);
        }
      });
    }
    if (children !== null && children !== undefined) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(
          typeof c === 'string' || typeof c === 'number'
            ? document.createTextNode(String(c))
            : c
        );
      });
    }
    return node;
  }

  /* 事件委托：on(root, 'click', '.btn', fn(ev, matchedEl)) → 返回 off() */
  function on(root, type, sel, fn) {
    if (!root || !root.addEventListener) return function () {};
    function handler(ev) {
      var t = ev.target;
      while (t && t !== root) {
        if (t.nodeType === 1 && t.matches && t.matches(sel)) {
          fn.call(t, ev, t);
          return;
        }
        t = t.parentNode;
      }
      // root 自身也命中
      if (root.nodeType === 1 && root.matches && root.matches(sel)) fn.call(root, ev, root);
    }
    root.addEventListener(type, handler);
    return function off() { root.removeEventListener(type, handler); };
  }

  /* 轮询：立即执行一次 + setInterval；fn 抛错不断表；返回 stop() */
  function poll(fn, ms) {
    var stopped = false;
    function tick() {
      if (stopped) return;
      try {
        fn();
      } catch (e) {
        if (window.console && console.warn) console.warn('[YXJC.util.poll] 回调异常：', e);
      }
    }
    tick();
    var id = setInterval(tick, Math.max(16, Number(ms) || 1000));
    return function stop() {
      stopped = true;
      clearInterval(id);
    };
  }

  YXJC.util = {
    fmtNum: fmtNum,
    fmtPct: fmtPct,
    shiftDays: shiftDays,
    rangeDates: rangeDates,
    el: el,
    on: on,
    poll: poll
  };
})();
