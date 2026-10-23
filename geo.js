/* ============================================================
   明码 · 自动定位模块  geo.js  v3
   ------------------------------------------------------------
   目标体验：像高德那样——打开就弹「是否允许定位」，点允许，
   之后每次打开直接自动定位，不再询问。

   v3 的取舍（v2 把用户定到北京，教训在这）：
   ① 设备定位优先，且一次都不许被 IP 结果抢先覆盖。
      浏览器授权只在「顶层页面 + 安全上下文」才弹框；预览面板是 iframe，
      浏览器会静默拒绝，于是 v2 退回 IP 定位，而移动网络出口 IP
      常被判成别的城市 —— 这就是"我在合肥却被定位到北京"。
      → v3 在设备定位返回失败之前，绝不把 IP 结果写上屏。
   ② IP 定位降级为最后兜底，并且一定要在界面上说清"这是 IP 推测"。
   ③ 新增 /api/ip（本地启动器提供），服务端查 IP，绕开 CORS 与 CSP。
   ============================================================ */
(function (g) {
  'use strict';

  /* ---------- 42 城中心点与价格指数（1.00 = 全国中位） ---------- */
  var CITIES = [
    ['北京', 39.9042, 116.4074, 1.18], ['上海', 31.2304, 121.4737, 1.22],
    ['深圳', 22.5431, 114.0579, 1.25], ['广州', 23.1291, 113.2644, 1.12],
    ['杭州', 30.2741, 120.1551, 1.10], ['南京', 32.0603, 118.7969, 1.05],
    ['成都', 30.5728, 104.0668, 0.98], ['重庆', 29.5630, 106.5516, 0.95],
    ['武汉', 30.5928, 114.3055, 1.00], ['西安', 34.3416, 108.9398, 0.96],
    ['苏州', 31.2989, 120.5853, 1.08], ['天津', 39.3434, 117.3616, 1.02],
    ['长沙', 28.2282, 112.9388, 0.97], ['郑州', 34.7466, 113.6254, 0.94],
    ['青岛', 36.0671, 120.3826, 1.03], ['沈阳', 41.8057, 123.4315, 1.02],
    ['合肥', 31.8206, 117.2272, 1.00], ['宁波', 29.8683, 121.5440, 1.10],
    ['东莞', 23.0207, 113.7518, 1.06], ['佛山', 23.0219, 113.1214, 1.04],
    ['昆明', 25.0406, 102.7123, 0.88], ['厦门', 24.4798, 118.0894, 1.10],
    ['福州', 26.0745, 119.2965, 1.02], ['济南', 36.6512, 117.1201, 0.98],
    ['大连', 38.9140, 121.6147, 1.04], ['长春', 43.8171, 125.3235, 0.96],
    ['哈尔滨', 45.8038, 126.5349, 1.05], ['石家庄', 38.0428, 114.5149, 0.93],
    ['太原', 37.8706, 112.5489, 0.92], ['南昌', 28.6820, 115.8579, 0.96],
    ['贵阳', 26.6470, 106.6302, 0.97], ['南宁', 22.8170, 108.3665, 0.99],
    ['海口', 20.0442, 110.1999, 1.06], ['兰州', 36.0611, 103.8343, 0.92],
    ['乌鲁木齐', 43.8256, 87.6168, 0.98], ['呼和浩特', 40.8414, 111.7519, 0.95],
    ['银川', 38.4872, 106.2309, 0.93], ['西宁', 36.6171, 101.7782, 0.94],
    ['无锡', 31.4912, 120.3119, 1.06], ['温州', 27.9938, 120.6994, 1.08],
    ['珠海', 22.2710, 113.5767, 1.12], ['三亚', 18.2528, 109.5119, 1.20]
  ].map(function (a) {
    return { name: a[0], lat: a[1], lng: a[2], idx: a[3] };
  });

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearest(lat, lng) {
    var best = CITIES[0], min = Infinity;
    for (var i = 0; i < CITIES.length; i++) {
      var d = haversine(lat, lng, CITIES[i].lat, CITIES[i].lng);
      if (d < min) { min = d; best = CITIES[i]; }
    }
    return {
      name: best.name, idx: best.idx, lat: lat, lng: lng,
      distance: Math.round(min),
      offGrid: min > 150
    };
  }

  /* ---------- JSONP（CSP 环境里唯一能出去的 HTTP 通道） ---------- */
  var jsonpSeq = 0;
  function jsonp(url, ms) {
    return new Promise(function (resolve) {
      var name = '__mmgeo_' + (++jsonpSeq) + '_' + Math.floor(Math.random() * 1e6);
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () { finish(null); }, ms);
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete g[name]; } catch (e) { g[name] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(v);
      }
      g[name] = function (d) { finish(d); };
      s.onerror = function () { finish(null); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function fetchJSON(url, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      try {
        fetch(url, { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (!done) { done = true; clearTimeout(timer); resolve(j); } })
          .catch(function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { done = true; clearTimeout(timer); resolve(null); }
    });
  }

  function norm(j) {
    if (!j) return null;
    var lat = j.latitude != null ? j.latitude : (j.lat != null ? j.lat : null);
    var lng = j.longitude != null ? j.longitude : (j.lon != null ? j.lon : null);
    if (lat == null && typeof j.loc === 'string') {
      var p = j.loc.split(',');
      lat = p[0]; lng = p[1];
    }
    if (lat == null || lng == null) return null;
    if (!isFinite(+lat) || !isFinite(+lng)) return null;
    if (Math.abs(+lat) > 90 || Math.abs(+lng) > 180) return null;
    return { lat: +lat, lng: +lng, city: j.city || j.region || '' };
  }

  var lastDiag = null;

  /* 各家 IP 库返回的是英文城市名，先映射回中文，才能和坐标交叉验证 */
  var EN2CN = {
    'beijing': '北京', 'shanghai': '上海', 'shenzhen': '深圳', 'guangzhou': '广州',
    'hangzhou': '杭州', 'nanjing': '南京', 'chengdu': '成都', 'chongqing': '重庆',
    'wuhan': '武汉', 'xian': '西安', "xi'an": '西安', 'suzhou': '苏州', 'tianjin': '天津',
    'changsha': '长沙', 'zhengzhou': '郑州', 'qingdao': '青岛', 'shenyang': '沈阳',
    'hefei': '合肥', 'ningbo': '宁波', 'dongguan': '东莞', 'foshan': '佛山',
    'kunming': '昆明', 'xiamen': '厦门', 'fuzhou': '福州', 'jinan': '济南',
    'dalian': '大连', 'changchun': '长春', 'harbin': '哈尔滨', 'shijiazhuang': '石家庄',
    'taiyuan': '太原', 'nanchang': '南昌', 'guiyang': '贵阳', 'nanning': '南宁',
    'haikou': '海口', 'lanzhou': '兰州', 'urumqi': '乌鲁木齐', 'hohhot': '呼和浩特',
    'yinchuan': '银川', 'xining': '西宁', 'wuxi': '无锡', 'wenzhou': '温州',
    'zhuhai': '珠海', 'sanya': '三亚'
  };

  /* 投票：先做「名称 vs 坐标」一致性校验，再按城市计票。
     ip.sb 就属于典型的不一致——城市写 Guangzhou，坐标却落在河南，直接判无效。 */
  function vote(list) {
    var scored = [];
    list.forEach(function (it) {
      if (!it || !it.hit) return;
      var byCoord = nearest(it.hit.lat, it.hit.lng).name;
      var raw = String(it.hit.city || '').trim().toLowerCase();
      var byName = EN2CN[raw] || null;
      scored.push({
        id: it.id,
        city: byName || byCoord,
        byCoord: byCoord,
        byName: byName,
        consistent: byName ? byName === byCoord : true
      });
    });
    if (!scored.length) return null;

    var good = scored.filter(function (s) { return s.consistent; });
    if (!good.length) good = scored;          // 全都不一致时降级，总比没有强

    /* 平票时的优先级：按各家在国内 IP 库的实测准确度排，可按实际情况调整。
       排序后配合下面的严格大于比较，平票时保留优先级更高的一票。 */
    var PRIORITY = { 'ipinfo.io': 3, 'ipwho.is': 2, 'ip.sb': 1 };
    var prio = function (id) { return PRIORITY[String(id).replace(/^local:/, '')] || 0; };
    good.sort(function (a, b) { return prio(b.id) - prio(a.id); });

    var votes = {}, bestName = null, bestN = 0;
    good.forEach(function (s) { votes[s.city] = (votes[s.city] || 0) + 1; });
    Object.keys(votes).forEach(function (k) {
      if (votes[k] > bestN) { bestN = votes[k]; bestName = k; }
    });

    var target = CITIES.filter(function (c) { return c.name === bestName; })[0] || CITIES[0];
    return {
      name: target.name,
      idx: target.idx,
      lat: target.lat,
      lng: target.lng,
      distance: 0,
      offGrid: false,
      source: 'ip',
      confidence: good.length >= 2 && bestN >= 2 ? 'mid' : 'low',
      votes: votes,
      answers: scored
    };
  }

  /* 优先走本地启动器的 /api/ip（服务端查，无 CORS / CSP 问题） */
  function ipLocal(ms) {
    var u = '/api/ip';
    if (typeof location === 'undefined') return Promise.resolve(null);
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return Promise.resolve(null);
    return fetchJSON(u, ms || 4000).then(function (j) {
      if (!j || !j.sources || !j.sources.length) return null;
      return j.sources.map(function (s) {
        return { id: 'local:' + s.id, hit: norm(s) };
      });
    });
  }

  var IP_SOURCES = [
    /* 顺序即优先级：国内 IP 库准确度 ipinfo ≈ ipwho > ip.sb，jsonp 仅作无 CSP 时的补充 */
    { id: 'ipinfo.io', kind: 'fetch', url: 'https://ipinfo.io/json' },
    { id: 'ipwho.is', kind: 'fetch', url: 'https://ipwho.is/' },
    { id: 'ip.sb/jsonp', kind: 'jsonp', url: 'https://api.ip.sb/geoip' }
  ];

  function ipAll(ms) {
    ms = ms || 3200;
    var t0 = Date.now();
    return ipLocal(ms).catch(function () { return null; }).then(function (local) {
      if (local && local.length) {
        lastDiag = { at: new Date().toISOString(), ms: Date.now() - t0, via: 'local-proxy' };
        return vote(local);
      }
      return Promise.all(IP_SOURCES.map(function (s) {
        var p = s.kind === 'jsonp' ? jsonp(s.url, ms) : fetchJSON(s.url, ms);
        return p.then(function (j) { return { id: s.id, hit: norm(j) }; });
      })).then(function (arr) {
        lastDiag = { at: new Date().toISOString(), ms: Date.now() - t0, via: 'browser' };
        return vote(arr);
      });
    });
  }

  /* ---------- 设备定位 ---------- */
  function gps(ms) {
    ms = ms || 9000;
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({ error: 'unsupported' });
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ error: 'timeout' }); } }, ms);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) });
        },
        function (err) {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve({
            error: err && err.code === 1 ? 'denied' : err && err.code === 2 ? 'unavailable' : err && err.code === 3 ? 'timeout' : 'error',
            message: (err && err.message) || ''
          });
        },
        { enableHighAccuracy: true, timeout: ms, maximumAge: 60000 }
      );
    });
  }

  function inFrame() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  /* ---------- UI 绑定 ---------- */
  function bind(opts) {
    opts = opts || {};
    var sel  = opts.select || document.getElementById('region');
    var btn  = opts.button || document.getElementById('locate');
    var hint = opts.hint === null ? null
             : (opts.hint || document.getElementById('rhint')
                || document.getElementById('regionHint')
                || document.getElementById('hmeta'));
    var onState = opts.onState || function () {};
    var baseText = btn ? btn.textContent : '';
    var last = null;

    function setHint(t) { if (hint) hint.textContent = t; }
    function setBtn(t) { if (btn) btn.textContent = t; }

    function pick(name) {
      if (!sel || !sel.options) return -1;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].textContent.indexOf(name) === 0) return i;
      }
      return -1;
    }

    function apply(res, source) {
      var i = pick(res.name);
      if (i < 0) return false;
      if (sel.value !== String(i)) {
        sel.value = i;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof opts.refresh === 'function') opts.refresh();

      last = {
        name: res.name, idx: res.idx, distance: res.distance,
        source: source, confidence: res.confidence || 'high',
        acc: res.acc || null, offGrid: !!res.offGrid,
        lat: (res.lat != null) ? res.lat : null,
        lng: (res.lng != null) ? res.lng : null
      };

      if (source === 'gps') {
        setHint(res.offGrid
          ? '已定位到最近的 ' + res.name + '（距你 ' + res.distance + ' km，本地暂无更近的城市）'
          : '已定位：' + res.name + '（距你 ' + res.distance + ' km）');
        setBtn('重新定位');
      } else {
        setHint('IP 推测：' + res.name + '（设备定位不可用，可能不准）');
        setBtn('重新定位');
      }
      onState(source === 'gps' ? 'gps' : 'ip', last);
      return true;
    }

    function fail(reason) {
      var isFile = false;
      try { isFile = location.protocol === 'file:'; } catch (e) {}

      var msg;
      if (isFile) {
        msg = '本地文件模式无法定位 · 请部署后通过网页打开，或手动选择城市';
      } else if (reason === 'denied' && inFrame()) {
        msg = '内嵌窗口不弹定位授权 · 请在独立网页标签中打开';
      } else if (reason === 'denied') {
        msg = '你拒绝了定位授权 · 点地址栏左侧图标可以重新允许';
      } else if (reason === 'unsupported') {
        msg = '这个浏览器不支持定位 · 请手动选择城市';
      } else if (inFrame()) {
        msg = '内嵌窗口拿不到定位 · 请在独立网页标签中打开';
      } else {
        msg = '定位失败 · 请检查系统定位服务，或手动选择城市';
      }
      setHint(msg);
      setBtn(baseText);
      onState(reason, null);
    }

    function run(useGps) {
      setBtn('定位中…');
      setHint(opts.locatingText || '正在定位…浏览器会询问是否允许');
      onState('locating', null);

      /* 只走 IP（用户手动点了「用网络定位」时才用） */
      if (!useGps) {
        return ipAll().then(function (v) {
          if (v) apply(v, 'ip'); else fail('unavailable');
        });
      }

      var slow = setTimeout(function () {
        setHint('仍在定位…如果没有弹授权框，请在浏览器地址栏允许定位');
      }, 4000);

      return gps(opts.gpsTimeout).then(function (pos) {
        clearTimeout(slow);
        if (pos && pos.lat != null) {
          var r = nearest(pos.lat, pos.lng);
          r.acc = pos.acc;
          return apply(r, 'gps');
        }
        /* 设备定位失败，才退到 IP —— 顺序反过来就会出现"人在合肥、显示北京" */
        return ipAll().then(function (v) {
          if (v) {
            apply(v, 'ip');
          } else {
            fail(pos.error || 'unavailable');
          }
        });
      });
    }

    if (btn) btn.addEventListener('click', function () { run(true); });

    /* 打开即定位：这一步会触发浏览器的权限询问 */
    if (opts.auto !== false) {
      var start = function () { run(opts.auto === 'ip' ? false : true); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    }

    return { run: run, current: function () { return last; } };
  }

  g.MMGeo = {
    CITIES: CITIES,
    haversine: haversine,
    nearest: nearest,
    jsonp: jsonp,
    ipLocate: ipAll,
    gps: gps,
    bind: bind,
    diag: function () { return lastDiag; }
  };
})(window);
