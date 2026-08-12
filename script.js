function SP(k){
  ['landing','home','article','category','categories','category-soon','path','library','glossary','profile','auth','search','calculator','art1','art2','art3','art4','art5'].forEach(function(p){
    var e=document.getElementById('p-'+p); if(e) e.style.display='none';
  });
  var pg=document.getElementById('p-'+k);
  if(pg){
    pg.style.display='block';
    pg.classList.remove('kp-anim');
    void pg.offsetWidth;
    pg.classList.add('kp-anim');
  }
  window.scrollTo(0,0);
  try{history.pushState({p:k},'','#'+k);}catch(e){}
  var m={categories:'Categorias',path:'Trilhas',library:'Pesquisa',glossary:'Glossário',article:'Artigos'};
  document.querySelectorAll('.nav-links a').forEach(function(a){a.classList.remove('active');if(m[k]&&a.textContent.trim()===m[k])a.classList.add('active');});
  if(k==='profile'){try{buildHeatmap();}catch(e){}}
  // Log a real article view — fire-and-forget, never blocks the page switch above.
  if(/^art\d+$/.test(k) && window.KinEduAPI){
    KinEduAPI.getArticle(k).then(function(a){ return KinEduAPI.logArticleView(a.id); }).catch(function(){});
  }
}

// ── REAL DATA HYDRATION ──
// Replaces the hardcoded placeholder numbers in the static HTML with real
// counts from the backend once they're available. If the API is unreachable
// the static numbers already in index.html stay exactly as they were.
(function(){
  if(!window.KinEduAPI) return;

  KinEduAPI.getStats().then(function(stats){
    var el = document.getElementById('statTotalArticles');
    if(el) el.textContent = String(stats.total_articles);
  }).catch(function(){});

  KinEduAPI.getCategories().then(function(cats){
    var bySlug = {};
    cats.forEach(function(c){ bySlug[c.slug] = c.article_count; });
    document.querySelectorAll('[data-cat-count]').forEach(function(el){
      var slug = el.getAttribute('data-cat-count');
      if(Object.prototype.hasOwnProperty.call(bySlug, slug)) el.textContent = String(bySlug[slug]);
    });
  }).catch(function(){});
})();
function SPCategorySoon(name){
  var el=document.getElementById('categorySoonName');
  if(el) el.textContent=name;
  SP('category-soon');
}

function setAuthMode(mode){
  document.querySelectorAll('[data-auth-mode]').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.authMode===mode ? 'true':'false');
  });
  var isLogin = mode==='login';
  document.getElementById('authTitle').textContent = isLogin ? 'Entrar na sua conta' : 'Criar sua conta';
  document.getElementById('authSub').textContent = isLogin ? 'Informe seu login e senha para continuar.' : 'Escolha um login e uma senha — é só isso que pedimos.';
  document.getElementById('authSubmitBtn').textContent = isLogin ? 'Entrar' : 'Criar conta';
  document.getElementById('authPassword').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
}
function SPAuth(mode){
  setAuthMode(mode || 'login');
  SP('auth');
}
function submitAuth(e){
  e.preventDefault();
  var errEl = document.getElementById('authError');
  var showErr = function(msg){ if(errEl){ errEl.textContent = msg; errEl.className = 'calc-field-err visible'; } };
  if(errEl){ errEl.className = 'calc-field-err'; errEl.textContent=''; }

  if(!window.KinEduAPI){ SP('profile'); return false; }

  var login = document.getElementById('authLogin').value.trim();
  var password = document.getElementById('authPassword').value;
  var isLogin = document.querySelector('[data-auth-mode="login"]').getAttribute('aria-pressed') === 'true';
  var btn = document.getElementById('authSubmitBtn');
  var original = btn.textContent;
  btn.textContent = isLogin ? 'Entrando…' : 'Criando conta…';
  btn.disabled = true;

  var req = isLogin ? KinEduAPI.login(login, password) : KinEduAPI.signup(login, password);
  req.then(function(){
    SP('profile');
  }).catch(function(err){
    showErr((err && err.data && err.data.message) || 'Não foi possível concluir. Tente novamente.');
  }).finally(function(){
    btn.textContent = original;
    btn.disabled = false;
  });
  return false;
}
window.addEventListener('popstate',function(e){if(e.state&&e.state.p)SP(e.state.p);});
document.addEventListener('DOMContentLoaded',function(){SP((location.hash||'#landing').replace('#',''));});

// landing search bar
function landingSearch(e){
  if(e) e.preventDefault();
  var q=document.getElementById('ldSearch').value.trim();
  if(!q) return false;
  SP('search');
  quickSearch(q);
  return false;
}

// article
// Reading progress
window.addEventListener('scroll', () => {
  const d = document.documentElement;
  const pct = d.scrollTop / (d.scrollHeight - d.clientHeight);
  document.getElementById('readBar').style.width = (pct * 100) + '%';
});

