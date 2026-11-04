/* 运行监测大屏 · 业务模块清单与顺序加载器
 *
 * 浏览器无法枚举目录，故在此维护显式清单（唯一来源：CONTRACT.md §5）。
 * §5 共 14 行，其中 `shell` 由 core/shell.js 承担，不属业务模块文件；
 * 下列 13 个业务模块文件一一对应其余 13 行。
 *
 * 加载策略：按顺序注入 <script src="modules/xxx.js">（保持执行顺序），
 * 单个文件缺失/失败只 console.warn 并继续，保证并行同事产物陆续到位时不白屏。
 * 全部尝试完毕后统一调用 YXJC.boot()。
 */
(function () {
  'use strict';

  var YXJC = (window.YXJC = window.YXJC || {});

  YXJC.MODULE_FILES = [
    'flow-today.js',              // 当日总流量            left
    'flow-vehicle-type.js',       // 车型分布              left / modal: modal-vehicle-type
    'flow-forecast-realtime.js',  // 实时流量预测          left
    'flow-forecast-holiday.js',   // 节假日流量预测        left / modal: modal-forecast-holiday
    'point-today.js',             // 今日累计              left
    'point-car-detail.js',        // 车辆明细              modal
    'point-waybill.js',           // 危化品车运单列表      modal
    'detection-event-list.js',    // 智能侦测事件列表      right / center
    'detection-alert-disposal.js',// 告警处置              modal
    'env-monitor.js',             // 环境监测              right
    'device-monitor.js',          // 设备监测              right
    'weather-alarm.js',           // 异常天气              modal
    'report-list.js'              // 异常上报              modal
  ];

  function loadOne(file) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'modules/' + file;
      s.async = false;
      s.charset = 'utf-8';
      s.onload = function () { resolve(true); };
      s.onerror = function () {
        if (window.console && console.warn) {
          console.warn('[YXJC] 模块文件缺失或加载失败，已忽略：modules/' + file);
        }
        resolve(false);
      };
      (document.head || document.body).appendChild(s);
    });
  }

  var loadingPromise = null;

  function loadModules() {
    if (loadingPromise) return loadingPromise;
    var seq = Promise.resolve();
    YXJC.MODULE_FILES.forEach(function (file) {
      seq = seq.then(function () { return loadOne(file); });
    });
    loadingPromise = seq.then(function () {
      if (typeof YXJC.boot === 'function') YXJC.boot();
    });
    return loadingPromise;
  }

  YXJC.loadModules = loadModules;
})();
