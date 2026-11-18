// Player quiz: a player finishes the quiz with no account, the attempt is saved, the coach page lists it and can delete it
// Run: node tests/ui/qz.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(require('os').tmpdir(),'booth-shots')+'/');
fs.mkdirSync(OUT,{recursive:true});
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{profile:{name:'Melissa'}}}},9126);
const srv=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8767);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,200)) } return false };
(async()=>{
  const b=await chromium.launch();
  // player: phone, no Solutions account
  const pc=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  await pc.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  const P=await pc.newPage(); const errs=[]; P.on('pageerror',e=>errs.push(e.message));
  await P.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9126'} });
  await P.goto('http://localhost:8767/quiz.html');
  await P.click('#begin');
  ok(await P.isVisible('#start'), 'Start without a name stays on the start screen');
  await P.fill('#nm','Marcus');
  // study only the Bite group so the run is short
  await P.evaluate(()=>{ document.querySelectorAll('#groups .chip').forEach((c,i)=>{ if(i<2) c.click() }) });
  await P.click('#begin');
  ok(await P.isVisible('#quiz'), 'Quiz starts once a name is typed');
  let reps=0;
  while(await P.isVisible('#quiz') && reps<40){
    reps++;
    await P.waitForSelector('#dia .tap.live');
    if(await P.$('#dia [data-id="al-L"]')){ await P.click('#dia [data-id="al-L"]'); await P.waitForTimeout(1100) }
    await P.waitForSelector('#dia .tap.live');
    await P.click('#dia .tap.live >> nth=0');
    await P.waitForSelector('#next:not(.hidden)'); await P.click('#next');
  }
  ok(await P.isVisible('#done'), 'Player reaches the score screen ('+reps+' reps)');
  await P.screenshot({path:OUT+'qz-player-done.png'});
  ok(await wait(async()=>{ const q=R.getAt('/quiz/melissa'); return q && Object.keys(q).length===1 }), 'Finished attempt is saved under quiz/melissa');
  const id=Object.keys(R.getAt('/quiz/melissa')||{})[0], rec=(R.getAt('/quiz/melissa')||{})[id]||{};
  ok(rec.name==='Marcus' && rec.total===reps && typeof rec.score==='number', 'Saved name, score and total ('+rec.score+'/'+rec.total+')');
  ok(typeof rec.missed==='string' && typeof rec.plays==='string', 'Saved what he missed');
  ok(errs.length===0, 'No page errors on the quiz' + (errs.length?': '+errs.join(' | '):''));

  // coach: signed in to Solutions
  const cc=await b.newContext({viewport:{width:1024,height:1366}});
  await cc.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  const C=await cc.newPage(); const cerr=[]; C.on('pageerror',e=>cerr.push(e.message));
  await C.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9126',apiKey:'x'};
    localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa'})) });
  await C.goto('http://localhost:8767/quizzes.html');
  ok(await wait(async()=>(await C.$$('#attList .att')).length===1), 'Coach page lists the attempt');
  ok(/Marcus/.test(await C.textContent('#sumBody')), 'Player summary shows Marcus');
  ok(/quiz\.html/.test(await C.textContent('#qlink')), 'Coach page shows the player quiz link');
  ok(await C.isVisible('#shareLink'), 'Coach page has a Share link button');
  ok(/Player quizzes/i.test(await C.textContent('.tabs')), 'Site menu includes Player quizzes');
  await C.screenshot({path:OUT+'qz-coach.png', fullPage:true});
  C.once('dialog', d=>d.accept());
  await C.click('#attList [data-del]');
  ok(await wait(async()=>!Object.keys(R.getAt('/quiz/melissa')||{}).length), 'Delete removes the attempt from the database');
  ok(await wait(async()=>(await C.$$('#attList .att')).length===0), 'Deleted attempt disappears from the page');

  // signed out: the coach page asks to sign in and shows no attempts
  const oc=await b.newContext(); const O=await oc.newPage(); await O.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  await O.goto('http://localhost:8767/quizzes.html');
  ok(/Sign in/i.test(await O.textContent('#msg')) && await O.isHidden('#attPanel'), 'Signed out: coach page asks to sign in');
  ok(cerr.length===0, 'No page errors on the coach page' + (cerr.length?': '+cerr.join(' | '):''));
  await b.close(); R.srv.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