// Active TOC
const sections = ['s-intro','s-simple','s-science','s-example','s-coach','s-research','s-mistakes','s-takeaways','s-refs'];
const tocItems = document.querySelectorAll('.toc-item');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      tocItems.forEach(item => item.classList.remove('active'));
      const active = document.querySelector(`.toc-item[data-target="${id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -60% 0px' });

sections.forEach(id => {
  const el = document.getElementById(id);
  if (el) observer.observe(el);
});

// Cite copy button
document.querySelector('.cite-copy')?.addEventListener('click', function() {
  const text = document.querySelector('.cite-text').innerText;
  navigator.clipboard.writeText(text).then(() => {
    this.textContent = '✓ Copiado!';
    setTimeout(() => this.textContent = 'Copiar citação (ABNT)', 2000);
  });
});


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// category
function setLevel(el){
  document.querySelectorAll('.level-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
document.querySelectorAll('.cat-hero-tag').forEach(t=>{
  t.addEventListener('click',function(){
    document.querySelectorAll('.cat-hero-tag').forEach(x=>x.classList.remove('active'));
    this.classList.add('active');
  });
});


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// path
function toggleModule(header){
  const body=header.nextElementSibling;
  const toggle=header.querySelector('.module-toggle');
  if(!body||!body.classList.contains('module-body'))return;
  const isOpen=toggle.classList.contains('open');
  if(isOpen){body.style.display='none';toggle.classList.remove('open');header.classList.add('collapsed')}
  else{body.style.display='block';toggle.classList.add('open');header.classList.remove('collapsed')}
}


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// library
function setEvType(el){document.querySelectorAll('.ev-type-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active')}


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// glossary
function toggleTerm(card){card.classList.toggle('expanded')}
function jumpTo(letter){
  const el=document.getElementById('anchor-'+letter);
  if(el){el.scrollIntoView({behavior:'smooth'})}
  document.querySelectorAll('.alpha-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
}
document.getElementById('glossSearch').addEventListener('input',function(){
  const q=this.value.toLowerCase();
  document.querySelectorAll('.term-card').forEach(card=>{
    const name=card.querySelector('.term-name').textContent.toLowerCase();
    const def=card.querySelector('.term-definition').textContent.toLowerCase();
    card.style.display=(name.includes(q)||def.includes(q)||q==='')? '':'none';
  });
});


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// profile
// Generate heatmap
const hm=document.getElementById('heatmap');
const levels=[0,1,2,3,4];
for(let i=0;i<182;i++){
  const cell=document.createElement('div');
  const r=Math.random();
  let lv=0;
  if(r>.85)lv=4;
  else if(r>.65)lv=3;
  else if(r>.45)lv=2;
  else if(r>.3)lv=1;
  cell.className=`hm-cell hm-${lv}`;
  cell.title=`${lv} artigo${lv!==1?'s':''} lido${lv!==1?'s':''}`;
  hm.appendChild(cell);
}
function setTab(el){document.querySelectorAll('.p-tab').forEach(t=>t.classList.remove('active'));el.classList.add('active')}


// Global search shortcut
(function(){
  // ── Search icon trigger ──
  document.querySelectorAll('.search-trigger, .icon-btn[title="Buscar"]').forEach(btn => {
    btn.addEventListener('click', () => { SP('search'); });
  });
  // ── Keyboard shortcut: Cmd/Ctrl+K ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      SP('search');
    }
  });
})();

// search
// ── DATA ──
const DATA = {
  articles: [
    { title: "Tensão Mecânica e Hipertrofia Muscular", tags: ["fisiologia","hipertrofia"], diff:"Avançado", time:"18 min", date:"14 jun 2025", href:"#article" },
    { title: "Volume de Treino e Hipertrofia: dose-resposta", tags: ["hipertrofia"], diff:"Intermediário", time:"14 min", date:"7 jun 2025", href:"#article" },
    { title: "Amplitude de Movimento e Hipertrofia", tags: ["biomecânica","hipertrofia"], diff:"Avançado", time:"16 min", date:"22 mai 2025", href:"#article" },
    { title: "Estresse Metabólico: o segundo mecanismo", tags: ["fisiologia","hipertrofia"], diff:"Avançado", time:"12 min", date:"15 mai 2025", href:"#article" },
    { title: "Síntese Proteica Muscular: o que ativa", tags: ["fisiologia","nutrição"], diff:"Intermediário", time:"11 min", date:"8 mai 2025", href:"#article" },
  ],
  research: [
    { type:"Meta-análise", title:"Schoenfeld et al. (2017) — Hypertrophy Adaptations", journal:"JSCR · 2017", grade:5 },
    { type:"RCT", title:"Pedrosa et al. (2022) — Range of Motion and Hypertrophy", journal:"JSCR · 2022", grade:4 },
  ],
  glossary: [
    { letter:"H", term:"Hipertrofia Muscular", cat:"Fisiologia" },
    { letter:"M", term:"mTOR / mTORC1", cat:"Sinalização Celular" },
    { letter:"T", term:"Tensão Mecânica", cat:"Fisiologia Celular" },
    { letter:"S", term:"Síntese Proteica", cat:"Bioquímica" },
  ],
  paths: [
    { icon:"⚡", title:"Fisiologia do Exercício — Módulo 3: Hipertrofia", modules:"3 aulas", pct:33, href:"#path" },
    { icon:"💪", title:"Treinamento para Hipertrofia: da teoria à periodização", modules:"6 módulos", pct:0, href:"#path" },
  ]
};

let currentType = 'all';
let currentQuery = 'hipertrofia muscular';

function setType(btn, type) {
  document.querySelectorAll('.sh-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentType = type;
  // In a real app, filter results here
}

function setTab(btn, type) {
  document.querySelectorAll('.result-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Show/hide sections
  const sections = { all: ['articles','research','glossary','paths'], articles:['articles'], research:['research'], glossary:['glossary'], paths:['paths'] };
  ['articles','research','glossary','paths'].forEach(s => {
    const el = document.getElementById('sec-' + s);
    const dividers = el?.nextElementSibling;
    if (el) el.style.display = (type === 'all' || type === s) ? '' : 'none';
    if (dividers && dividers.classList.contains('section-divider')) {
      dividers.style.display = (type === 'all') ? '' : 'none';
    }
  });
}

// Builds a .res-card for a real article returned by GET /api/search — same
// markup/classes the static demo cards used, just filled with real fields
// instead of invented ones (no fabricated difficulty level or read time
// when the article doesn't have one).
function buildArticleResultCard(a) {
  const title = a.title_pt || a.title;
  const dateStr = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
  const metaBits = [`<span class="res-type-badge rtb-article">Artigo</span>`];
  if (a.category_name) metaBits.push(`<span class="res-cat">${a.category_name}</span>`);
  if (a.category_name && dateStr) metaBits.push(`<span class="res-dot"></span>`);
  if (dateStr) metaBits.push(`<span class="res-date">${dateStr}</span>`);
  const footerBits = [];
  if (a.category_name) footerBits.push(`<span class="res-tag">${a.category_name}</span>`);
  if (a.reading_time_minutes) footerBits.push(`<span class="res-read-time">${a.reading_time_minutes} min</span>`);
  return `<a class="res-card" href="#${a.slug}" onclick="SP('${a.slug}');return false;">
    <div class="res-card-top">
      <span class="res-card-icon">📄</span>
      <div style="flex:1;min-width:0">
        <div class="res-card-meta">${metaBits.join('')}</div>
        <div class="res-title">${title}</div>
        <div class="res-excerpt">${a.excerpt || ''}</div>
        <div class="res-footer">${footerBits.join('')}</div>
      </div>
    </div>
  </a>`;
}

function renderRealSearchResults(q, results) {
  const list = document.querySelector('#sec-articles .result-list');
  const countEl = document.querySelector('#sec-articles .rs-count');
  const badge = document.querySelector('.results-count-badge');
  if (list) list.innerHTML = results.length
    ? results.map(buildArticleResultCard).join('')
    : `<p style="padding:8px 0;color:var(--text-muted,#888)">Nenhum artigo encontrado para "${q}".</p>`;
  if (countEl) countEl.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`;
  if (badge) badge.textContent = String(results.length);

  if (results.length === 0) {
    document.querySelectorAll('.result-section, .section-divider, .popular-section').forEach(el => el.style.display = 'none');
    document.getElementById('noResults').classList.add('visible');
  } else {
    document.querySelectorAll('.result-section, .section-divider, .popular-section').forEach(el => el.style.display = '');
    document.getElementById('noResults').classList.remove('visible');
  }
}

