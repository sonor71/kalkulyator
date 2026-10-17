'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const base = path.join(__dirname, '..');
function app() {
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
  const win=dom.window;
  win.scrollTo=()=>{};
  win.print=()=>{};
  win.confirm=()=>true;
  win.eval(fs.readFileSync(path.join(base,'calculator.js'),'utf8'));
  win.eval(fs.readFileSync(path.join(base,'app.js'),'utf8'));
  return {win,doc:win.document,close:()=>win.close()};
}
function type(win,doc,id,value) {
  const el=doc.getElementById(id);assert.ok(el,id);
  el.value=String(value);
  el.dispatchEvent(new win.Event('input',{bubbles:true}));
}
test('desktop app loads and blocks saving until all five indicators have rules', () => {
  const {doc,close}=app();
  try {
    assert.match(doc.querySelector('#page-title').textContent,/Расчёт партии/);
    assert.equal(doc.querySelectorAll('.metric-row').length,5);
    assert.equal(doc.querySelector('#save-batch').disabled,true);
    assert.match(doc.querySelector('#result-message').textContent,/вес/);
  } finally {close();}
});
test('settings editor -> calculation -> history -> detail -> print -> remove', () => {
  const {win,doc,close}=app();
  try {
    doc.getElementById('go-settings').click();
    assert.equal(doc.querySelectorAll('.rule-card').length,5);
    const cards=Array.from(doc.querySelectorAll('.rule-card'));
    cards.slice(1).forEach(card=>{
      card.querySelector('[data-prop=configured]').checked=true;
      card.querySelector('[data-prop=acceptMin]').value='0';
      card.querySelector('[data-prop=acceptMax]').value='0';
      card.querySelector('[data-prop=neutralMin]').value='0';
      card.querySelector('[data-prop=neutralMax]').value='0';
    });
    doc.getElementById('save-settings').click();
    assert.match(doc.getElementById('toast').textContent,/Правила сохранены/);
    doc.querySelector('[data-view=calculator]').click();
    type(win,doc,'weight','100');
    type(win,doc,'sample-humidity','20');
    for(let i=2;i<=5;i++)type(win,doc,'sample-metric'+i,'0');
    assert.equal(doc.getElementById('save-batch').disabled,false);
    assert.match(doc.getElementById('final-weight').textContent,/81,5/);
    assert.match(doc.getElementById('discount').textContent,/18,5/);
    doc.getElementById('save-batch').click();
    doc.querySelector('[data-view=history]').click();
    assert.equal(doc.querySelectorAll('#history-rows tr').length,1);
    doc.querySelector('[data-action=details]').click();
    assert.equal(doc.querySelectorAll('.history-detail').length,1);
    doc.querySelector('[data-action=print]').click();
    assert.match(doc.getElementById('print-sheet').textContent,/81,5/);
    doc.querySelector('[data-action=remove]').click();
    assert.equal(doc.querySelectorAll('#history-rows tr').length,0);
    assert.equal(doc.getElementById('empty-history').hidden,false);
  } finally {close();}
});
test('settings changes persist in localStorage without network requests', () => {
  const {doc,win,close}=app();
  try {
    doc.getElementById('go-settings').click();
    const first=doc.querySelector('.rule-card');
    first.querySelector('[data-prop=name]').value='Влажность партии';
    doc.getElementById('save-settings').click();
    const saved=JSON.parse(win.localStorage.getItem('kalkulyator-config-v1'));
    assert.equal(saved.metrics[0].name,'Влажность партии');
  } finally {close();}
});
