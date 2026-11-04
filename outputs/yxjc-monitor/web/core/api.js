/* 运行监测大屏 · API 底层实现
 * 契约：CONTRACT.md §1（统一信封 code:200）、§3（ctx.api）、§4（/operation 前缀）
 * 提供 window.YXJC.api = { get(path, params), post(path, body), ws(path, onMessage) }
 * 基址优先级：?mockBase= > window.YXJC_MOCK_BASE > http://127.0.0.1:8791
 */
(function () {
  'use strict';

  var YXJC = (window.YXJC = window.YXJC || {});
  var DEFAULT_BASE = 'http://127.0.0.1:8791';

  function resolveBase() {
    var fromGlobal = window.YXJC_MOCK_BASE;
    if (typeof fromGlobal === 'string' && fromGlobal) return fromGlobal;
    try {
      var q = new URLSearchParams(window.location.search);
      var b = q.get('mockBase');
      if (b) return b;
    } catch (e) { /* URLSearchParams 不可用时忽略 */ }
    return DEFAULT_BASE;
  }

  function baseNow() {
    return resolveBase().replace(/\/+$/, '');
  }

  function buildUrl(path, params) {
    path = path || '';
    var url = baseNow() + (path.charAt(0) === '/' ? path : '/' + path);
    if (params && typeof params === 'object') {
      var qs = [];
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v === null || v === undefined || v === '') return;
        if (Array.isArray(v)) {
          v.forEach(function (item) {
            if (item === null || item === undefined) return;
            qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(item));
          });
        } else if (typeof v === 'object') {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(JSON.stringify(v)));
        } else {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        }
      });
      if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    }
    return url;
  }

  /* 解包 {code,message,data}：code!==200 → throw Error(message)；成功 → data */
  function unwrap(res) {
    if (!res.ok) {
      // 非 2xx 也尝试读取信封里的 message
      return res.text().then(function (txt) {
        var env = null;
        try { env = JSON.parse(txt); } catch (e) { /* ignore */ }
        throw new Error((env && env.message) || ('HTTP ' + res.status));
      }).catch(function (e) {
        if (e instanceof Error) throw e;
        throw new Error('HTTP ' + res.status);
      });
    }
    return res.json().then(function (env) {
      if (!env || env.code !== 200) {
        throw new Error((env && env.message) || '接口返回异常');
      }
      return env.data;
    });
  }

  function get(path, params) {
    return fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    }).then(unwrap);
  }

  function post(path, body) {
    return fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    }).then(unwrap);
  }

  function ws(path, onMessage) {
    var base = baseNow().replace(/^http/, 'ws');
    var url = base + (path.charAt(0) === '/' ? path : '/' + path);
    var sock = new WebSocket(url);
    sock.onmessage = function (ev) {
      var data = ev.data;
      try { data = JSON.parse(ev.data); } catch (e) { /* 非 JSON 原样透传 */ }
      try {
        if (typeof onMessage === 'function') onMessage(data);
      } catch (e) {
        if (window.console && console.warn) console.warn('[YXJC.api.ws] onMessage 异常：', e);
      }
    };
    sock.onerror = function (ev) {
      if (window.console && console.warn) console.warn('[YXJC.api.ws] 连接异常：', url, ev);
    };
    return {
      close: function () {
        try { sock.close(); } catch (e) { /* ignore */ }
      }
    };
  }

  YXJC.api = {
    get: get,
    post: post,
    ws: ws,
    /* 便于调试/模块自测 */
    base: baseNow,
    buildUrl: buildUrl
  };
})();
