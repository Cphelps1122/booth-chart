// WR / TE pass quiz: a receiver picks his number, goes through every play (line up, route, first read),
// the attempt saves as a pass quiz, and the coach page shows it and filters RB vs WR / TE
// Run: node tests/ui/pz.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(require('os').tmpdir(),'booth-shots')+'/');
fs.mkdirSync(OUT,{recursive:true});
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{profile:{name:'Melissa'}}},quiz:{melissa:{old1:{name:'Tre',score:20,total:30,at:1,groups:'RB runs',missed:'',plays:''}}}},9129);
const srv=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8773);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,200)) } return false };
(async()=>{
  const b=await chromium.launch();
  const pc=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); await pc.route(/fonts\./, r=>r.fulfill({status:200,body:''}));
  const P=await pc.newPage(); const errs=[]; P.on('pageerror',e=>errs.push(e.message));
  await P.addInitScript(()=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9129'} });
  await P.goto('http://localhost:8773/passquiz.html');
  // every play: the right route is among the choices, every choice is different, 2 to 4 choices
  const chk=await P.evaluate(()=>{ const out=[]; for(const n of [1,2,3,4]){ window.__pass.setMe(n); for(const pl of PASS){ const C=window.__pass.choices(pl); out.push({n, play:pl.name, k:C.length, right:C.filter(c=>c.ok).length}) } } window.__pass.setMe(0); return out });
  ok(chk.every(c=>c.right===1), 'Every play and number has exactly one right route among the choices');
  ok(chk.every(c=>c.k>=2 && c.k<=4), 'Every route question has 2 to 4 choices');
  await P.fill('#nm','Jalen'); await P.click('#begin');
  ok(await P.isVisible('#start'), 'Start needs a receiver number');
  await P.click('#nums .chip >> nth=2'); await P.click('#begin');
  ok(await P.isVisible('#quiz'), 'Quiz starts as #3');
  let plays=0;
  while(await P.isVisible('#quiz') && plays<20){
    plays++;
    const tb=await P.locator('#dia .tap >> nth=0').boundingBox(); await P.mouse.click(tb.x+tb.width/2, tb.y+tb.height/2);
    await P.waitForSelector('.opt', {timeout:4000});
    await P.click('.opt >> nth=0');
    await P.waitForTimeout(1300);
    if(await P.$('.txtopts .chip')) await P.click('.txtopts .chip >> nth=0');
    await P.waitForSelector('#next:not(.hidden)'); if(plays===3) await P.screenshot({path:OUT+'pz-rep.png'}); await P.click('#next');
  }
  ok(await P.isVisible('#done') && plays===14, 'All 14 plays run to the score screen ('+plays+')');
  ok(await wait(async()=>Object.values(R.getAt('/quiz/melissa')||{}).some(a=>a.kind==='pass')), 'Attempt saved as a pass quiz');
  const rec=Object.values(R.getAt('/quiz/melissa')||{}).find(a=>a.kind==='pass')||{};
  ok(rec.name==='Jalen' && rec.total>=28 && /#3/.test(rec.groups), 'Saved name, '+rec.score+'/'+rec.total+' and "#3"');
  await P.screenshot({path:OUT+'pz-done.png'});
  ok(errs.length===0, 'No page errors on the pass quiz'+(errs.length?': '+errs.join(' | '):''));
  // coach page
  const cc=await b.newContext({viewport:{width:1024,height:1366}}); await cc.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  const C=await cc.newPage(); const cerr=[]; C.on('pageerror',e=>cerr.push(e.message));
  await C.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9129',apiKey:'x'}; localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa'})) });
  await C.goto('http://localhost:8773/quizzes.html');
  ok(await wait(async()=>(await C.$$('#attList .att')).length===2), 'Coach page lists RB and WR/TE attempts');
  ok(/passquiz\.html/.test(await C.textContent('#plink')) && await C.isVisible('#shareP'), 'Coach page has the WR/TE quiz link with Share link');
  await C.selectOption('#kind','pass'); ok((await C.$$('#attList .att')).length===1 && /Jalen/.test(await C.textContent('#attList')), 'Filter WR / TE shows only the pass quiz');
  await C.selectOption('#kind','run'); ok((await C.$$('#attList .att')).length===1 && /Tre/.test(await C.textContent('#attList')), 'Filter RB shows only the run quiz');
  await C.screenshot({path:OUT+'pz-coach.png',fullPage:true});
  ok(cerr.length===0, 'No page errors on the coach page'+(cerr.length?': '+cerr.join(' | '):''));
  await b.close(); R.srv.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
