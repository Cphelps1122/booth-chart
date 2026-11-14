// Simple mode: Same as last play and the one-tap looks from tonight
// Run: node tests/ui/qlt.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium,devices}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), SEASON='season-aaaaaaaaaaaaaaaa', d='2026-11-06', G='/schools/melissa/games/mel-anna';
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:d,opp:'Anna',ha:'H'}],
  games:{[SEASON]:{list:{'mel-anna':{opp:'Anna',date:d,plays:0,real:1,gc:'A1106',updated:1}}},'mel-anna':{meta:{opp:'Anna',gameDate:d,gc:'A1106'}}}}}},9124);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8765);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
(async()=>{
 const b=await chromium.launch();
 const mk=async(name,vp)=>{ const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2});
   await ctx.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(name+': '+e.message+' @'+(e.stack||'').split('\n')[1]));
   await p.addInitScript(([SEASON])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9124',apiKey:'x'}; if (sessionStorage.s) return; sessionStorage.s=1;
     localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     localStorage.setItem('cardinals-booth-season-v1', SEASON); localStorage.setItem('solutions-role', 'chart');
     localStorage.setItem('cardinals-booth-sync-v1', JSON.stringify({url:'http://localhost:9124',code:'mel-anna'})); localStorage.setItem('cardinals-last-used', String(Date.now())) },[SEASON]);
   await p.goto('http://localhost:8765/app.html'); await p.waitForTimeout(2500); await p.click('#t-chart'); return p };
 const A=await mk('ipad',{width:1024,height:1366});
 const S=(p,f)=>p.evaluate(f);
 const step=p=>p.getAttribute('#v-chart','data-step');
 const spot=async p=>{ await S(p,()=>{ const s=window.__sol.S, l=s.snaps[s.snaps.length-1]; if(l&&l.gain==null){ l.gain=4; window.__sol.save() } }); await p.click('#imSimple'); await p.waitForTimeout(150) };
 // one play up to the defense step
 const toDef=async p=>{ await spot(p); if(await p.isVisible('#smNext')) await p.click('#smNext'); await p.click('#csForms button >> nth=0'); await p.click('#csPlays button >> nth=0'); await p.waitForTimeout(150) };
 const result=async p=>{ await p.click('#cRes [data-v="Rush"]'); await p.waitForTimeout(200); if(await p.isVisible('#logBtn') && await p.isEnabled('#logBtn')) await p.click('#logBtn'); await p.waitForTimeout(300) };
 await A.click('#imSimple');
 console.log('Quick looks');
 await toDef(A); ok(!await A.isVisible('#smLooks'),'first play: no looks yet');
 await A.click('#cShell [data-v="2-HIGH"]'); await A.click('#cBox [data-v="6"]'); await A.click('#smNext'); await result(A);
 await toDef(A); ok(await A.isVisible('#smSame') && /2-HIGH · 6 in box/.test(await A.textContent('#smSame')),'play 2 offers Same as last play: '+await A.textContent('#smSame'));
 await A.click('#cShell [data-v="1-HIGH"]'); await A.click('#cBox [data-v="7"]'); await A.click('#cPress [data-v="Yes"]'); await A.click('#smNext'); await result(A);
 await toDef(A); ok(await A.getAttribute('#cPress [data-v="Yes"]','aria-pressed')==='false' && await A.getAttribute('#cShell [data-v="1-HIGH"]','aria-pressed')==='true','after a pressure play: pressure is back to No, shell still carried');
  await A.click('#smSame'); ok(await step(A)==='5','Same as last play goes straight to the result'); await result(A);
 let sn=await S(A,()=>window.__sol.S.snaps.map(x=>[x.shell,x.box,x.blitz,!!x.needD].join()));
 ok(sn[2]==='1-HIGH,7,Yes,false','play 3 saved as the same look '+sn[2]);
 await toDef(A); const chips=await A.locator('#smLooks .chips .chip').allTextContents(); ok(chips.length===2 && /1-HIGH · 7 in box · pressure×2/.test(chips[0]),'looks listed most used first: '+chips.join(' | '));
 await A.screenshot({path:OUT+'ql_def.png'});
 await A.click('#smLooks .chips .chip >> nth=1'); ok(await step(A)==='5','a look chip goes straight to the result'); await result(A);
 sn=await S(A,()=>window.__sol.S.snaps.map(x=>[x.shell,x.box,x.blitz,!!x.needD].join())); ok(sn[3]==='2-HIGH,6,No,false','play 4 saved from the look chip '+sn[3]);
 await toDef(A); await A.click('#smSkip'); await result(A); await spot(A); await S(A,()=>document.getElementById('endSeries').click()); await A.waitForTimeout(300);
 ok(await A.isVisible('#smCatch') && await A.locator('#smcBody .lk .chip').count()===2,'catch-up shows the looks too'); await A.screenshot({path:OUT+'ql_catch.png'});
 await A.click('#smcBody .lk .chip >> nth=0'); await A.waitForTimeout(200);
 sn=await S(A,()=>window.__sol.S.snaps.map(x=>[x.shell,x.box,x.blitz,!!x.needD].join())); ok(sn[4]==='2-HIGH,6,No,false' && !await A.isVisible('#smCatch'),'one tap fills the missed play '+sn[4]);
 await A.click('#imFull'); ok(!await A.isVisible('#smLooks'),'Full input unchanged');
 const P={errs:[]};
 ok(A.errs.length+P.errs.length===0,'no page errors '+A.errs.concat(P.errs).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
