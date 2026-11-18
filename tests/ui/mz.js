// Mock game data: the whole self scout from Reports loads on open (file by file or the old single block),
// pools with what was charted live, charted-live copies are not counted twice, and picking a game loads that week's call sheet
// Run: node tests/ui/mz.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(require('os').tmpdir(),'booth-shots')+'/');
fs.mkdirSync(OUT,{recursive:true});
const SEASON='season-aaaaaaaaaaaaaaaa', D='2026-11-20';
const H=["PLAY #","ODK","QTR","SERIES","DN","DIST","YARD LN","HASH","PLAY TYPE","RESULT","GN/LS","O FORMATION","MOTION","RUN FAMILY","PASS FAMILY","FRONT","COVERAGE","BLITZ","MFC/MFO/0","TARGET","BALL CARRIER","TEAM"];
const CALLS=[["Run","Gold","SPLIT ZONE",""],["Run","Gold","CRAB",""],["Pass","Gold","","STICK"],["Run","Slot","SMACK",""],["Pass","Slot","","MESH"]];
const rowsN=(n,seed)=>Array.from({length:n},(_,i)=>{ const c=CALLS[(i+seed)%CALLS.length], g=(i*7+seed)%13-2; return [i+1,"O",1+i%4,1+(i>>3),1+i%3,10-(i%3)*3,-30+(i%50),"M",c[0],c[0]==="Run"?"Rush":(g>0?"Complete":"Incomplete"),c[0]==="Pass"&&g<=0?0:g,c[1],"",c[2],c[3],"","","","","","","Opp "+seed] });
const file=(name,n,seed)=>({name,data:JSON.stringify({header:H,rows:rowsN(n,seed)})});
const saved=(name,n,seed)=>({name,data:JSON.stringify({h:H,r:rowsN(n,seed)})}); // how Reports saves a folder's files
// self scout sent file by file: 3 Hudl files (300 + 200 + 90 = 590 plays) and a charted-live copy that must be skipped
const SELF={opp:"",at:1,plays:620,n:4,f:{0:file("Wk1 vs Anna",300,1),1:file("Wk2 vs Celina",200,2),2:file("Wk3 vs Van Alstyne",90,3),3:file("Charted live · vs Anna · 2026-09-01",30,4)}};
const SNAPS={}; for(let i=0;i<147;i++) SNAPS['s'+i]=JSON.stringify({n:i+1,dn:1+i%3,dist:10,yl:30,pt:i%2?'Run':'Pass',res:i%2?'Rush':'Complete',gain:4,call:i%2?'GOLD SPLIT ZONE':'GOLD STICK'});
const WEEKSHEET={sheet:[{name:"GOLD",kind:"form",form:"GOLD",plays:[{t:"ACES"},{t:"MIKE"},{t:"STICK"}]},{name:"3RD SHORT",kind:"sit",key:"3S",plays:[{t:"CRAB"},{t:"SNEAK"}]}],grid:null,at:2};
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:D,opp:'DeSoto',ha:'H'}],
  games:{[SEASON]:{list:{'mel-anna':{opp:'Anna',date:'2026-09-01',plays:147,real:1}}},'mel-anna':{snaps:SNAPS}},
  weeks:{[D]:{callsheet:WEEKSHEET}}, selfscout:{report:{files:[saved('Wk1 vs Anna',300,1),saved('Wk2 vs Celina',200,2),saved('Wk3 vs Van Alstyne',90,3)]}}, mock:{self:SELF, weeks:{[D]:{opp:'DeSoto',plays:40,n:1,f:{0:{name:'DeSoto film',data:JSON.stringify({header:H,rows:rowsN(40,9).map(r=>{r[1]='D';return r})})}}}}}}}},9128);
