/* 运行监测大屏 · 外壳与模块编排
 * 契约：CONTRACT.md §3 / §3.1
 *   YXJC.register(def)  → 注册表（region + order 排序）
 *   YXJC.boot()         → 在 4 个 region 内建 .yxjc-card 并 mount
 *   ctx = { api, openModal, closeModal, toast }
 * 另负责：1920×1080 scale 自适应、resize 分发（yxjc:resize）、头部时钟/全屏
 */
(function () {
  'use strict';

  var YXJC = (window.YXJC = window.YXJC || {});
  var BASE_W = 1920;
  var BASE_H = 1080;

  var registry = [];      // 所有注册的模块定义
  var mounted = {};       // id -> { def, card, dispose }
  var modalState = null;  // { def, overlay, dispose }
  var booted = false;

  function byId(id) { return document.getElementById(id); }

  /* ---------------- 注册 ---------------- */

  function register(def) {
    if (!def || !def.id) {
      if (window.console && console.warn) console.warn('[YXJC.register] 无效定义（缺 id）：', def);
      return;
    }
    if (typeof def.mount !== 'function') {
      if (window.console && console.warn) console.warn('[YXJC.register] 模块缺 mount：', def.id);
      return;
    }
    // 同 id 去重（后注册覆盖，避免重复加载导致重复卡片）
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === def.id) {
        if (window.console && console.warn) console.warn('[YXJC.register] 重复 id，已忽略：', def.id);
        return;
      }
    }
    registry.push(def);
  }

  /* ---------------- ctx ---------------- */

  function makeCtx() {
    return {
      api: YXJC.api,
      openModal: openModal,
      closeModal: closeModal,
      toast: toast
    };
  }

  /* ---------------- 卡片 ---------------- */

  function buildCard(def) {
    var card = document.createElement('div');
    card.className = 'yxjc-card';
    card.setAttribute('data-module', def.id);

    var hd = document.createElement('div');
    hd.className = 'yxjc-card__hd';

    var title = document.createElement('span');
    title.className = 'yxjc-card__title';
    title.textContent = def.name || def.id;
    hd.appendChild(title);

    var bd = document.createElement('div');
    bd.className = 'yxjc-card__bd';

    card.appendChild(hd);
    card.appendChild(bd);
    return { card: card, body: bd };
  }

  function mountInto(def, body, ctx, extraParam) {
    try {
      return def.mount(body, ctx, extraParam);
    } catch (e) {
      if (window.console && console.warn) console.warn('[YXJC] mount 失败：' + def.id, e);
      body.innerHTML = '<div class="yxjc-empty">模块加载失败</div>';
      return null;
    }
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    if (booted) return;
    booted = true;

    renderHead();
    applyScale();

    var regionMap = {
      head: byId('yxjc-head'),
      left: byId('yxjc-left'),
      center: byId('yxjc-center'),
      right: byId('yxjc-right')
    };
    var buckets = { head: [], left: [], center: [], right: [] };

    registry.forEach(function (def) {
      if (def.modal) return;                 // 弹窗模块不占 region
      var r = def.region;
      if (!buckets[r]) r = 'center';         // 非法 region 兜底
      buckets[r].push(def);
    });

    Object.keys(buckets).forEach(function (region) {
      var container = regionMap[region];
      if (!container) return;
      var list = buckets[region].slice().sort(function (a, b) {
        return (Number(a.order) || 0) - (Number(b.order) || 0);
      });
      list.forEach(function (def) {
        var box = buildCard(def);
        container.appendChild(box.card);
        var ctx = makeCtx();                  // 每模块独立 ctx（同名方法，互不干扰）
        var dispose = mountInto(def, box.body, ctx);
        mounted[def.id] = { def: def, card: box.card, dispose: dispose };
      });
    });

    // 首帧后再派发一次 resize，让图表拿到真实尺寸重绘
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event('yxjc:resize'));
    });
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(id, params) {
    var def = null;
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === id) { def = registry[i]; break; }
    }
    if (!def) {
      toast('未注册的模块：' + id);
      if (window.console && console.warn) console.warn('[YXJC.openModal] 未找到模块：', id);
      return;
    }
    closeModal();

    var layer = byId('yxjc-modal-layer');
    if (!layer) return;

    var overlay = document.createElement('div');
    overlay.className = 'yxjc-modal-overlay';

    var panel = document.createElement('div');
    panel.className = 'yxjc-modal-panel';
    panel.setAttribute('data-module', def.id);

    var hd = document.createElement('div');
    hd.className = 'yxjc-modal-hd';

    var title = document.createElement('span');
    title.className = 'yxjc-modal-title';
    title.textContent = def.name || def.id;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'yxjc-modal-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeModal);

    hd.appendChild(title);
    hd.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'yxjc-modal-bd';

    panel.appendChild(hd);
    panel.appendChild(body);
    overlay.appendChild(panel);

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeModal();
    });

    layer.appendChild(overlay);
    layer.classList.add('is-open');

    var ctx = makeCtx();
    var dispose = mountInto(def, body, ctx, params);
    modalState = { def: def, overlay: overlay, dispose: dispose };

    // 弹窗内图表需要尺寸
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event('yxjc:resize'));
    });
  }

  function closeModal() {
    if (modalState && typeof modalState.dispose === 'function') {
      try { modalState.dispose(); } catch (e) {
        if (window.console && console.warn) console.warn('[YXJC.closeModal] dispose 异常：', e);
      }
    }
    var layer = byId('yxjc-modal-layer');
    if (layer) {
      layer.innerHTML = '';
      layer.classList.remove('is-open');
    }
    modalState = null;
  }

  /* ---------------- toast ---------------- */

  function toast(msg) {
    var wrap = document.querySelector('.yxjc-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'yxjc-toast-wrap';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.className = 'yxjc-toast';
    t.textContent = msg == null ? '' : String(msg);
    wrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, 1600);
  }

  /* ---------------- 头部 ---------------- */

  function renderHead() {
    var head = byId('yxjc-head');
    if (!head || head.getAttribute('data-ready') === '1') return;
    head.setAttribute('data-ready', '1');
    head.innerHTML = '';

    var left = document.createElement('div');
    left.className = 'yxjc-head__left';
    var logo = document.createElement('span');
    logo.className = 'yxjc-head__logo';
    var title = document.createElement('span');
    title.className = 'yxjc-head__title';
    title.textContent = '江阴靖江长江隧道 · 运行监测';
    left.appendChild(logo);
    left.appendChild(title);

    var center = document.createElement('div');
    center.className = 'yxjc-head__center';
    var clock = document.createElement('span');
    clock.className = 'yxjc-head__clock';
    clock.id = 'yxjc-clock';
    clock.textContent = '--';
    center.appendChild(clock);

    var right = document.createElement('div');
    right.className = 'yxjc-head__right';
    var fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'yxjc-head__fs';
    fsBtn.textContent = '全屏';
    fsBtn.addEventListener('click', toggleFullscreen);
    right.appendChild(fsBtn);

    head.appendChild(left);
    head.appendChild(center);
    head.appendChild(right);

    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function tick() {
      var d = new Date();
      clock.textContent =
        d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
        ' 周' + weekdays[d.getDay()] + ' ' +
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);

    document.addEventListener('fullscreenchange', function () {
      fsBtn.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    });
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        var p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(function () { toast('当前环境不支持全屏'); });
      } else {
        document.exitFullscreen();
      }
    } catch (e) {
      toast('当前环境不支持全屏');
    }
  }

  /* ---------------- scale 自适应 ---------------- */

  var rafPending = false;

  function applyScale() {
    var root = byId('yxjc-root');
    if (!root) return;
    var vw = window.innerWidth || document.documentElement.clientWidth || BASE_W;
    var vh = window.innerHeight || document.documentElement.clientHeight || BASE_H;
    var scale = Math.min(vw / BASE_W, vh / BASE_H);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    root.style.transformOrigin = 'top left';
    root.style.transform = 'scale(' + scale + ')';
  }

  function onResize() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      applyScale();
      window.dispatchEvent(new Event('yxjc:resize'));
    });
  }

  window.addEventListener('resize', onResize);
  // ESC 关闭弹窗
  window.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Escape' || ev.key === 'Esc') && modalState) closeModal();
  });

  /* ---------------- 导出 ---------------- */

  YXJC.register = register;
  YXJC.boot = boot;
  YXJC.openModal = openModal;
  YXJC.closeModal = closeModal;
  YXJC.toast = toast;
  YXJC._registry = registry;
})();