function doSearch() {
  const q = document.getElementById('heroSearch').value.trim();
  if (!q) return;
  currentQuery = q;
  document.querySelector('.results-query').innerHTML = `Resultados para <strong>"${q}"</strong>`;
  document.getElementById('navSearch').value = q;

  if (!window.KinEduAPI) return;
  KinEduAPI.logSearch(q);
  KinEduAPI.search(q).then(data => {
    renderRealSearchResults(q, data.articles || []);
  }).catch(() => {
    renderRealSearchResults(q, []);
  });
}

function quickSearch(q) {
  document.getElementById('heroSearch').value = q;
  document.getElementById('navSearch').value = q;
  document.querySelector('.results-query').innerHTML = `Resultados para <strong>"${q}"</strong>`;
  doSearch();
}

// Nav search sync
document.getElementById('navSearch').addEventListener('input', function() {
  const v = this.value;
  document.getElementById('heroSearch').value = v;
  document.getElementById('navClear').classList.toggle('visible', v.length > 0);
});
document.getElementById('navSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
document.getElementById('heroSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
document.getElementById('heroSearch').addEventListener('input', function() {
  document.getElementById('navSearch').value = this.value;
  document.getElementById('navClear').classList.toggle('visible', this.value.length > 0);
});
document.getElementById('navClear').addEventListener('click', function() {
  document.getElementById('heroSearch').value = '';
  document.getElementById('navSearch').value = '';
  this.classList.remove('visible');
});

// Remove active filter tags
document.querySelectorAll('.aft-remove').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    this.closest('.active-filter-tag').remove();
  });
});

