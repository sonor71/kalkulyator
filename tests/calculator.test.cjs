'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../calculator.js');
const m = calc.defaults().metrics[0];
function at(v) {return calc.evaluate(m, v);}
test('wet seed: moisture at 20% gets 18.5% discount per supplied example', () => {
  const r=at(20);
  assert.equal(r.status,'ok');
  assert.equal(r.discount,18.5);
  assert.deepEqual(r.parts.map(x=>x.discount),[4,4.5,10]);
});
test('neutral moisture interval 6–8% has no discount', () => {
  for(const v of [6,7,8])assert.equal(at(v).discount,0);
});
test('low moisture 4–6% uses rate 2.5% per point measured from 6%', () => {
  assert.equal(at(4).discount,5);
  assert.equal(at(5).discount,2.5);
  assert.equal(at(5.5).discount,1.25);
});
test('below 4% is rejected; no negative credit weight', () => {
  assert.equal(at(3.99).status,'rejected');
});
test('tier boundaries and fractional values', () => {
  assert.equal(at(10).discount,2);
  assert.equal(at(12).discount,4);
  assert.equal(at(13).discount,5.5);
  assert.equal(at(15).discount,8.5);
  assert.equal(at(21).discount,21.5);
});
test('20% moisture at 100kg gives 81.5kg when other metrics are configured as neutral', () => {
  const settings=calc.defaults();
  settings.metrics.slice(1).forEach(x=>{x.configured=true;x.neutralMin=0;x.neutralMax=0;x.acceptMin=0;x.acceptMax=0;});
  const samples={humidity:20,metric2:0,metric3:0,metric4:0,metric5:0};
  const r=calc.calculate(settings,samples,100);
  assert.equal(r.ready,true);
  assert.equal(r.discount,18.5);
  assert.equal(r.finalWeight,81.5);
});
test('incomplete metric rules block final result rather than silently assume zero', () => {
  const settings=calc.defaults();
  const r=calc.calculate(settings,{humidity:20,metric2:3,metric3:3,metric4:3,metric5:3},100);
  assert.equal(r.ready,false);assert.equal(r.finalWeight,null);
});
test('multiple indicators sum their discounts', () => {
  const settings=calc.defaults();
  settings.metrics.slice(1).forEach(x=>{x.configured=true;x.neutralMin=0;x.neutralMax=0;x.acceptMin=0;x.above=[{to:null,rate:1}];});
  const r=calc.calculate(settings,{humidity:12,metric2:1,metric3:2,metric4:3,metric5:4},100);
  assert.equal(r.ready,true);assert.equal(r.discount,14);assert.equal(r.finalWeight,86);
});
test('validates invalid and incomplete rule coverage', () => {
  const setting={...m,above:[{to:12,rate:1}]};
  assert.equal(calc.evaluate(setting,18).status,'incomplete');
  assert.ok(calc.validateMetric({...m,above:[{to:12,rate:-1}]}));
});
test('comma decimal input and invalid strings', () => {
  assert.equal(at('12,5').discount,4.75);
  assert.equal(at('пять').status,'invalid');
  assert.equal(at('20%').status,'invalid');
});
test('total discount over 100% blocks result', () => {
  const settings=calc.defaults();
  settings.metrics.slice(1).forEach(x=>{x.configured=true;x.neutralMin=0;x.neutralMax=0;x.above=[{to:null,rate:20}];});
  const r=calc.calculate(settings,{humidity:20,metric2:2,metric3:2,metric4:2,metric5:2},100);
  assert.equal(r.ready,false);assert.match(r.error,/100/);
});
