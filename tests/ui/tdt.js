// "Their defense" role: two devices on one game, Fast and Full
// Run: node tests/ui/tdt.js   (screenshots go to $SHOT_DIR, default a temp folder)
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

 const A=await mk('charter',{width:1024,height:1366}), D=await mk('defense',{width:1024,height:1366});
 const S=(p,f)=>p.evaluate(f);
 const step=p=>p.getAttribute('#v-chart','data-step');
 const spot=async p=>{ await S(p,()=>{ const s=window.__sol.S, l=s.snaps[s.snaps.length-1]; if(l&&l.gain==null){ l.gain=4; window.__sol.save() } }); await p.click('#imSimple'); await p.waitForTimeout(150) };
 const toPlay=async p=>{ await spot(p); if(await p.isVisible('#smNext')) await p.click('#smNext'); await p.click('#csForms button >> nth=0'); await p.click('#csPlays button >> nth=0'); await p.waitForTimeout(150) };
 const result=async p=>{ await p.click('#cRes [data-v="Rush"]'); await p.waitForTimeout(200); if(await p.isVisible('#logBtn') && await p.isEnabled('#logBtn')) await p.click('#logBtn'); await p.waitForTimeout(300) };
 const db=()=>Object.values(R.getAt(G+'/snaps')||{}).sort((a,b)=>(a.t||0)-(b.t||0));
 const sync=async(fn,ms)=>wait(()=>{ try { return fn(db()) } catch(e){ return false } },ms||8000);
 await A.click('#imSimple');
 console.log('1. Picking the role');
 await D.click('#roleChip'); await D.click('#roleModal [data-pick="theird"]'); await D.waitForTimeout(300);
 ok(await D.isVisible('#dlPanel') && !await D.isVisible('#csForms') && !await D.isVisible('.spotpanel'),'defense device shows only the look screen');
 ok(/Their defense/.test(await D.textContent('#roleChip')),'role chip says Their defense');
 ok(await D.isVisible('#dlPanel [data-dk="front"]') && await wait(()=>R.getAt(G+'/meta/dmode')==='full'),'starts in Full detail'); await D.screenshot({path:OUT+'td_start_full.png'}); await D.click('#dlPanel [data-dm="fast"]'); await D.waitForTimeout(300); await D.screenshot({path:OUT+'td_empty.png'});
 ok(await wait(async()=>/defense on another device/.test(await A.textContent('#smStepTxt'))),'charter is told the defense is on another device: '+await A.textContent('#smStepTxt'));
 console.log('2. Look sent before the snap');
 await D.click('#dlPanel [data-dk="shell"] [data-v="2-HIGH"]'); await D.click('#dlPanel [data-dk="box"] [data-v="6"]');
 ok(await wait(()=>{ const e=(R.getAt(G+'/meta/dl')||{}).e||{}; return e.n1 && e.n1.shell==='2-HIGH' && e.n1.box==='6' }),'look for play 1 saved on its own, before the play exists');
 ok(/waiting on the call/.test(await D.textContent('#dlCall')) && !await D.isVisible('#dlPrev'),'before the charter picks: waiting on the call');
 await A.waitForTimeout(600); await toPlay(A); ok(await step(A)==='5','charter goes play → result, no defense step ('+await step(A)+')');
 const picked=await A.evaluate(()=>document.getElementById('callPicked').textContent);
 ok(await wait(async()=>/POWER|[A-Z]{3}/.test(await D.textContent('#dlCall')) && !/waiting/.test(await D.textContent('#dlCall'))),'defense screen shows the call the charter picked: '+await D.textContent('#dlCall')); await D.screenshot({path:OUT+'td_call.png'});
 await result(A);
 ok(await wait(async()=>await D.isVisible('#dlPrev') && /Rush/.test(await D.textContent('#dlPrev')) && /waiting/.test(await D.textContent('#dlCall'))),'after the play: it moves to Last play, This play waits again: '+await D.textContent('#dlPrev'));
 ok(await D.locator('#dlPanel [data-dk] .chip[aria-pressed="true"]').count()===0,'buttons are blank for the new play');
 ok(await sync(x=>x.length===1 && x[0].shell==='2-HIGH' && x[0].box==='6' && !x[0].needD),'play 1 logged with the look attached: '+JSON.stringify(db().map(x=>[x.shell,x.box,x.blitz,!!x.needD])));
 console.log('3. Charter logs first, defense fills after');
 await toPlay(A); await result(A);
 ok(await sync(x=>x.length===2 && x[1].needD && !x[1].shell),'play 2 logged with no look, flagged');
 ok(await wait(async()=>(await D.locator('.dlrow.miss').count())===1),'defense device shows play 2 with no look'); await D.screenshot({path:OUT+'td_miss.png'});
 // the same moment: the charter spots the ball on play 2 while the defense person fills in its look
 await D.click('.dlrow.miss');
 await Promise.all([ S(A,()=>{ const s=window.__sol.S, l=s.snaps[1]; l.gain=7; window.__sol.save() }), D.click('#dlSame') ]);
 ok(await sync(x=>x[1].gain===7 && x[1].shell==='2-HIGH' && x[1].box==='6' && !x[1].needD, 12000),'both kept: yards from the charter and the look from the defense device: '+JSON.stringify(db().map(x=>[x.gain,x.shell,x.box,!!x.needD])));
 ok(await sync(x=>x[0].gain===4),'play 1 untouched');
 console.log('4. Pressure after the play, same as last, late fix');
 await D.click('#dlPanel [data-dk="shell"] [data-v="ZERO"]'); ok(await D.isVisible('#dlClear'),'Clear shows once a look is tapped'); await D.click('#dlClear'); ok(await D.locator('#dlPanel [data-dk] .chip[aria-pressed="true"]').count()===0 && await wait(()=>!((R.getAt(G+'/meta/dl')||{}).e||{}).n3),'Clear wipes a mis-tap');
 await D.click('#dlSame'); await D.waitForTimeout(700); await A.click('#imSimple'); await toPlay(A); await result(A);
 ok(await sync(x=>x.length===3 && x[2].shell==='2-HIGH' && x[2].blitz==='No'),'play 3 took Same as last play');
 await wait(async()=>(await D.locator('.dlrow').count())===3); await D.click('.dlrow >> nth=0'); await D.click('#dlPanel [data-dk="blitz"] [data-v="Yes"]');
 ok(await sync(x=>x[2].blitz==='Yes' && x[2].shell==='2-HIGH' && x[2].res==='Rush'),'pressure added to play 3 after it was logged');
 await D.click('.dlrow >> nth=2'); await D.click('#dlPanel [data-dk="shell"] [data-v="1-HIGH"]'); ok(await D.evaluate(()=>document.getElementById('dlPanel').classList.contains('fixing')) && await D.isVisible('#dlDone'),'fixing an old play is marked, with a Done button');
 ok(await sync(x=>x[0].shell==='1-HIGH' && x[0].box==='6'),'play 1 look corrected later'); await D.screenshot({path:OUT+'td_list.png'});
 const aSees=await S(A,()=>window.__sol.S.snaps.map(x=>[x.shell,x.box,x.blitz,x.gain].join())); ok(aSees[0].startsWith('1-HIGH,6')&&aSees[2].startsWith('2-HIGH,6,Yes'),'charter iPad shows the same looks: '+aSees.join(' | '));

 console.log('4b. Full detail');
 await toPlay(A); await result(A); ok(await wait(async()=>!await D.evaluate(()=>document.getElementById('dlPanel').classList.contains('fixing'))),'a new play being logged drops the defense screen back to the next play'); await D.waitForTimeout(500);
 await D.click('#dlPanel [data-dm="full"]'); await D.waitForTimeout(300);
 ok(await D.isVisible('#dlPanel [data-dk="front"]') && await D.isVisible('#dlPanel [data-dk="cov"]') && !await D.isVisible('#dlPanel [data-dk="shell"]'),'Full shows front, coverage and blitz');
 ok(await wait(()=>R.getAt(G+'/meta/dmode')==='full') && await wait(async()=>await S(A,()=>window.__sol.S.dmode)==='full'),'the switch reaches the charter iPad');
 const fr=await D.textContent('#dlPanel [data-dk="front"] .chip >> nth=0'), cv=await D.getAttribute('#dlPanel [data-dk="cov"] .chip >> nth=1','data-v'), bz=await D.getAttribute('#dlPanel [data-dk="blitz"] .chip >> nth=1','data-v');
 await D.click('#dlPanel [data-dk="front"] .chip >> nth=0'); await D.click('#dlPanel [data-dk="cov"] .chip >> nth=1'); await D.click('#dlPanel [data-dk="blitz"] .chip >> nth=1'); await D.screenshot({path:OUT+'td_full.png'});
 await D.waitForTimeout(700); await A.click('#imSimple'); await toPlay(A); ok(await step(A)==='5','charter still skips the defense step'); await result(A);
 ok(await sync(x=>x.length===5 && x[4].front===fr && x[4].cov===cv && x[4].blitz===bz && !x[4].needD),'play 4 logged with front, coverage and blitz: '+JSON.stringify(db().slice(4).map(x=>[x.front,x.cov,x.blitz,!!x.needD]))+' want '+[fr,cv,bz]);
 await toPlay(A); await result(A); await wait(async()=>(await D.locator('.dlrow.miss').count())===1); await D.click('.dlrow.miss'); await D.click('#dlSame');
 ok(await sync(x=>x.length===6 && x[5].front===fr && x[5].cov===cv && !x[5].needD),'play 6 filled afterwards with Same as last play');
 await D.click('#dlPanel [data-dm="fast"]'); await D.waitForTimeout(300); ok(await D.isVisible('#dlPanel [data-dk="shell"]'),'switching back to Fast works');
 console.log('5. Leaving the role');
 await D.click('#roleChip'); await D.click('#roleModal [data-pick="all"]'); await D.waitForTimeout(300);
 ok(!await D.isVisible('#dlPanel'),'defense screen goes away');
 ok(await wait(async()=>!/another device/.test(await A.textContent('#smStepTxt'))),'charter gets the defense step back: '+await A.textContent('#smStepTxt'));
 const P={errs:D.errs};
 ok(A.errs.length+P.errs.length===0,'no page errors '+A.errs.concat(P.errs).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
