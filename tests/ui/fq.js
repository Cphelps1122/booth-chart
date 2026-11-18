// Film quiz: a coach builds a quiz from Hudl clips + the playlist export; a player takes it with no account
// Run: node tests/ui/fq.js   (screenshots go to $SHOT_DIR, default a temp folder)
// Needs three short clips; it makes them with ffmpeg in a temp folder if they're missing.
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(os.tmpdir(),'booth-shots')+'/');
const VD=path.join(os.tmpdir(),'fq-clips'); fs.mkdirSync(VD,{recursive:true}); fs.mkdirSync(OUT,{recursive:true});
const CLIPS=['001','002','003'].map(n=>{ const f=path.join(VD,'Wide - Clip '+n+'.webm'); if(!fs.existsSync(f)) cp.execSync('ffmpeg -v error -y -f lavfi -i testsrc=size=320x180:rate=15:duration=2 -c:v libvpx-vp9 -b:v 200k "'+f+'"'); return f });
const CSV=path.join(VD,'PlaylistData.csv');
fs.writeFileSync(CSV,['PLAY #,ODK,DN,DIST,YARD LN,O FORMATION,FRONT,BLITZ,MFC/MFO/0,COVERAGE,TEAM',
 '15,D,1,10,-19,GOLD,41 OVER,,MFO,2,DUNCANVILLE','16,D,2,10,-19,TEXAS,HEADS,SAM,MFC,3,DUNCANVILLE','17,D,3,7,-22,CREW,41 UNDER,,MFC,3 CLOUD,DUNCANVILLE','18,D,1,10,-30,GOLD,41 OVER,MIKE,MFO,2,DUNCANVILLE'].join('\n'));
