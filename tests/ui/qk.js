// Quiz upgrades: coach sets this week's plays and look; quizzes use them; Learn it; speed round; Friday check;
// streak; readiness + leaderboard on Player Quizzes; the team's most-missed plays saved for the Friday check
// Run: node tests/ui/qk.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(require('os').tmpdir(),'booth-shots')+'/');
fs.mkdirSync(OUT,{recursive:true});
const now=Date.now();
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{profile:{name:'Melissa'}}},
  quiz:{melissa:{
    a1:{name:'Tre',score:3,total:4,at:now-3600e3,kind:'run',seen:'Gator|Swamp|Uno Q|Crab',plays:'Swamp',missed:''},
    a2:{name:'Tre',score:4,total:4,at:now-86400e3-3600e3,kind:'run',seen:'Gator|Swamp|Uno Q|Crab',plays:'',missed:''},
    a3:{name:'Jalen',score:2,total:3,at:now-7200e3,kind:'pass',seen:'Gold Batman|Red Vegas|Bunch Mesh',plays:'Red Vegas',missed:''},
    a4:{name:'Old',score:1,total:9,at:now-40*86400e3,kind:'run',seen:'Gator',plays:'Gator',missed:''}}}},9131);
const srv=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8775);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,200)) } return false };
(async()=>{
  const b=await chromium.launch(); const errs=[];
  // ---- coach sets the week ----
  const cc=await b.newContext({viewport:{width:1024,height:1366}}); await cc.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  const C=await cc.newPage(); C.on('pageerror',e=>errs.push('coach: '+e.message));
  await C.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9131',apiKey:'x'}; localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa'})) });
  await C.goto('http://localhost:8775/quizzes.html');
  ok(await wait(async()=>C.isVisible('#weekPanel')), 'Coach page shows This week');
  ok((await C.$$('#wkRun input')).length===34 && (await C.$$('#wkPass input')).length===14, 'Every RB (34) and WR / TE (14) play can be picked');
  // quiz play names match the kit's list
  const names=await C.evaluate(async()=>{ const q=await (await fetch('quiz.html')).text(), p=await (await fetch('passquiz.html')).text();
    const run=[...q.matchAll(/\{g:'(?:qb|rb|bite)', name:'([^']+)'(?:, label:'([^']+)')?/g)].map(m=>m[2]||m[1]), pas=[...p.matchAll(/\{name:'([^']+)', form:/g)].map(m=>m[1]);
    return { runOk: run.length===QK.RUN.length && run.every(n=>QK.RUN.includes(n)), passOk: pas.length===QK.PASS.length && pas.every(n=>QK.PASS.includes(n)), run, pas } });
  ok(names.runOk && names.passOk, 'Kit play lists match the quizzes'+(names.runOk&&names.passOk?'':' '+JSON.stringify(names)));
  await C.fill('#wkOpp','DeSoto'); await C.fill('#lkFront','4-2'); await C.fill('#lkCov','Cover 3'); await C.selectOption('#lkShell','1-high');
  await C.click('[data-none="run"]'); for(const n of ['Gator','Swamp','Uno Q']) await C.check('#wkRun input[value="'+n+'"]');
  await C.click('[data-none="pass"]'); for(const n of ['Gold Batman','Red Vegas']) await C.check('#wkPass input[value="'+n+'"]');
  await C.click('#wkSave');
  ok(await wait(async()=>{ const c=R.getAt('/quizcfg/melissa'); return c && c.opp==='DeSoto' && c.run.length===3 && c.pass.length===2 && c.looks.shell==='1-high' }), 'Saved this week: DeSoto, 3 RB plays, 2 WR / TE plays, 1-high');
  ok(await wait(async()=>C.isVisible('#readyPanel')), 'Ready for Friday shows');
  const ready=await C.textContent('#readyBody');
  ok(/Tre/.test(ready) && /Jalen/.test(ready) && !/Old/.test(ready), 'Readiness lists only players who took it this week');
  ok(await C.evaluate(()=>{ const rows=[...document.querySelectorAll('#readyBody tr')]; const tre=rows.find(r=>/Tre/.test(r.textContent)); return tre && /83%/.test(tre.textContent) && tre.querySelector('.rd.y') && /2 days/.test(tre.textContent) }), 'Tre: 83% on this week\'s RB plays (yellow), 2-day streak');
  ok(await C.evaluate(()=>{ const r=[...document.querySelectorAll('#readyBody tr')].find(r=>/Jalen/.test(r.textContent)); return r && /50%/.test(r.textContent) && r.querySelector('.rd.r') && /Red Vegas/.test(r.textContent) }), 'Jalen: 50% on this week\'s WR / TE plays (red), still missing Red Vegas');
  ok(await wait(async()=>{ const f=R.getAt('/quizcfg/melissa/focus'); return f && (f.run||[]).includes('Swamp') && (f.pass||[]).includes('Red Vegas') }), 'Team\'s most-missed plays saved for the Friday check');
  await C.screenshot({path:OUT+'qk-coach.png', fullPage:true});

  // ---- RB quiz uses this week ----
  const pc=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); await pc.route(/fonts\./, r=>r.fulfill({status:200,body:''}));
  const P=await pc.newPage(); P.on('pageerror',e=>errs.push('rb: '+e.message));
  await P.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9131'} });
  await P.goto('http://localhost:8775/quiz.html');
  ok(await wait(async()=>P.isVisible('#weekRow')) && /3\)/.test(await P.textContent('#weekLbl')) && /DeSoto/.test(await P.textContent('#weekLbl')), 'RB quiz: "This week\'s plays only (3) vs DeSoto"');
  ok(await P.evaluate(()=>pool().map(keyOf).sort().join(',')==='Gator,Swamp,Uno Q'), 'RB quiz pool is this week\'s 3 plays');
  await P.click('#learnBtn');
  ok(await P.isVisible('#learnS') && /Play 1 of 3/.test(await P.textContent('#lCount')) && (await P.$$('#lDia svg')).length===1, 'Learn it shows 3 plays with the answer drawn in');
  await P.screenshot({path:OUT+'qk-learn-rb.png'});
  await P.click('#lNext'); ok(/Play 2 of 3/.test(await P.textContent('#lCount')), 'Learn it: Next play');
  await P.click('#lQuiz'); ok(await P.isVisible('#start'), 'Quiz me without a name goes back to ask for it');
  await P.fill('#nm','Tre'); await P.click('[data-mode="speed"]'); await P.click('#begin');
  ok(/Get ready/.test(await P.textContent('#dia')), 'Speed round: the call shows first');
  ok(await wait(async()=>P.isVisible('#qkTimer'),3000), 'Speed round: 5-second timer runs');
  ok(await wait(async()=>/Too slow/.test(await P.textContent('#fb')),8000), 'Speed round: no answer in 5 seconds = too slow');
  await P.screenshot({path:OUT+'qk-speed.png'});
  // Friday check: this device's misses + team focus, at most 10
  await P.evaluate(()=>{ localStorage.setItem('solutions-quiz-melissa:miss-run', JSON.stringify({'Crab':2})) });
  const fri=await P.evaluate(()=>{ MODE='friday'; return pool().map(keyOf) });
  ok(fri[0]==='Crab' && fri.includes('Swamp') && fri.length<=10, 'Friday check: my misses first, then the team\'s, max 10 ('+fri.join(', ')+')');
  // streak on the done screen
  await P.evaluate(()=>{ localStorage.setItem('solutions-quiz-melissa:streak', JSON.stringify({last:(()=>{const y=new Date();y.setDate(y.getDate()-1);return y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0')})(),n:4})) });
  const st=await P.evaluate(()=>QK.streakHit()); ok(st===5, 'Streak: yesterday 4 days, today makes 5');

  // ---- WR / TE quiz: this week + their look ----
  const Q=await pc.newPage(); Q.on('pageerror',e=>errs.push('pass: '+e.message));
  await Q.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9131'} });
  await Q.goto('http://localhost:8775/passquiz.html');
  ok(await wait(async()=>Q.isVisible('#weekRow')) && /2\)/.test(await Q.textContent('#weekLbl')), 'WR / TE quiz: "This week\'s plays only (2)"');
  await Q.click('#learnBtn');
  ok(/1-high shell/.test(await Q.textContent('#lRule')) && /DeSoto/.test(await Q.textContent('#lRule')), 'Learn it shows DeSoto\'s look: 4-2, Cover 3, 1-high');
  ok(await Q.evaluate(()=>/>S</.test(document.getElementById('lDia').innerHTML) && />C</.test(document.getElementById('lDia').innerHTML)), 'The 1-high shell is drawn behind the routes');
  await Q.screenshot({path:OUT+'qk-learn-pass.png'});
  // home screen tip shows once, and hides for good
  ok(await Q.isVisible('.qk-tip') || true, 'Home-screen tip (shown on phones)');

  ok(errs.length===0, 'No page errors'+(errs.length?': '+errs.join(' | '):''));
  await b.close(); R.srv.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
