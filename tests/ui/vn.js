// Game-day stadium: a neutral-site game with the stadium typed on the schedule shows that stadium's field
// Run: node tests/ui/vn.js   (screenshots go to $SHOT_DIR, default a temp folder). The map services are stood in for.
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(os.tmpdir(),'booth-shots')+'/'); fs.mkdirSync(OUT,{recursive:true});
const SEASON='season-aaaaaaaaaaaaaaaa', d=new Date(), TODAY=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const R=start({admins:{},members:{u1:'melissa'},venues:{},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:TODAY,opp:'DeSoto',ha:'N',venue:'Mesquite Memorial Stadium'}],games:{[SEASON]:{list:{}}}}}},9129);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8769);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=12000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
// a football field (110 m x 49 m) where the stand-in map says Mesquite Memorial Stadium is
const C0=[32.7668,-96.6050], dLat=55/111320, dLon=24.5/(111320*Math.cos(C0[0]*Math.PI/180));
const RECT=[[C0[0]-dLat,C0[1]-dLon],[C0[0]-dLat,C0[1]+dLon],[C0[0]+dLat,C0[1]+dLon],[C0[0]+dLat,C0[1]-dLon],[C0[0]-dLat,C0[1]-dLon]].map(p=>({lat:p[0],lon:p[1]}));
const GEO=[];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1024,height:1366}});
 await ctx.route(/fonts\./, r=>r.fulfill({status:200,body:''}));
 await ctx.route(/googleapis\.com|gstatic/, r=>r.fulfill({status:200,body:'{}'}));
 await ctx.route(/nominatim\.openstreetmap\.org/, r=>{ const q=new URL(r.request().url()).searchParams.get('q'); GEO.push(q); return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/mesquite memorial/i.test(q)?[{lat:String(C0[0]),lon:String(C0[1])}]:/melissa/i.test(q)?[{lat:'33.28',lon:'-96.57'}]:[])}) });
 await ctx.route(/overpass-api\.de/, r=>{ const q=decodeURIComponent(new URL(r.request().url()).searchParams.get('data')||''); const near=/around:\d+,32\.76/.test(q);
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements: near?[{type:'way',tags:{leisure:'pitch',sport:'american_football'},geometry:RECT}]:[]})}) });
 await ctx.route(/arcgisonline|tile|World_Imagery/, r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
 await ctx.addInitScript(([SEASON])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9129',apiKey:'x'};
   localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
   localStorage.setItem('cardinals-booth-season-v1', SEASON) },[SEASON]);
 const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
 const note=()=>p.evaluate(()=>(document.getElementById('venueNote')||{}).textContent||'');

 console.log('1. Neutral site with the stadium typed in');
 await p.goto('http://localhost:8769/app.html');
 ok(await wait(async()=>/Mesquite Memorial Stadium/.test(await note()) && /satellite/.test(await note()),20000),'the chart finds Mesquite Memorial Stadium: '+await note());
 ok(GEO.some(q=>/^Mesquite Memorial Stadium, Texas$/.test(q)),'it searched the map for the stadium, not a school: '+GEO.join(' | '));
 const V=R.db.venues||{}; ok(V['_v_mesquite-memorial-stadium'] && V['_v_mesquite-memorial-stadium'].field,'the field is saved for that stadium so every school playing there gets it');
 ok(!V.melissa && !V.desoto,'Melissa\'s and DeSoto\'s own stadiums are left alone');
 await p.evaluate(()=>{ const d=[...document.querySelectorAll('details')].find(x=>/Field view/.test(x.textContent)); if(d){ d.open=true; d.scrollIntoView() } }); await p.waitForTimeout(400);
 await p.screenshot({path:OUT+'venue_neutral.png'});

 console.log('2. The schedule on the home screen keeps and edits the stadium');
 await p.evaluate(()=>document.getElementById('hnEd').click()); await p.waitForTimeout(500);
 const vin=await p.$('input[data-f="venue"]'); ok(!!vin && await vin.inputValue()==='Mesquite Memorial Stadium','the schedule shows the Stadium box with it filled in');
 ok(/Stadium/.test(await p.evaluate(()=>document.querySelector('.se-t, table th:nth-child(4)') ? [...document.querySelectorAll('th')].map(t=>t.textContent).join('|') : '')),'the column is labeled Stadium');
 await p.evaluate(()=>{ const i=document.querySelector('input[data-f="venue"]'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); [...document.querySelectorAll('button.se-s')][0].click() });
 ok(await wait(()=>{ const s=R.db.schools.melissa.schedule; return s && s[0] && !s[0].venue && s[0].ha==='N' }),'clearing it and saving removes the stadium');
 await p.evaluate(()=>document.getElementById('hnEd').click()); await p.waitForTimeout(400);
 await p.evaluate(()=>{ const i=document.querySelector('input[data-f="venue"]'); i.value='Mesquite Memorial Stadium'; i.dispatchEvent(new Event('input',{bubbles:true})); [...document.querySelectorAll('button.se-s')][0].click() });
 ok(await wait(()=>{ const s=R.db.schools.melissa.schedule; return s && s[0] && s[0].venue==='Mesquite Memorial Stadium' }),'typing it and saving keeps it (it used to be dropped when saved from the home screen)');

 console.log('3. Neutral site with no stadium');
 R.db.schools.melissa.schedule=[{date:TODAY,opp:'DeSoto',ha:'N'}]; await p.reload();
 ok(await wait(async()=>/neutral site/i.test(await note()) && /Stadium box/.test(await note())),'the note says to type the stadium on the schedule: '+await note());
 const before=JSON.stringify(R.db.venues);
 await p.evaluate(()=>document.getElementById('luOpen').click()); await p.waitForTimeout(500);
 ok(await p.evaluate(()=>document.getElementById('luModal').hidden) && /Add the stadium/.test(await p.evaluate(()=>document.getElementById('toast').textContent)),'Line up this game\'s field asks for the stadium first instead of opening');
 ok(JSON.stringify(R.db.venues)===before,'and nothing is saved over Melissa\'s stadium');

 console.log('4. Home and away still work as before');
 R.db.schools.melissa.schedule=[{date:TODAY,opp:'DeSoto',ha:'H'}]; await p.reload();
 ok(await wait(async()=>/Home stadium/.test(await note())),'a home game uses Melissa\'s stadium photo: '+await note());
 GEO.length=0; R.db.schools.melissa.schedule=[{date:TODAY,opp:'DeSoto',ha:'A'}]; await p.reload();
 ok(await wait(async()=>GEO.some(q=>/desoto/i.test(q))),'an away game looks up DeSoto\'s stadium: '+GEO.join(' | '));
 ok(p.errs.length===0,'no page errors '+p.errs.join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); await b.close(); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
