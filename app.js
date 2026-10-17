/* Kalkulyator desktop UI, local-only storage and exports. */
(function () {
  'use strict';
  var engine=window.KalkCalculator;
  if (!engine) { document.body.textContent='Ошибка загрузки расчётного модуля.'; return; }
  var KEY_CONFIG='kalkulyator-config-v1', KEY_HISTORY='kalkulyator-history-v1';
  var $=function(s,ctx){return (ctx||document).querySelector(s);};
  var $$=function(s,ctx){return Array.from((ctx||document).querySelectorAll(s));};
  function esc(v) {return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function numberText(n,digits){return typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits==null?2:digits}).format(n):'—';}
  function valueText(n){return n==null?'':String(n).replace('.',',');}
  function readStore(key,fallback){try{var x=localStorage.getItem(key);return x?JSON.parse(x):fallback;}catch(e){return fallback;}}
  function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){notice('Не удалось сохранить на устройстве. Проверьте доступ к хранилищу.');return false;}}
  function notice(message){var el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(function(){el.hidden=true;},4300);}
  function baseConfig(c){
    if(!c||c.version!==1||!Array.isArray(c.metrics)||c.metrics.length!==5) return null;
    var ids=['humidity','metric2','metric3','metric4','metric5'];
    if(!c.metrics.every(function(m,i){return m&&m.id===ids[i]&&typeof m.name==='string'&&m.name.length<=100&&typeof m.unit==='string'&&m.unit.length<=30&&typeof m.configured==='boolean'&&Array.isArray(m.below)&&Array.isArray(m.above)&&m.below.length<=30&&m.above.length<=30;})) return null;
    return c;
  }
  var config=baseConfig(readStore(KEY_CONFIG,null)) || engine.defaults();
  var historyData=readStore(KEY_HISTORY,[]);
  if(!Array.isArray(historyData)) historyData=[];
  historyData=historyData.filter(function(h){return h&&typeof h==='object'&&typeof h.id==='string'&&h.result&&h.result.ready===true&&typeof h.result.finalWeight==='number';}).slice(0,2000);
  var lastCalc=null, rulesDraft=null, currentView='calculator';
  var dateInput=$('#batch-date');
  dateInput.value=new Date().toLocaleDateString('en-CA'); // fallback below for browsers not returning ISO
  if (!/^\d{4}-\d\d-\d\d$/.test(dateInput.value)) {
    var today=new Date(), p=function(x){return String(x).padStart(2,'0');};
    dateInput.value=today.getFullYear()+'-'+p(today.getMonth()+1)+'-'+p(today.getDate());
  }
  $('#today-label').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
  function formData(){
    var samples={}; config.metrics.forEach(function(m){var el=document.getElementById('sample-'+m.id);samples[m.id]=el?el.value:'';});
    return {supplier:$('#supplier').value.trim(),batch:$('#batch-number').value.trim(),date:$('#batch-date').value,
      weight:$('#weight').value,samples:samples};
  }
  function renderFields(prev){
    var html=config.metrics.map(function(m,i){
      var confError=engine.validateMetric(m), status=!m.configured?'Нет правил':(confError?'Ошибка правил':'Настроен');
      var hint=confError?status:('Норма: '+numberText(engine.parseNumber(m.neutralMin),4)+'–'+numberText(engine.parseNumber(m.neutralMax),4)+' '+m.unit);
      return '<div class="metric-row'+(confError?' warn':'')+'" id="metric-row-'+esc(m.id)+'">' +
        '<div><span class="metric-label">'+(i+1)+'. '+esc(m.name)+'</span><span class="metric-hint">'+esc(hint)+'</span></div>' +
        '<div class="unit-input"><input id="sample-'+esc(m.id)+'" aria-label="'+esc(m.name)+'" type="text" inputmode="decimal" placeholder="Введите значение" autocomplete="off" value="'+esc(prev&&prev[m.id]!=null?prev[m.id]:'')+'"><span>'+esc(m.unit)+'</span></div></div>';
    }).join('');
    $('#metric-inputs').innerHTML=html;
    $$('#metric-inputs input').forEach(function(el){el.addEventListener('input',updateResults);});
    updateResults();
  }
  function updateResults(){
    var f=formData();
    lastCalc=engine.calculate(config,f.samples,f.weight);
    $('#fields-progress').textContent=lastCalc.results.filter(function(x){return x.status==='ok';}).length+' из 5';
    $('#physical-weight').textContent=lastCalc.weight&&!lastCalc.weightError?numberText(lastCalc.weight,3)+' кг':'—';
    $('#discount').textContent=lastCalc.ready?numberText(lastCalc.discount,4)+' %':'—';
    $('#final-weight').innerHTML=(lastCalc.ready?numberText(lastCalc.finalWeight,3):'—')+'<small>кг</small>';
    var chip=$('#status-chip');
    chip.textContent=lastCalc.ready?'Готово':(lastCalc.results.some(function(r){return ['rejected','invalid','incomplete'].includes(r.status);})?'Проверьте данные':'Ожидает данных');
    chip.className='status-chip '+(lastCalc.ready?'ready':chip.textContent==='Проверьте данные'?'bad':'');
    $('#result-lines').innerHTML=lastCalc.results.map(function(r){
      var text=r.status==='ok'?(numberText(r.discount,4)+' %'):({
        missing:'Не введён',invalid:'Ошибка значения',rejected:'Вне нормы',unconfigured:'Нет правил',incomplete:'Нет интервала'
      }[r.status]||'—');
      return '<div class="result-line"><span>'+esc(r.name)+'</span><b class="'+(r.status==='ok'?'':'muted')+'">'+esc(text)+'</b></div>';
    }).join('');
    lastCalc.results.forEach(function(r){
      var el=document.getElementById('metric-row-'+r.id);
      if(el) el.className='metric-row'+(r.status==='unconfigured'?' warn':(['invalid','rejected','incomplete'].includes(r.status)?' error':''));
    });
    var message=$('#result-message');
    message.className='result-message '+(lastCalc.ready?'good':lastCalc.results.some(function(r){return ['rejected','invalid','incomplete'].includes(r.status);})?'bad':'info');
    message.textContent=lastCalc.ready?'Расчёт выполнен. Можно сохранить партию и распечатать документ.':lastCalc.error;
    $('#save-batch').disabled=!lastCalc.ready;
    $('#print-batch').disabled=!lastCalc.ready;
  }
  function showView(view){
    if (!['calculator','history','settings'].includes(view)) return;
    currentView=view;
    $$('.view').forEach(function(el){el.hidden=el.id!=='view-'+view;});
    $$('.nav-link').forEach(function(el){el.classList.toggle('active',el.dataset.view===view);});
    $('#page-title').textContent={calculator:'Расчёт партии',history:'Журнал расчётов',settings:'Настройки качества'}[view];
    $('#go-settings').hidden=view==='settings';
    if(view==='history') renderHistory();
    if(view==='settings'){rulesDraft=JSON.parse(JSON.stringify(config));renderSettings();}
    window.scrollTo(0,0);
  }
  function copyText(s){return typeof s==='string'?s.slice(0,100):'';}
  function createSnapshot(){
    var data=formData();
    return {id:String(Date.now())+'-'+Math.random().toString(36).slice(2,8),savedAt:new Date().toISOString(),
      supplier:data.supplier,batch:data.batch,date:data.date,weight:lastCalc.weight,
      samples:Object.fromEntries(config.metrics.map(function(m){return [m.id,engine.parseNumber(data.samples[m.id])];})),
      metrics:config.metrics.map(function(m){return {id:m.id,name:m.name,unit:m.unit};}),
      result:JSON.parse(JSON.stringify(lastCalc))};
  }
  function saveBatch(){
    updateResults();if(!lastCalc.ready) return;
    historyData.unshift(createSnapshot());
    historyData=historyData.slice(0,2000);
    if(writeStore(KEY_HISTORY,historyData)){notice('Партия сохранена в журнале.');$('#history-count').textContent=historyData.length;}
  }
  function fmtDate(v){if(!v)return '—';var d=new Date(v.length===10?v+'T12:00:00':v);return isNaN(d.getTime())?v.slice(0,30):new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);}
  function renderHistory(){
    $('#history-count').textContent=historyData.length;
    $('#empty-history').hidden=historyData.length!==0;
    $('.table-scroll').hidden=historyData.length===0;
    $('#history-rows').innerHTML=historyData.map(function(h){
      return '<tr><td>'+esc(fmtDate(h.date||h.savedAt))+'</td><td><b>'+esc(h.batch||'Без номера')+'</b><small>'+esc(h.supplier||'Поставщик не указан')+'</small></td>'+
      '<td>'+numberText(h.weight,3)+' кг</td><td>'+numberText(h.result.discount,4)+' %</td><td><b>'+numberText(h.result.finalWeight,3)+' кг</b></td>'+
      '<td><button class="link-btn" data-action="details" data-id="'+esc(h.id)+'">Подробнее</button> <button class="link-btn" data-action="print" data-id="'+esc(h.id)+'">Печать</button> <button class="link-btn danger" data-action="remove" data-id="'+esc(h.id)+'">Удалить</button></td></tr>';
    }).join('');
  }
  function displayDetails(h,button){
    var row=button.closest('tr'),next=row.nextElementSibling;
    if(next&&next.classList.contains('history-detail')){next.remove();return;}
    $$('.history-detail').forEach(function(el){el.remove();});
    var details=h.result.results.map(function(r){
      var parts=(r.parts||[]).map(function(p){return 'от '+numberText(p.from,3)+' до '+numberText(p.to,3)+' × '+numberText(p.rate,3)+'% = '+numberText(p.discount,4)+'%';}).join('; ');
      return '<p><b>'+esc(r.name)+':</b> '+numberText(r.value,3)+' '+esc(r.unit)+' · скидка '+numberText(r.discount,4)+'% '+(parts?'('+esc(parts)+')':'')+'</p>';
    }).join('');
    var tr=document.createElement('tr');tr.className='history-detail';tr.innerHTML='<td colspan="6"><div class="history-details">'+details+'</div></td>';
    row.after(tr);
  }
  function buildPrint(h){
    var result=h.result;
    $('#print-sheet').innerHTML='<h1>Акт расчёта зачётного веса</h1><p>Дата партии: '+esc(fmtDate(h.date))+'</p>'+
      '<p>Поставщик: '+esc(h.supplier||'—')+'</p><p>Номер партии: '+esc(h.batch||'—')+'</p>'+
      '<p>Физический вес: '+numberText(h.weight,3)+' кг</p>'+
      '<table><thead><tr><th>Показатель</th><th>Значение</th><th>Скидка</th><th>Расчёт по интервалам</th></tr></thead><tbody>'+
      result.results.map(function(r){return '<tr><td>'+esc(r.name)+'</td><td>'+numberText(r.value,4)+' '+esc(r.unit)+'</td><td>'+numberText(r.discount,4)+' %</td><td>'+
        (r.parts||[]).map(function(p){return esc(numberText(p.to-p.from,4)+' × '+numberText(p.rate,4)+'% = '+numberText(p.discount,4)+'%');}).join('; ')+'</td></tr>';}).join('')+
      '</tbody></table><div class="print-summary">Итого: '+numberText(result.discount,4)+' % скидка; зачётный вес '+numberText(result.finalWeight,3)+' кг</div>'+
      '<p>Формула: физический вес × (1 − сумма скидок / 100).</p><p>Подпись ответственного: __________________________</p>';
    window.print();
  }
  function saveCurrentPrint(){updateResults();if(lastCalc.ready) buildPrint(createSnapshot());}
  function safeCSV(s){var v=String(s==null?'':s);if(/^[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
  function download(content,name,type){
    var blob=new Blob([content],{type:type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},10000);
  }
  function exportCSV(){
    if(!historyData.length){notice('Журнал пуст. Экспортировать нечего.');return;}
    var header=['Дата','Партия','Поставщик','Физический вес, кг'];
    config.metrics.forEach(function(m,i){header.push('Показатель '+(i+1)+' значение','Показатель '+(i+1)+' название','Показатель '+(i+1)+' скидка, %');});
    header.push('Суммарная скидка, %','Зачётный вес, кг');
    var rows=[header];
    historyData.forEach(function(h){
      var r=[h.date,h.batch,h.supplier,h.weight];
      (h.result.results||[]).forEach(function(x){r.push(x.value,x.name,x.discount);});
      r.push(h.result.discount,h.result.finalWeight);rows.push(r);
    });
    download('\ufeff'+rows.map(function(r){return r.map(safeCSV).join(';');}).join('\r\n'),'kalkulyator-journal-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
  }
  function backup(){
    download(JSON.stringify({kind:'kalkulyator-backup',version:1,createdAt:new Date().toISOString(),
      config:config,history:historyData},null,2),'kalkulyator-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');
  }
  function importBackup(file){
    if(!file)return;
    if(file.size>3*1024*1024){notice('Файл превышает ограничение 3 МБ.');return;}
    file.text().then(function(t){
      var data=JSON.parse(t);
      if(!data||data.kind!=='kalkulyator-backup'||data.version!==1||!baseConfig(data.config)||
         !Array.isArray(data.history)||data.history.length>2000) throw Error('Неверный формат архива.');
      for(var m of data.config.metrics) if(m.configured&&engine.validateMetric(m)) throw Error('Ошибки правил качества.');
      if(!data.history.every(function(h){return h&&typeof h.id==='string'&&h.id.length<120&&h.result&&h.result.ready===true&&
          typeof h.result.discount==='number'&&Number.isFinite(h.result.finalWeight)&&
          Array.isArray(h.result.results)&&h.result.results.length===5&&typeof h.weight==='number'&&
          typeof h.supplier==='string'&&typeof h.batch==='string'})) throw Error('Архив содержит ошибочные партии.');
      if(!confirm('Заменить текущий журнал ('+historyData.length+' записей) и правила данными из архива?'))return;
      config=data.config;historyData=data.history;
      writeStore(KEY_CONFIG,config);writeStore(KEY_HISTORY,historyData);
      renderFields();renderHistory();notice('Данные восстановлены.');
    }).catch(function(e){notice('Не удалось восстановить: '+e.message);});
  }
  function inputMarkup(name,v,attr,placeholder){
    return '<label>'+name+'<input '+(attr||'')+' type="text" value="'+esc(valueText(v))+'" placeholder="'+esc(placeholder||'')+'"></label>';
  }
  function tierList(m,i,side){
    var below=side==='below',rows=m[side]||[];
    return '<div class="tiers"><div class="tiers-heading">'+(below?'Ниже нормы (движение вниз)':'Выше нормы (движение вверх)')+'</div>'+
      (rows.length?rows.map(function(t,j){
        return '<div class="tier-row">'+inputMarkup(below?'Нижняя граница':'Верхняя граница',t.to,'data-field="to" data-side="'+side+'" data-tier="'+j+'"','без ограничения')+
          inputMarkup('Ставка % за 1',t.rate,'data-field="rate" data-side="'+side+'" data-tier="'+j+'"','0')+
          '<button class="remove-tier" title="Удалить интервал" data-op="remove" data-index="'+i+'" data-side="'+side+'" data-tier="'+j+'">×</button></div>';
      }).join(''):'<p class="empty-rule">Интервалы не заданы.</p>')+
      '<button class="small-btn" data-op="add" data-index="'+i+'" data-side="'+side+'">＋ Добавить интервал</button></div>';
  }
  function renderSettings(){
    $('#settings-editor').innerHTML=rulesDraft.metrics.map(function(m,i){
      var error=engine.validateMetric(m);
      return '<section class="panel rule-card" data-index="'+i+'"><div class="rule-head"><div><h3>'+esc(m.name)+'</h3><span class="rule-code">Показатель '+(i+1)+'</span></div>'+
        '<label class="check-label"><input type="checkbox" data-prop="configured" '+(m.configured?'checked':'')+'> Активировать правила</label></div>'+
        '<div class="settings-body"><div class="rule-fields two">'+
        inputMarkup('Название',m.name,'data-prop="name"','Наименование')+
        inputMarkup('Ед. измерения',m.unit,'data-prop="unit"','%')+
        inputMarkup('Мин. приёмки',m.acceptMin,'data-prop="acceptMin"','нет')+
        inputMarkup('Норма от',m.neutralMin,'data-prop="neutralMin"','0')+
        inputMarkup('Норма до',m.neutralMax,'data-prop="neutralMax"','0')+'</div>'+
        '<div class="rule-fields" style="margin-top:12px;grid-template-columns:1fr 1fr">'+inputMarkup('Макс. приёмки',m.acceptMax,'data-prop="acceptMax"','нет')+
        '<div class="rule-note">«Нет» у границ приёмки означает, что значение не запрещено автоматически. Для ненормативных значений должны существовать интервалы скидки.</div></div>'+
        '<div class="rule-tiers">'+tierList(m,i,'below')+tierList(m,i,'above')+'</div>'+
        (m.configured&&error?'<div class="rule-error">⚠ '+esc(error)+'</div>':'')+'</div></section>';
    }).join('');
  }
  function collectDraft(){
    return {version:1,metrics:$$('.rule-card').map(function(card,i){
      var previous=rulesDraft.metrics[i],m={id:previous.id,name:'',unit:'',configured:false,
        neutralMin:null,neutralMax:null,acceptMin:null,acceptMax:null,below:[],above:[]};
      $$('[data-prop]',card).forEach(function(el){
        var prop=el.dataset.prop;
        if(prop==='configured') m[prop]=el.checked;
        else if(prop==='name'||prop==='unit') m[prop]=el.value.trim();
        else m[prop]=el.value.trim()===''?null:engine.parseNumber(el.value);
      });
      for(var side of ['below','above']){
        var tiers={};
        $$('[data-tier][data-field]',card).forEach(function(el){
          if(el.dataset.side!==side)return;
          var n=Number(el.dataset.tier);
          if(!tiers[n])tiers[n]={to:null,rate:null};
          tiers[n][el.dataset.field]=el.value.trim()===''?null:engine.parseNumber(el.value);
        });
        m[side]=Object.keys(tiers).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return tiers[k];});
      }
      return m;
    })};
  }
  function changeTier(btn){
    rulesDraft=collectDraft();
    var m=rulesDraft.metrics[Number(btn.dataset.index)],side=btn.dataset.side,arr=m[side];
    if(btn.dataset.op==='remove')arr.splice(Number(btn.dataset.tier),1);
    else{
      if(arr.length&&arr[arr.length-1].to===null){
        var prev=arr.length===1?(side==='below'?m.neutralMin:m.neutralMax):arr[arr.length-2].to;
        var anchor=engine.parseNumber(prev);arr[arr.length-1].to=(anchor==null?0:anchor)+(side==='below'?-1:1);
      }
      arr.push({to:null,rate:0});
    }
    renderSettings();
    var card=$$('.rule-card')[Number(btn.dataset.index)];if(card)card.scrollIntoView({block:'nearest'});
  }
  function saveSettings(){
    var updated=collectDraft();
    for(var i=0;i<updated.metrics.length;i++){
      var m=updated.metrics[i],err=engine.validateMetric(m);
      if(m.configured&&err){notice('Показатель '+(i+1)+': '+err);rulesDraft=updated;renderSettings();return;}
    }
    var f=formData();
    config=updated;
    if(writeStore(KEY_CONFIG,config)){
      rulesDraft=JSON.parse(JSON.stringify(config));renderSettings();renderFields(f.samples);
      notice('Правила сохранены. Новые расчёты используют обновлённые ставки.');
    }
  }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest('button');if(!b)return;
    if(b.dataset.view){showView(b.dataset.view);return;}
    if(b.id==='go-settings'||b.id==='edit-rules'){showView('settings');return;}
    if(b.dataset.op){changeTier(b);return;}
    if(b.dataset.action){
      var h=historyData.find(function(x){return x.id===b.dataset.id;});if(!h)return;
      if(b.dataset.action==='details')displayDetails(h,b);
      if(b.dataset.action==='print')buildPrint(h);
      if(b.dataset.action==='remove'&&confirm('Удалить партию «'+h.batch+'» из журнала?')){
        historyData=historyData.filter(function(x){return x.id!==h.id;});
        writeStore(KEY_HISTORY,historyData);renderHistory();notice('Запись удалена.');
      }
    }
  });
  $('#weight').addEventListener('input',updateResults);
  $('#save-batch').addEventListener('click',saveBatch);
  $('#print-batch').addEventListener('click',saveCurrentPrint);
  $('#reset-form').addEventListener('click',function(){
    if(!confirm('Очистить поля текущего расчёта? Сохранённые партии останутся в журнале.'))return;
    $('#supplier').value='';$('#batch-number').value='';$('#weight').value='';
    $$('#metric-inputs input').forEach(function(el){el.value='';});updateResults();
  });
  $('#save-settings').addEventListener('click',saveSettings);
  $('#restore-defaults').addEventListener('click',function(){
    if(!confirm('Заменить редактор правил исходными настройками влажности? Остальные четыре показателя снова будут не настроены.'))return;
    rulesDraft=engine.defaults();renderSettings();notice('Исходные правила загружены в редактор. Нажмите «Сохранить правила» для применения.');
  });
  $('#export-csv').addEventListener('click',exportCSV);
  $('#backup-json').addEventListener('click',backup);
  $('#import-json').addEventListener('click',function(){$('#import-file').click();});
  $('#import-file').addEventListener('change',function(ev){importBackup(ev.target.files[0]);ev.target.value='';});
  renderFields();$('#history-count').textContent=historyData.length;
})();