// Recent item remove
document.querySelectorAll('.recent-remove').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    this.closest('.recent-item').style.opacity = '0';
    setTimeout(() => this.closest('.recent-item').remove(), 200);
  });
});

// ── CALCULADORA 5/3/1 ──
(function(){

  var CALC_STORAGE_KEY = 'kinedu_calc531_v1';
  var CALC_LIFT_KEYS = ['squat','bench','deadlift','press'];
  var CALC_PLATE_SET = { kg: [25,20,15,10,5,2.5,1.25], lb: [45,35,25,10,5,2.5] };
  var CALC_MIN_REPS = {1:5, 2:3, 3:1};

  var CALC_WEEKS = [
    { key:1, label:'Semana 1', amrapWeek:true, sets:[
        {pct:.65, reps:'5'}, {pct:.75, reps:'5'}, {pct:.85, reps:'5+', amrap:true}
      ]},
    { key:2, label:'Semana 2', amrapWeek:true, sets:[
        {pct:.70, reps:'3'}, {pct:.80, reps:'3'}, {pct:.90, reps:'3+', amrap:true}
      ]},
    { key:3, label:'Semana 3', amrapWeek:true, sets:[
        {pct:.75, reps:'5'}, {pct:.85, reps:'3'}, {pct:.95, reps:'1+', amrap:true}
      ]},
    { key:4, label:'Semana 4 (Deload)', amrapWeek:false, sets:[
        {pct:.40, reps:'5'}, {pct:.50, reps:'5'}, {pct:.60, reps:'5'}
      ]}
  ];

  var calcCfg = { unit:'kg', tmBase:0.90, inc:2.5, barWeight:20, showPlates:false };
  var calcLiftState = {};
  CALC_LIFT_KEYS.forEach(function(k){ calcLiftState[k] = { mode:'set', oneRM:'', weight:'', reps:'' }; });

  var calcLastResults = {};
  var calcLastExampleFlags = {};

  // ── math ──
  function calcEpley(weight, reps){
    reps = Math.round(reps);
    if (reps <= 1) return weight;
    return weight * (1 + reps / 30);
  }

  // arredonda x para o múltiplo mais próximo de inc; empate exato arredonda para baixo
  function calcRound(x, inc){
    if (!inc) inc = 1;
    var n = x / inc;
    var floor = Math.floor(n + 1e-9);
    var frac = n - floor;
    var rounded = (Math.abs(frac - 0.5) < 1e-7) ? floor : Math.round(n);
    return Math.round(rounded * inc * 1000) / 1000;
  }

  function calcLoad(tm, pct, inc){ return calcRound(tm * pct, inc); }

  function calcFmt(x){
    var r = Math.round(x * 100) / 100;
    if (Object.is(r, -0)) r = 0;
    return String(r).replace('.', ',');
  }

  function calcPlates(load, barWeight, unit){
    var perSide = (load - barWeight) / 2;
    if (perSide < -0.001) return { belowBar:true, plates:[] };
    var plateSet = CALC_PLATE_SET[unit] || CALC_PLATE_SET.kg;
    var remaining = Math.round(perSide * 100) / 100;
    var used = [];
    for (var i = 0; i < plateSet.length; i++){
      var p = plateSet[i];
      while (remaining + 0.001 >= p){
        used.push(p);
        remaining = Math.round((remaining - p) * 100) / 100;
      }
    }
    return { belowBar:false, plates:used, remainder:remaining };
  }

  function calcPlatesText(pl, unit){
    if (pl.belowBar) return 'abaixo do peso da barra';
    if (!pl.plates.length) return 'só a barra, sem anilhas';
    return pl.plates.map(calcFmt).join(' + ') + ' ' + unit + '/lado';
  }

  function calcLiftResult(oneRM, cfg, cycleInc){
    var tm = calcRound(oneRM * cfg.tmBase, cfg.inc);
    var weeks = CALC_WEEKS.map(function(w){
      return {
        key: w.key, label: w.label, amrapWeek: w.amrapWeek,
        sets: w.sets.map(function(s){
          var load = calcLoad(tm, s.pct, cfg.inc);
          var realPct = oneRM > 0 ? (load / oneRM * 100) : 0;
          return { pct:s.pct, reps:s.reps, amrap: !!s.amrap, load:load, realPct:realPct };
        })
      };
    });
    return { oneRM:oneRM, tm:tm, cycleInc:cycleInc, weeks:weeks };
  }

  // ── debounce ──
  function calcDebounce(fn, delay){
    var t;
    return function(){
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx, args); }, delay);
    };
  }

  // ── storage ──
  function calcLoadStorage(){
    try {
      var raw = localStorage.getItem(CALC_STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.cfg) { for (var k in data.cfg) { calcCfg[k] = data.cfg[k]; } }
      if (data.lifts) { CALC_LIFT_KEYS.forEach(function(lk){ if (data.lifts[lk]) { for (var f in data.lifts[lk]) { calcLiftState[lk][f] = data.lifts[lk][f]; } } }); }
    } catch(e){}
  }
  function calcSaveStorage(){
    try { localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify({ cfg:calcCfg, lifts:calcLiftState })); } catch(e){}
  }

  // ── validation ──
  function calcSetErr(fieldId, mode, text){
    var el = document.querySelector('[data-err-for="' + fieldId + '"]');
    if (!el) return;
    if (mode === 'err') { el.textContent = text; el.className = 'calc-field-err visible'; }
    else if (mode === 'warn') { el.textContent = text; el.className = 'calc-field-warn visible'; }
    else { el.className = 'calc-field-err'; }
  }

  function calcCheckWeight(fieldId, val){
    if (val === '' || val === null || typeof val === 'undefined') { calcSetErr(fieldId, 'none'); return { valid:false, empty:true }; }
    var n = Number(val);
    if (isNaN(n) || n <= 0) { calcSetErr(fieldId, 'err', 'Informe um peso maior que zero.'); return { valid:false }; }
    calcSetErr(fieldId, 'none');
    return { valid:true, value:n };
  }

  function calcCheckReps(fieldId, val){
    if (val === '' || val === null || typeof val === 'undefined') { calcSetErr(fieldId, 'none'); return { valid:false, empty:true }; }
    var n = Number(val);
    if (isNaN(n) || n < 1) { calcSetErr(fieldId, 'err', 'Informe pelo menos 1 repetição.'); return { valid:false }; }
    if (n > 12) { calcSetErr(fieldId, 'warn', 'Acima de 12 repetições, a estimativa de 1RM perde confiabilidade.'); return { valid:true, reps:n }; }
    calcSetErr(fieldId, 'none');
    return { valid:true, reps:n };
  }

  // ── render ──
  function calcRenderResultHTML(resultsEl, result, cfg, liftLabel){
    var unit = cfg.unit;
    var html = '<div class="calc-table-wrap"><table class="calc-table"><caption class="sr-only">Cargas do ciclo de ' + liftLabel + '</caption>' +
      '<thead><tr><th scope="col">Semana</th><th scope="col">Série 1</th><th scope="col">Série 2</th><th scope="col">Série 3</th></tr></thead><tbody>';

    result.weeks.forEach(function(w){
      html += '<tr><th scope="row" style="font-weight:600;color:var(--text);white-space:nowrap">' + w.label + '</th>';
      w.sets.forEach(function(s, si){
        html += '<td class="' + (s.amrap ? 'calc-set-amrap' : '') + '" data-label="Série ' + (si + 1) + '">' + calcFmt(s.load) + ' ' + unit + ' × ' + s.reps + ' rep';
        if (cfg.showPlates){
          var pl = calcPlates(s.load, cfg.barWeight, unit);
          html += '<span class="calc-plates-note">' + calcPlatesText(pl, unit) + '</span>';
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="calc-tm-line">Training Max: <strong>' + calcFmt(result.tm) + ' ' + unit + '</strong> · 1RM usado: <strong>' + calcFmt(result.oneRM) + ' ' + unit + '</strong></div>';

    var amrapWeeks = result.weeks.filter(function(w){ return w.amrapWeek; });
    var pctParts = amrapWeeks.map(function(w, i){
      var amrapSet = w.sets[w.sets.length - 1];
      var pctStr = amrapSet.realPct.toFixed(1).replace('.', ',').replace(/,0$/, '');
      return 'Semana ' + (i + 1) + ': ' + pctStr + '%';
    });
    html += '<div class="calc-tm-line">% real do 1RM na série AMRAP — ' + pctParts.join(' · ') + '</div>';

    var bbb50 = calcLoad(result.tm, 0.50, cfg.inc);
    var bbb60 = calcLoad(result.tm, 0.60, cfg.inc);
    html += '<div class="calc-bbb"><div class="calc-bbb-title">Boring But Big — 5×10</div>' +
      '<div class="calc-bbb-row"><span>50%: <strong>' + calcFmt(bbb50) + ' ' + unit + ' × 10 rep</strong></span><span>60%: <strong>' + calcFmt(bbb60) + ' ' + unit + ' × 10 rep</strong></span></div>' +
      '<p class="calc-bbb-note">5 séries de 10 com carga leve, entre 50% e 60% do Training Max. Não é a série pesada repetida cinco vezes.</p></div>';

    resultsEl.innerHTML = html;
  }

  function calcRenderLift(liftKey){
    var liftEl = document.querySelector('.calc-lift[data-lift="' + liftKey + '"]');
    if (!liftEl) return;
    var state = calcLiftState[liftKey];
    var resultsEl = liftEl.querySelector('[data-results]');
    var tagEl = liftEl.querySelector('[data-example-tag]');
    var cincKg = parseFloat(liftEl.dataset.cincKg);
    var cincLb = parseFloat(liftEl.dataset.cincLb);
    var cycleInc = calcCfg.unit === 'kg' ? cincKg : cincLb;

    var oneRM = null;

    if (state.mode === '1rm'){
      var r = calcCheckWeight('calc-' + liftKey + '-1rm', state.oneRM);
      calcSetErr('calc-' + liftKey + '-weight', 'none');
      calcSetErr('calc-' + liftKey + '-reps', 'none');
      if (r.valid) oneRM = r.value;
    } else {
      var rw = calcCheckWeight('calc-' + liftKey + '-weight', state.weight);
      var rr = calcCheckReps('calc-' + liftKey + '-reps', state.reps);
      calcSetErr('calc-' + liftKey + '-1rm', 'none');
      if (rw.valid && rr.valid && rr.reps) oneRM = calcEpley(rw.value, rr.reps);
    }

    var isExample = false;
    if (oneRM === null){
      if (liftKey === 'squat'){
        oneRM = 140;
        isExample = true;
      } else {
        resultsEl.innerHTML = '<p class="calc-empty-msg">Preencha seu 1RM ou seu melhor set acima para ver sua planilha.</p>';
        if (tagEl) tagEl.hidden = true;
        calcLastResults[liftKey] = null;
        calcLastExampleFlags[liftKey] = false;
        return;
      }
    }

    if (tagEl) tagEl.hidden = !isExample;

    var result = calcLiftResult(oneRM, calcCfg, cycleInc);
    calcRenderResultHTML(resultsEl, result, calcCfg, liftEl.querySelector('.calc-lift-name').textContent);
    calcLastResults[liftKey] = result;
    calcLastExampleFlags[liftKey] = isExample;
  }

  function calcCrossCheck(){
    var old = document.getElementById('calcCrossAlert');
    if (old) old.remove();
    var squat = calcLastResults.squat, press = calcLastResults.press;
    if (squat && press && !calcLastExampleFlags.squat && !calcLastExampleFlags.press){
      if (press.oneRM >= squat.oneRM){
        var pressEl = document.querySelector('.calc-lift[data-lift="press"] [data-results]');
        var div = document.createElement('div');
        div.id = 'calcCrossAlert';
        div.className = 'calc-alert';
        div.textContent = 'Isso é incomum: seu desenvolvimento militar aparenta ser igual ou maior que seu agachamento. Confira os valores informados.';
        pressEl.appendChild(div);
      }
    }
  }

  function calcRenderProjection(){
    var table = document.getElementById('calcProjTable');
    var note = document.getElementById('calcProjNote');
    var rows = [];

    CALC_LIFT_KEYS.forEach(function(k){
      var r = calcLastResults[k];
      if (!r) return;
      var liftEl = document.querySelector('.calc-lift[data-lift="' + k + '"]');
      var label = liftEl.querySelector('.calc-lift-name').textContent + (calcLastExampleFlags[k] ? ' (exemplo)' : '');
      var cycles = [];
      var tm = r.tm;
      for (var c = 1; c <= 4; c++){
        tm = (c === 1) ? r.tm : calcRound(tm + r.cycleInc, calcCfg.inc);
        var heaviest = calcLoad(tm, 0.95, calcCfg.inc);
        cycles.push({ cycle:c, tm:tm, heaviest:heaviest });
      }
      rows.push({ label:label, cycles:cycles });
    });

    if (!rows.length){
      table.innerHTML = '';
      note.textContent = 'Preencha ao menos um levantamento acima para ver a projeção.';
      return;
    }

    var html = '<caption class="sr-only">Projeção do Training Max e da carga mais pesada por ciclo</caption>' +
      '<thead><tr><th scope="col">Levantamento</th><th scope="col">Ciclo 1</th><th scope="col">Ciclo 2</th><th scope="col">Ciclo 3</th><th scope="col">Ciclo 4</th></tr></thead><tbody>';
    rows.forEach(function(row){
      html += '<tr><th scope="row" style="font-weight:600;color:var(--text)">' + row.label + '</th>';
      row.cycles.forEach(function(c){
        html += '<td data-label="Ciclo ' + c.cycle + '">TM ' + calcFmt(c.tm) + ' ' + calcCfg.unit + '<span class="calc-plates-note">topo ' + calcFmt(c.heaviest) + ' ' + calcCfg.unit + '</span></td>';
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
    note.textContent = 'O Training Max cresce a cada ciclo até se aproximar do seu 1RM inicial — é assim que o programa garante progressão sustentável em vez de estagnação.';
  }

  function calcBuildExportText(){
    var lines = ['CALCULADORA 5/3/1 — KinEdu', ''];
    CALC_LIFT_KEYS.forEach(function(k){
      var res = calcLastResults[k];
      if (!res) return;
      var liftEl = document.querySelector('.calc-lift[data-lift="' + k + '"]');
      var label = liftEl.querySelector('.calc-lift-name').textContent + (calcLastExampleFlags[k] ? ' (exemplo)' : '');
      lines.push(label + ' — TM: ' + calcFmt(res.tm) + ' ' + calcCfg.unit + ' (1RM: ' + calcFmt(res.oneRM) + ' ' + calcCfg.unit + ')');
      res.weeks.forEach(function(w){
        var parts = w.sets.map(function(s){ return calcFmt(s.load) + calcCfg.unit + ' x' + s.reps + ' rep'; });
        lines.push('  ' + w.label + ': ' + parts.join(', '));
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  function calcRenderReverse(){
    var week = parseInt(document.getElementById('calcRevWeek').value, 10);
    var weightVal = document.getElementById('calcRevWeight').value;
    var repsVal = document.getElementById('calcRevReps').value;
    var resultEl = document.getElementById('calcRevResult');

    if (weightVal === '' || repsVal === ''){
      resultEl.innerHTML = 'Preencha os campos acima para ver a leitura do seu AMRAP.';
      return;
    }
    var weight = Number(weightVal), reps = Number(repsVal);
    if (isNaN(weight) || weight <= 0 || isNaN(reps) || reps < 1){
      resultEl.innerHTML = 'Informe um peso maior que zero e pelo menos 1 repetição.';
      return;
    }

    var e1rm = calcEpley(weight, reps);
    var minReps = CALC_MIN_REPS[week];
    var msg;
    if (reps < minReps){
      msg = 'Você fez ' + reps + ' repetições, abaixo do mínimo de ' + minReps + ' para a semana ' + week + '. Considere um reset do Training Max (multiplique por 0,90).';
    } else if (reps >= minReps + 7){
      msg = 'Você fez bem mais que o mínimo esperado (' + minReps + '). Seu Training Max provavelmente está conservador — considere aumentá-lo no próximo ciclo.';
    } else {
      msg = 'Resultado dentro do esperado para a calibração atual do seu Training Max.';
    }
    resultEl.innerHTML = '1RM estimado (Epley): <strong>' + calcFmt(e1rm) + ' ' + calcCfg.unit + '</strong><br>' + msg;
  }

  function calcRecalcAll(){
    CALC_LIFT_KEYS.forEach(calcRenderLift);
    calcCrossCheck();
    calcRenderProjection();
    calcSaveStorage();
  }

  // ── config UI ──
  function calcPopulateIncrementOptions(){
    var sel = document.getElementById('calcIncrement');
    var opts = calcCfg.unit === 'kg' ? [1, 2.5, 5] : [2.5, 5];
    if (opts.indexOf(calcCfg.inc) === -1) calcCfg.inc = 2.5;
    sel.innerHTML = opts.map(function(o){
      return '<option value="' + o + '"' + (o === calcCfg.inc ? ' selected' : '') + '>' + calcFmt(o) + ' ' + calcCfg.unit + '</option>';
    }).join('');
  }

  function calcSetUnit(u){
    if (calcCfg.unit === u) return;
    calcCfg.unit = u;
    calcCfg.barWeight = (u === 'kg') ? 20 : 45;
    document.getElementById('calcBarWeight').value = calcCfg.barWeight;
    calcPopulateIncrementOptions();
    document.querySelectorAll('[data-unit-btn]').forEach(function(b){
      b.setAttribute('aria-pressed', b.dataset.unitBtn === u ? 'true' : 'false');
    });
    calcRecalcAll();
    calcRenderReverse();
  }

  function calcSetTmBase(v){
    calcCfg.tmBase = v;
    document.querySelectorAll('[data-tmbase-btn]').forEach(function(b){
      b.setAttribute('aria-pressed', parseFloat(b.dataset.tmbaseBtn) === v ? 'true' : 'false');
    });
    calcRecalcAll();
  }

  function calcSetMode(liftKey, mode){
    calcLiftState[liftKey].mode = mode;
    var liftEl = document.querySelector('.calc-lift[data-lift="' + liftKey + '"]');
    liftEl.querySelectorAll('[data-mode-btn]').forEach(function(b){
      b.setAttribute('aria-pressed', b.dataset.modeBtn === mode ? 'true' : 'false');
    });
    liftEl.querySelectorAll('[data-mode-panel]').forEach(function(p){
      p.hidden = p.dataset.modePanel !== mode;
    });
    calcRecalcAll();
  }

  function calcSyncUI(){
    document.querySelectorAll('[data-unit-btn]').forEach(function(b){
      b.setAttribute('aria-pressed', b.dataset.unitBtn === calcCfg.unit ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tmbase-btn]').forEach(function(b){
      b.setAttribute('aria-pressed', parseFloat(b.dataset.tmbaseBtn) === calcCfg.tmBase ? 'true' : 'false');
    });
    calcPopulateIncrementOptions();
    document.getElementById('calcBarWeight').value = calcCfg.barWeight;
    document.getElementById('calcShowPlates').checked = calcCfg.showPlates;

    CALC_LIFT_KEYS.forEach(function(liftKey){
      var liftEl = document.querySelector('.calc-lift[data-lift="' + liftKey + '"]');
      var state = calcLiftState[liftKey];
      liftEl.querySelectorAll('[data-mode-btn]').forEach(function(b){
        b.setAttribute('aria-pressed', b.dataset.modeBtn === state.mode ? 'true' : 'false');
      });
      liftEl.querySelectorAll('[data-mode-panel]').forEach(function(p){
        p.hidden = p.dataset.modePanel !== state.mode;
      });
      document.getElementById('calc-' + liftKey + '-1rm').value = state.oneRM;
      document.getElementById('calc-' + liftKey + '-weight').value = state.weight;
      document.getElementById('calc-' + liftKey + '-reps').value = state.reps;
    });
  }

  function calcInit(){
    var root = document.getElementById('p-calculator');
    if (!root) return;

    calcLoadStorage();
    calcSyncUI();

    document.querySelectorAll('[data-unit-btn]').forEach(function(b){
      b.addEventListener('click', function(){ calcSetUnit(b.dataset.unitBtn); });
    });
    document.querySelectorAll('[data-tmbase-btn]').forEach(function(b){
      b.addEventListener('click', function(){ calcSetTmBase(parseFloat(b.dataset.tmbaseBtn)); });
    });

    document.getElementById('calcIncrement').addEventListener('change', function(){
      calcCfg.inc = parseFloat(this.value);
      calcRecalcAll();
    });

    document.getElementById('calcBarWeight').addEventListener('input', calcDebounce(function(){
      var v = parseFloat(this.value);
      calcCfg.barWeight = isNaN(v) ? 0 : v;
      calcRecalcAll();
    }, 300));

    document.getElementById('calcShowPlates').addEventListener('change', function(){
      calcCfg.showPlates = this.checked;
      calcRecalcAll();
    });

    document.getElementById('calcClearData').addEventListener('click', function(){
      try { localStorage.removeItem(CALC_STORAGE_KEY); } catch(e){}
      calcCfg = { unit:'kg', tmBase:0.90, inc:2.5, barWeight:20, showPlates:false };
      CALC_LIFT_KEYS.forEach(function(k){ calcLiftState[k] = { mode:'set', oneRM:'', weight:'', reps:'' }; });
      calcSyncUI();
      calcRecalcAll();
      calcRenderReverse();
    });

    CALC_LIFT_KEYS.forEach(function(liftKey){
      var liftEl = document.querySelector('.calc-lift[data-lift="' + liftKey + '"]');
      var state = calcLiftState[liftKey];

      liftEl.querySelectorAll('[data-mode-btn]').forEach(function(b){
        b.addEventListener('click', function(){ calcSetMode(liftKey, b.dataset.modeBtn); });
      });

      document.getElementById('calc-' + liftKey + '-1rm').addEventListener('input', calcDebounce(function(){
        state.oneRM = this.value;
        calcRecalcAll();
      }, 300));
      document.getElementById('calc-' + liftKey + '-weight').addEventListener('input', calcDebounce(function(){
        state.weight = this.value;
        calcRecalcAll();
      }, 300));
      document.getElementById('calc-' + liftKey + '-reps').addEventListener('input', calcDebounce(function(){
        state.reps = this.value;
        calcRecalcAll();
      }, 300));
    });

    ['calcRevWeight','calcRevReps'].forEach(function(id){
      document.getElementById(id).addEventListener('input', calcDebounce(calcRenderReverse, 300));
    });
    document.getElementById('calcRevWeek').addEventListener('change', calcRenderReverse);

    document.getElementById('calcCopyBtn').addEventListener('click', function(){
      var text = calcBuildExportText();
      var btn = this;
      var original = btn.textContent;
      navigator.clipboard.writeText(text).then(function(){
        btn.textContent = '✓ Copiado!';
        setTimeout(function(){ btn.textContent = original; }, 2000);
      });
    });
    document.getElementById('calcPrintBtn').addEventListener('click', function(){ window.print(); });

    calcRecalcAll();
    calcRenderReverse();
  }

  calcInit();

})();