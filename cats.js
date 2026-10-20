/* ============================================================
   明码 · 品类数据层  cats.js
   ------------------------------------------------------------
   把「品类」从写死的数组变成可增删的数据源：
     · 8 个内置品类（带几何图形编号 shape 0-7）
     · 用户自己添加的品类，存在 localStorage，刷新不丢
     · 统一提供搜索，供界面做输入即筛

   数据结构（与小程序 price.js 的 CATS 保持一致，便于将来对齐）：
     { k: 名称, base: 元/斤基准价, sigma: 对数价格波动, c: 主色, shape: 图形编号 }
   ============================================================ */
(function (g) {
  'use strict';

  var KEY = 'mm_custom_cats_v1';

  var PRESETS = [
    { k: '西瓜',   base: 2.40,  sigma: 0.24, c: '#E4513C', shape: 0 },
    { k: '猪肉',   base: 16.50, sigma: 0.18, c: '#F08AA0', shape: 1 },
    { k: '排骨',   base: 22.00, sigma: 0.20, c: '#CB6B78', shape: 2 },
    { k: '草莓',   base: 18.00, sigma: 0.30, c: '#D93A6E', shape: 3 },
    { k: '鸡蛋',   base: 5.20,  sigma: 0.14, c: '#EDB92A', shape: 4 },
    { k: '青菜',   base: 3.00,  sigma: 0.28, c: '#4FA85C', shape: 5 },
    { k: '西红柿', base: 4.20,  sigma: 0.26, c: '#EE6B33', shape: 6 },
    { k: '苹果',   base: 6.00,  sigma: 0.22, c: '#B93A34', shape: 7 }
  ];

  /* 自定义品类可选的 6 个主色，与内置色系同强度，混在一起不违和 */
  var SWATCHES = ['#E4513C', '#EE6B33', '#EDB92A', '#4FA85C', '#2E9FD8', '#A05CC4'];

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  function clean(o) {
    return {
      k: String(o.k).trim().slice(0, 8),
      base: Math.round(Number(o.base) * 100) / 100,
      sigma: Math.min(0.6, Math.max(0.05, Number(o.sigma) || 0.22)),
      c: o.c || SWATCHES[0],
      shape: 8,
      custom: true
    };
  }

  function all() {
    return PRESETS.concat(read().map(clean));
  }

  function exists(name) {
    name = String(name).trim();
    return all().some(function (c) { return c.k === name; });
  }

  /* 返回 {ok:true, index} 或 {ok:false, msg} */
  function add(item) {
    var c = clean(item);
    if (!c.k) return { ok: false, msg: '给这个品类起个名字' };
    if (!(c.base > 0) || c.base > 9999) return { ok: false, msg: '填一个合理的基准价（元/斤）' };
    if (exists(c.k)) return { ok: false, msg: '「' + c.k + '」已经有了' };

    var list = read();
    list.push(c);
    write(list);
    return { ok: true, index: PRESETS.length + list.length - 1, cat: c };
  }

  function remove(name) {
    var list = read().filter(function (c) { return String(c.k).trim() !== String(name).trim(); });
    write(list);
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /* 输入即筛：支持空串返回全部、按名称包含匹配 */
  function search(q) {
    var s = String(q || '').trim().toLowerCase();
    var list = all();
    if (!s) return list;
    return list.filter(function (c) { return c.k.toLowerCase().indexOf(s) >= 0; });
  }

  g.MMCats = {
    PRESETS: PRESETS,
    SWATCHES: SWATCHES,
    all: all,
    add: add,
    remove: remove,
    clear: clear,
    exists: exists,
    search: search
  };
})(window);
