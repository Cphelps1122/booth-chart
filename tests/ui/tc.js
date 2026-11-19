// Text Coach picks the coach by name: RB quiz -> Coach Phelps, WR / TE quiz -> Coach Scoggin; more than one coach -> a name list;
// coaches are set on Player Quizzes (name, cell, which quizzes) and saving the week keeps them
// Run: node tests/ui/tc.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(require('os').tmpdir(),'booth-shots')+'/');
fs.mkdirSync(OUT,{recursive:true});
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{profile:{name:'Melissa'}}}},9132);
const srv=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8776);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,200)) } return false };
// catch where Text Coach sends the player instead of leaving the page
const CATCH=()=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9132'}; window.__sent=[]; window.__qkOpen=u=>window.__sent.push(u) };
async function finishRb(P){ await P.fill('#nm','Tre'); await P.evaluate(()=>{ deck=[]; n0=0; finish() }) }
(async()=>{
  const b=await chromium.launch(); const errs=[];
  const ctx=await b.newContext({viewport:{width:390,height:844}}); await ctx.route(/fonts\./, r=>r.fulfill({status:200,body:''}));
  // no coaches saved yet: built-in list
  let P=await ctx.newPage(); P.on('pageerror',e=>errs.push(e.message)); await P.addInitScript(CATCH);
  await P.goto('http://localhost:8776/quiz.html'); await finishRb(P); await P.click('#sms');
  ok(await wait(async()=>(await P.evaluate(()=>window.__sent)).length===1), 'RB quiz: Text Coach goes straight to the one RB coach');
  const u1=(await P.evaluate(()=>window.__sent))[0]; ok(/^sms:\+12145786616\?&body=/.test(u1) && /Tre/.test(decodeURIComponent(u1)), 'RB results go to Coach Phelps');
  const Q=await ctx.newPage(); Q.on('pageerror',e=>errs.push(e.message)); await Q.addInitScript(CATCH);
  await Q.goto('http://localhost:8776/passquiz.html'); await Q.fill('#nm','Jalen'); await Q.evaluate(()=>{ deck=[]; finish() }); await Q.click('#sms');
  ok(await wait(async()=>(await Q.evaluate(()=>window.__sent)).length===1) && /^sms:\+19037244650/.test((await Q.evaluate(()=>window.__sent))[0]), 'WR / TE results go to Coach Scoggin');
  // coach page: add a second RB coach and save
  const cc=await b.newContext({viewport:{width:1024,height:1366}}); await cc.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:''}));
  const C=await cc.newPage(); C.on('pageerror',e=>errs.push('coach: '+e.message));
  await C.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9132',apiKey:'x'}; localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa'})) });
  await C.goto('http://localhost:8776/quizzes.html');
  ok(await wait(async()=>C.isVisible('#coachPanel')), 'Player Quizzes shows Coaches');
  ok(await C.evaluate(()=>{ const r=[...document.querySelectorAll('#coBody tr')]; return r.length===2 && r[0].querySelector('[data-f=name]').value==='Coach Phelps' && r[1].querySelector('[data-f=phone]').value==='(903) 724-4650' && r[1].querySelector('[data-q=pass]').checked && !r[1].querySelector('[data-q=run]').checked }), 'Starts with Coach Phelps (RB, Film) and Coach Scoggin (903) 724-4650 (WR / TE)');
  await C.click('#coAdd'); const last=C.locator('#coBody tr').last();
  await last.locator('[data-f=name]').fill('Coach Lee'); await last.locator('[data-f=phone]').fill('972-555-0101'); await last.locator('[data-q=run]').check();
  await C.click('#coSave');
  ok(await wait(async()=>{ const c=R.getAt('/quizcfg/melissa/coaches'); return c && c.length===3 && c[2].phone==='+19725550101' && c[2].q.run }), 'Saved 3 coaches; Coach Lee\'s number stored as +19725550101');
  await C.click('#coAdd'); await C.click('#coSave'); ok(/needs a name and a 10-digit/.test(await C.textContent('#coNote')), 'A coach with no number can\'t be saved');
  await C.click('#coBody tr:last-child [data-codel]');
  await C.click('#wkSave'); ok(await wait(async()=>{ const c=R.getAt('/quizcfg/melissa'); return c && c.at && c.coaches && c.coaches.length===3 }), 'Saving this week keeps the coaches');
  await C.screenshot({path:OUT+'tc-coaches.png', fullPage:true});
  // two RB coaches: the player picks a name
  P=await ctx.newPage(); P.on('pageerror',e=>errs.push(e.message)); await P.addInitScript(CATCH);
  await P.goto('http://localhost:8776/quiz.html'); await finishRb(P); await P.click('#sms');
  ok(await wait(async()=>P.isVisible('#qkPick')), 'Two RB coaches: a "Send your results to" list pops up');
  const names=await P.$$eval('#qkPick .go:not(.alt)',x=>x.map(b=>b.textContent));
  ok(names.join(',')==='Coach Phelps,Coach Lee' && !/\d{3}/.test(await P.textContent('#qkPick')), 'It lists names only: '+names.join(', '));
  await P.screenshot({path:OUT+'tc-pick.png'});
  await P.click('#qkPick .go:has-text("Coach Lee")');
  ok(await wait(async()=>(await P.evaluate(()=>window.__sent)).some(u=>/^sms:\+19725550101\?&body=/.test(u))), 'Tapping Coach Lee opens a text to his number');
  await P.click('#sms'); await P.click('#qkPick [data-x]'); ok(!(await P.$('#qkPick')), 'Cancel closes the list');
  ok(errs.length===0, 'No page errors'+(errs.length?': '+errs.join(' | '):''));
  await b.close(); R.srv.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