const srv=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8769);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=10000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1366,height:1024}}); await ctx.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:''}));
  const P=await ctx.newPage(); const errs=[]; P.on('pageerror',e=>errs.push(e.message));
  await P.addInitScript(()=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9128',apiKey:'x'};
    localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}})) });
  await P.goto('http://localhost:8769/mock.html');
  const note=()=>P.evaluate(()=>(document.getElementById('dataNote')||{}).textContent||'');
  ok(await wait(async()=>/590 self scout plays \+ 147 charted live \(737 total\)/.test(await note())), 'On open: "590 self scout plays + 147 charted live (737 total)" — got: '+await note());
  ok(/3 file\(s\) · 590 plays/.test(await P.textContent('#nOurs')), 'Our offense box counts the 3 self scout files, not the charted-live copy: '+await P.textContent('#nOurs'));
  // results pool both: a charted call draws on the self scout too
  const pool=await P.evaluate(()=>{ const p={name:'Gold Split Zone',form:'Gold',lab:'SPLIT ZONE'}; const M=window.__mock, ch=M.chartedFor(p), c=M.filmFor(p); return {charted:ch?ch.length:0, film:c?c.plays.length:0} });
  ok(pool.charted>0 && pool.film>100, 'Gold Split Zone has charted plays ('+pool.charted+') and self scout plays ('+pool.film+') to draw from');
  // pick the game: this week's call sheet loads
  await P.evaluate(d=>window.__mock.schedUse(d), D);
  ok(await wait(async()=>/week of 2026-11-20/.test(await P.textContent('#nSheet'))), 'Picking the game loads this week\'s call sheet: '+await P.textContent('#nSheet'));
  ok(/Call sheet: this week's/.test(await P.textContent('#schedNote')), 'Schedule note says the call sheet is this week\'s');
  ok(/DeSoto: 40 plays/.test(await P.textContent('#schedNote')), 'Opponent film sent file by file loads (40 plays)');
  ok(await wait(async()=>/590 self scout plays/.test(await note())), 'Self scout still 590 after picking the game');
  await P.screenshot({path:OUT+'mz-mock.png'});
  // old single-block format still reads
  const old=await P.evaluate(()=>window.__mock.packFiles({files:JSON.stringify([{name:'A',header:[],rows:[[1]]},{name:'Charted live · x',header:[],rows:[]}])}).map(f=>f.name).join(','));
  ok(old==='A', 'Old one-block format still loads, without the charted-live copy');
  // Reports: Send to the mock game writes the self scout file by file
  R.db.schools.melissa.mock.self={old:'x', files:'stale'};
  const ctx2=await b.newContext({viewport:{width:1366,height:1024}}); await ctx2.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:''}));
  const Q=await ctx2.newPage(); Q.on('pageerror',e=>errs.push('reports: '+e.message));
  await Q.addInitScript(()=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9128',apiKey:'x'}; localStorage.setItem('cardinals-report-builder-v1:folder','"self"');
    localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}})) });
  await Q.goto('http://localhost:8769/reports.html');
  ok(await wait(async()=>Q.evaluate(()=>{ const b=document.getElementById('st6go'); return !!b && !b.disabled && b.offsetParent!==null })), 'Reports self scout folder shows Send to the mock game');
  await Q.click('#st6go');
  ok(await wait(async()=>{ const s=R.getAt('/schools/melissa/mock/self'); return s && s.f && Object.keys(s.f).length===3 }), 'Self scout sent as 3 separate files');
  const sent=R.getAt('/schools/melissa/mock/self')||{};
  ok(!sent.files && !sent.old && sent.n===3, 'Old single block replaced, not mixed in');
  const sum=Object.keys(sent.f||{}).reduce((t,k)=>t+JSON.parse(sent.f[k].data).rows.length,0);
  ok(sum===590, 'All 590 self scout plays arrive ('+sum+')');
  await Q.screenshot({path:OUT+'mz-reports.png'});
  ok(errs.length===0, 'No page errors'+(errs.length?': '+errs.join(' | '):''));
  await b.close(); R.srv.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