// stand-in for the SheetJS reader (no network in tests): same calls the page makes, reading CSV
const SHIM=`window.XLSX={read:(b)=>({SheetNames:['S'],Sheets:{S:new TextDecoder().decode(b)}}),utils:{sheet_to_json:(t)=>{const L=t.trim().split(/\\r?\\n/).map(l=>l.split(','));return L.slice(1).map(r=>Object.fromEntries(L[0].map((h,i)=>[h,r[i]==null?'':r[i]])))}}};`;
const R=start({admins:{},members:{u1:'melissa',u2:'melissa'},schools:{melissa:{profile:{name:'Melissa'}}}},9128);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8768);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=10000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,200)) } return false };
const STORED={};
async function ctxFor(b,vp,uid){ const ctx=await b.newContext({viewport:vp});
  await ctx.route(/fonts\.|googleapis\.com\/(?!.*firebasestorage)/, r=>r.fulfill({status:200,body:''}));
  await ctx.route(/cdnjs\.cloudflare\.com.*xlsx/, r=>r.fulfill({status:200,contentType:'text/javascript',body:SHIM}));
  await ctx.route(/firebasestorage\.googleapis\.com/, async r=>{ const u=new URL(r.request().url());
    if (r.request().method()==='POST') { const name=u.searchParams.get('name'); STORED[name]=r.request().postDataBuffer(); return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({name,downloadTokens:'tk'+Object.keys(STORED).length})}) }
    const name=decodeURIComponent(u.pathname.split('/o/')[1]||''); const buf=STORED[name]; return buf? r.fulfill({status:200,contentType:'video/webm',body:buf}) : r.fulfill({status:404,body:''}) });
  if (uid) await ctx.addInitScript(([uid])=>{ window.SOL_CONFIG={db:'http://localhost:9128',apiKey:'x'};
    localStorage.setItem('solutions-auth-v1', JSON.stringify({uid,email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}})) },[uid]);
  else await ctx.addInitScript(()=>{ window.SOL_CONFIG={db:'http://localhost:9128'} });
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); return p }
(async()=>{
 const b=await chromium.launch();
 console.log('1. Coach builds the quiz');
 const C=await ctxFor(b,{width:1024,height:1300},'u1');
 await C.goto('http://localhost:8768/quizzes.html'); await wait(()=>C.isVisible('#fqPanel'));
 ok(await C.isVisible('#fqBuild'),'the Film quiz builder shows on Player quizzes');
 await C.setInputFiles('#fqX',CSV); await C.setInputFiles('#fqV',CLIPS); await C.waitForTimeout(400);
 ok(await C.inputValue('#fqTitle')==='Film: DUNCANVILLE','the name fills in from the opponent');
 const rows=await C.$$eval('#fqBody tr',T=>T.map(t=>t.textContent));
 ok(rows.length===3 && /Play 15/.test(rows[0]) && /Play 17/.test(rows[2]),'clip 1 goes with row 1 ... clip 3 with row 3');
 const asks=await C.$$eval('#fqAsks input',I=>I.map(i=>i.dataset.ask+':'+(i.checked?1:0)+(i.disabled?'x':'')).join(' '));
 ok(/front:1 cov:1 shell:0 blitz:1 lbx?:0x stunt:0x/.test(asks) || (/front:1/.test(asks)&&/cov:1/.test(asks)&&/blitz:1/.test(asks)&&/lb:0x/.test(asks)),'front, coverage and blitz are on; tags not in the export are greyed out: '+asks);
 ok(/9 questions from 3 clips/.test(await C.textContent('#fqNote')),'3 clips x 3 tags = 9 questions: '+await C.textContent('#fqNote'));
 const bl=await C.$eval('#fqBody select[data-k="1"][data-a="blitz"]',s=>s.value); ok(bl==='SAM','the blitz answer comes from the tag (SAM)');
 ok(await C.$eval('#fqBody select[data-k="0"][data-a="blitz"]',s=>s.value)==='No blitz','a blank blitz tag means No blitz');
 await C.click('#fqBody [data-skip="2"]'); ok(/6 questions from 2 clips/.test(await C.textContent('#fqNote')),'Leave out drops a clip');
 await C.click('#fqBody [data-skip="2"]');
 await C.selectOption('#fqBody select[data-k="2"][data-a="front"]','HEADS'); // coach fixes a bad tag
 await C.screenshot({path:OUT+'fq_build.png',fullPage:true});
 await C.click('#fqMake');
 ok(await wait(()=>C.$$eval('#fqList .fq-item',L=>L.length===1)),'Make uploads the clips and lists the quiz');
 ok(Object.keys(STORED).length===3 && Object.keys(STORED).every(k=>/^schools\/melissa\/clips\/film-[a-z0-9]{24}\/\d\.webm$/.test(k)),'3 clips stored under the school: '+Object.keys(STORED)[0]);
 const tok=Object.keys(R.db.share||{})[0], sh=tok && JSON.parse(R.db.share[tok].items);
 ok(sh && sh.kind==='filmquiz' && sh.clips.length===3 && R.db.share[tok].by==='u1','the quiz is saved as a share link');
 ok(sh && sh.clips[2].asks.find(a=>a.k==='front').a==='HEADS','the coach\'s fix is the answer');
 ok(sh && sh.clips.every(c=>c.asks.every(a=>a.ch.includes(a.a) && new Set(a.ch).size===a.ch.length && a.ch.length>=2)),'every question has the answer plus other choices, no repeats');
 ok(R.db.schools.melissa.filmq && R.db.schools.melissa.filmq[tok].qs===9,'and listed for the school (9 questions)');
 const link=await C.$eval('#fqList .link',e=>e.textContent); ok(new RegExp('quiz\\.html\\?film='+tok+'$').test(link),'its player link: '+link);
 await C.screenshot({path:OUT+'fq_made.png',fullPage:true});

 console.log('2. Player takes it on a phone, no account');
 const P=await ctxFor(b,{width:390,height:844},null);
 await P.goto('http://localhost:8768/quiz.html?film='+tok); await wait(()=>P.isEnabled('#begin'));
 ok(/FILM: DUNCANVILLE/.test(await P.textContent('#ttl')) && /9 questions/.test(await P.textContent('#sub')),'the quiz loads: '+await P.textContent('#sub'));
 ok(!await P.isVisible('#groups') && !await P.isVisible('#key'),'the RB quiz picks and key are hidden');
 await P.fill('#nm','Jalen'); await P.click('#begin');
 ok(await wait(()=>P.evaluate(()=>{ const v=document.querySelector('#dia video'); return v && v.readyState>=2 })),'the clip plays');
 await P.waitForTimeout(500); await P.screenshot({path:OUT+'fq_player.png'});
 let wrong=0; for (let k=0;k<9;k++){ const q=await P.evaluate(()=>({q:document.getElementById('ask').textContent, c:document.getElementById('call').textContent}));
   const s=sh.clips.find(c=>c.clip===q.c), a=s.asks.find(x=>x.q===q.q);
   const pick= k<2 ? a.ch.find(x=>x!==a.a) : a.a; if(pick!==a.a) wrong++;
   await P.click('#dia .chs .chip[data-c="'+pick.replace(/"/g,'\\"')+'"]'); await P.click('#next'); }
 ok(await P.isVisible('#done') && (await P.textContent('#final')).trim()==='7 / 9','scored 7 / 9 after missing 2');
 ok(await wait(()=>Object.values(R.db.quiz&&R.db.quiz.melissa||{}).some(a=>a.name==='Jalen' && a.score===7 && a.total===9 && a.groups==='Film: DUNCANVILLE' && /it was/.test(a.missed))),'the attempt saves for Coach with what was missed');
 ok(decodeURIComponent(await P.getAttribute('#sms','href')).includes('Film: DUNCANVILLE'),'Text Coach names the film quiz');
 await P.click('#again'); ok((await P.textContent('#count'))==='Rep 1 of 2','Retry runs just the 2 missed');
 await P.screenshot({path:OUT+'fq_retry.png'});

 console.log('3. Coach sees it; a view-only account can\'t build');
 await C.reload(); await wait(()=>C.isVisible('#attPanel')); ok(/Film: DUNCANVILLE/.test(await C.textContent('#attList')),'the attempt shows on Player quizzes');
 R.db.schools.melissa.locks={u2:true}; const Lk=await ctxFor(b,{width:1024,height:900},'u2');
 await Lk.goto('http://localhost:8768/quizzes.html'); await wait(()=>Lk.isVisible('#fqPanel'));
 ok(!await Lk.isVisible('#fqBuild') && await Lk.$$eval('#fqList [data-fdel]',x=>x.length)===0 && await Lk.$$eval('#fqList .fq-item',x=>x.length)===1,'locked: sees the quiz, no builder, no Delete');

 console.log('4. Bad link');
 await P.goto('http://localhost:8768/quiz.html?film=nope0000000000000000000'); await P.waitForTimeout(800);
 ok(/isn.t available/.test(await P.textContent('#sub')) && !await P.isEnabled('#begin'),'a dead link says so and can\'t start');
 const errs=[...C.errs,...P.errs,...Lk.errs]; ok(!errs.length,'no page errors '+errs.join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); await b.close(); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
