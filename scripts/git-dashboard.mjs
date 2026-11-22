// Generates a self-contained HTML dashboard of commits and added/removed lines per day.
// Usage: node scripts/git-dashboard.mjs [output.html]   (default: .git/commit-dashboard.html)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? '.git/commit-dashboard.html'
const log = execFileSync(
  'git',
  ['log', '--numstat', '--date=format-local:%Y-%m-%d', '--pretty=format:@@%ad'],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
)

const days = {}
let day = null
for (const line of log.split('\n')) {
  if (line.startsWith('@@')) {
    day = line.slice(2)
    days[day] ??= { c: 0, a: 0, d: 0 }
    days[day].c++
  } else if (line.trim() && day) {
    const [a, d] = line.split('\t')
    if (a !== '-') days[day].a += Number(a)
    if (d !== '-') days[day].d += Number(d)
  }
}

const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Commity w tygodniu</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
body{font-family:system-ui,sans-serif;margin:24px auto;max-width:1000px;padding:0 16px;color:#222}
header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button,input{font:inherit;padding:4px 10px}
.sum{color:#666;margin:8px 0 16px}
.card{border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px}
h2{margin:0 0 8px;font-size:16px}
</style></head><body>
<header>
  <button id="prev">◀</button>
  <input type="week" id="week">
  <button id="next">▶</button>
  <button id="today">Bieżący tydzień</button>
</header>
<div class="sum" id="sum"></div>
<div class="card"><h2>Liczba commitów</h2><canvas id="commits"></canvas></div>
<div class="card"><h2>Linie dodane i usunięte</h2><canvas id="lines"></canvas></div>
<script>
const DATA = ${JSON.stringify(days)};
const NAMES = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd'];
const pad = n => String(n).padStart(2,'0');
const iso = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function monday(d){ d=new Date(d.getFullYear(),d.getMonth(),d.getDate()); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
function weekValue(mon){ const t=new Date(mon); t.setDate(t.getDate()+3); const y=t.getFullYear();
  const w=1+Math.round((t-new Date(y,0,4))/864e5/7 - ((new Date(y,0,4).getDay()+6)%7-3)/7); return y+'-W'+pad(w); }
function fromWeekValue(v){ const [y,w]=v.split('-W').map(Number); const m=monday(new Date(y,0,4)); m.setDate(m.getDate()+(w-1)*7); return m; }
let mon = monday(new Date());
const opts = {responsive:true,scales:{y:{beginAtZero:true,ticks:{precision:0}}}};
const cC = new Chart(commits,{type:'bar',data:{labels:[],datasets:[{label:'Commity',data:[],backgroundColor:'#4f6bed'}]},options:{...opts,plugins:{legend:{display:false}}}});
const cL = new Chart(lines,{type:'bar',data:{labels:[],datasets:[{label:'Dodane',data:[],backgroundColor:'#2e9d5b'},{label:'Usunięte',data:[],backgroundColor:'#d64545'}]},options:opts});
function render(){
  const ds=[...Array(7)].map((_,i)=>{const d=new Date(mon);d.setDate(d.getDate()+i);return d;});
  const labels=ds.map((d,i)=>NAMES[i]+' '+pad(d.getDate())+'.'+pad(d.getMonth()+1));
  const v=ds.map(d=>DATA[iso(d)]||{c:0,a:0,d:0});
  cC.data.labels=cL.data.labels=labels;
  cC.data.datasets[0].data=v.map(x=>x.c);
  cL.data.datasets[0].data=v.map(x=>x.a);
  cL.data.datasets[1].data=v.map(x=>x.d);
  cC.update(); cL.update();
  week.value=weekValue(mon);
  const s=v.reduce((t,x)=>({c:t.c+x.c,a:t.a+x.a,d:t.d+x.d}),{c:0,a:0,d:0});
  sum.textContent=iso(ds[0])+' – '+iso(ds[6])+': '+s.c+' commitów, +'+s.a+' / −'+s.d+' linii';
}
prev.onclick=()=>{mon.setDate(mon.getDate()-7);render();};
next.onclick=()=>{mon.setDate(mon.getDate()+7);render();};
today.onclick=()=>{mon=monday(new Date());render();};
week.onchange=()=>{if(week.value){mon=fromWeekValue(week.value);render();}};
render();
</script></body></html>`

writeFileSync(out, html)
console.log(`Dashboard: ${out}`)
