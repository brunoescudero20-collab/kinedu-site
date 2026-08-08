function SP(k){
  ['landing','home','article','category','path','library','glossary','profile','search','calculator','art1','art2','art3','art4','art5'].forEach(function(p){
    var e=document.getElementById('p-'+p); if(e) e.style.display='none';
  });
  var pg=document.getElementById('p-'+k);
  if(pg) pg.style.display='block';
  window.scrollTo(0,0);
  try{history.pushState({p:k},'','#'+k);}catch(e){}
  var m={category:'Categorias',path:'Trilhas',library:'Pesquisa',glossary:'Glossário',article:'Artigos'};
  document.querySelectorAll('.nav-links a').forEach(function(a){a.classList.remove('active');if(m[k]&&a.textContent.trim()===m[k])a.classList.add('active');});
  if(k==='profile'){try{buildHeatmap();}catch(e){}}
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

function doSearch() {
  const q = document.getElementById('heroSearch').value.trim();
  if (!q) return;
  currentQuery = q;
  document.querySelector('.results-query').innerHTML = `Resultados para <strong>"${q}"</strong>`;
  document.getElementById('navSearch').value = q;
  // Simulate: if no match, show empty state
  if (q.length > 0 && !['hipertrofia','fisiologia','força','periodização','nutrição','mtor','treino','músculo','proteína','vo2','volume','amplitude'].some(k => q.toLowerCase().includes(k))) {
    document.querySelectorAll('.result-section, .section-divider, .popular-section').forEach(el => el.style.display = 'none');
    document.getElementById('noResults').classList.add('visible');
    document.querySelector('.results-count-badge').textContent = '0';
  } else {
    document.querySelectorAll('.result-section, .section-divider, .popular-section').forEach(el => el.style.display = '');
    document.getElementById('noResults').classList.remove('visible');
    document.querySelector('.results-count-badge').textContent = '23';
  }
}

function quickSearch(q) {
  document.getElementById('heroSearch').value = q;
  document.getElementById('navSearch').value = q;
  doSearch();
  document.getElementById('noResults').classList.remove('visible');
  document.querySelectorAll('.result-section, .section-divider, .popular-section').forEach(el => el.style.display = '');
  document.querySelector('.results-count-badge').textContent = '23';
  document.querySelector('.results-query').innerHTML = `Resultados para <strong>"${q}"</strong>`;
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