/* Kalkulyator — pure calculation engine. No network or runtime dependencies. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KalkCalculator = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var VERSION = 1;
  function metric(id, name, configured) {
    return { id:id, name:name, unit:'%', configured:!!configured,
      acceptMin:null, acceptMax:null, neutralMin:0, neutralMax:0, below:[], above:[] };
  }
  function defaults() {
    var humidity = metric('humidity', 'Влажность', true);
    humidity.acceptMin = 4;
    humidity.neutralMin = 6;
    humidity.neutralMax = 8;
    humidity.below = [{to:4, rate:2.5}];
    humidity.above = [{to:12, rate:1}, {to:15, rate:1.5}, {to:20, rate:2}, {to:null, rate:3}];
    var metrics = [humidity];
    for (var i=2;i<=5;i++) metrics.push(metric('metric'+i, 'Показатель '+i, false));
    return {version:VERSION, metrics:metrics};
  }
  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    var s = value.trim().replace(/\s/g, '').replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function round(n) { return Math.round((n + Number.EPSILON)*1e8)/1e8; }
  function validateMetric(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' ||
        typeof m.name !== 'string' || !m.name.trim() ||
        typeof m.unit !== 'string') return 'Укажите название и единицу измерения.';
    if (!m.configured) return 'Правила ещё не настроены.';
    var a = parseNumber(m.neutralMin), b = parseNumber(m.neutralMax);
    if (a === null || b === null || a > b) return 'Неверно задан коридор без скидки.';
    var min = m.acceptMin == null ? null : parseNumber(m.acceptMin);
    var max = m.acceptMax == null ? null : parseNumber(m.acceptMax);
    if ((m.acceptMin != null && min === null) || (m.acceptMax != null && max === null) ||
        (min !== null && min > a) || (max !== null && max < b) ||
        (min !== null && max !== null && min > max)) return 'Неверные границы приёмки.';
    for (var side of ['below', 'above']) {
      if (!Array.isArray(m[side])) return 'Некорректные интервалы.';
      var cursor = side === 'below' ? a : b;
      for (var i=0;i<m[side].length;i++) {
        var t=m[side][i], endpoint=t.to == null ? null : parseNumber(t.to), rate=parseNumber(t.rate);
        if (rate === null || rate < 0) return 'Ставка скидки должна быть неотрицательной.';
        if (endpoint === null && t.to != null) return 'Некорректная граница интервала.';
        if (endpoint === null && i !== m[side].length-1) return 'Бесконечный интервал должен быть последним.';
        if (endpoint !== null && (side === 'below' ? endpoint >= cursor : endpoint <= cursor))
          return 'Интервалы должны идти последовательно.';
        cursor = endpoint;
      }
    }
    if (min !== null && min < a && (!m.below.length ||
         (m.below[m.below.length-1].to !== null && m.below[m.below.length-1].to > min)))
      return 'Интервалы ниже нормы не покрывают допустимый диапазон.';
    if (max !== null && max > b && (!m.above.length ||
         (m.above[m.above.length-1].to !== null && m.above[m.above.length-1].to < max)))
      return 'Интервалы выше нормы не покрывают допустимый диапазон.';
    return null;
  }
  function evaluate(m, raw) {
    if (raw === '' || raw == null) return {status:'missing', discount:0, parts:[]};
    var value=parseNumber(raw);
    if (value === null) return {status:'invalid', message:'Введите число.', discount:0, parts:[]};
    var error=validateMetric(m);
    if (error) return {status:'unconfigured', value:value, message:error, discount:0, parts:[]};
    var min=m.acceptMin == null ? null : parseNumber(m.acceptMin),
        max=m.acceptMax == null ? null : parseNumber(m.acceptMax);
    if ((min !== null && value < min-1e-9) || (max !== null && value > max+1e-9))
      return {status:'rejected', value:value, message:'Вне допустимых границ приёмки.', discount:0, parts:[]};
    var baseLow=parseNumber(m.neutralMin), baseHigh=parseNumber(m.neutralMax);
    var side=value < baseLow ? 'below' : (value > baseHigh ? 'above' : 'neutral');
    if (side === 'neutral') return {status:'ok', value:value, discount:0, parts:[]};
    var cursor=side==='below' ? baseLow : baseHigh, parts=[];
    for (var t of m[side]) {
      if (side==='above' && cursor>=value-1e-9) break;
      if (side==='below' && cursor<=value+1e-9) break;
      var edge=t.to===null ? (side==='above' ? Infinity : -Infinity) : parseNumber(t.to);
      var next=side==='above' ? Math.min(value,edge) : Math.max(value,edge);
      var dist=Math.abs(next-cursor);
      if (dist>1e-9) parts.push({
        from:round(Math.min(cursor,next)), to:round(Math.max(cursor,next)),
        rate:parseNumber(t.rate), discount:round(dist*parseNumber(t.rate))
      });
      cursor=next;
    }
    if (Math.abs(cursor-value)>1e-8)
      return {status:'incomplete', value:value, message:'Для значения нет правила скидки.',discount:0,parts:[]};
    return {status:'ok', value:value, discount:round(parts.reduce(function(s,p){return s+p.discount;},0)), parts:parts};
  }
  function calculate(config, samples, weightRaw) {
    var weight=parseNumber(weightRaw);
    var weightError=weight===null || weight<=0 ? 'Введите физический вес больше нуля.' : null;
    var results=config.metrics.map(function (m) {
      var r=evaluate(m, samples[m.id]);
      return Object.assign({id:m.id,name:m.name,unit:m.unit},r);
    });
    var pending=results.filter(function(r){return r.status==='missing'||r.status==='unconfigured';}).length;
    var bad=results.filter(function(r){return ['invalid','rejected','incomplete'].includes(r.status);});
    var total=round(results.filter(function(r){return r.status==='ok';}).reduce(function(s,r){return s+r.discount;},0));
    var error=weightError || (bad.length ? 'Обнаружены ошибки в лабораторных показателях.' : null) ||
      (pending ? 'Заполните и настройте все пять показателей.' : null) ||
      (total>100 ? 'Суммарная скидка превышает 100%. Проверьте правила.' : null);
    return {weight:weight, weightError:weightError, results:results, pending:pending,
      discount:total, finalWeight:error ? null : round(weight*(1-total/100)), error:error, ready:!error};
  }
  return {defaults:defaults, parseNumber:parseNumber, validateMetric:validateMetric,
    evaluate:evaluate, calculate:calculate, round:round, VERSION:VERSION};
});
