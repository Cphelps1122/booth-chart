// View-only accounts: nothing on any tab can be tapped or typed into
// Run: node tests/ui/lk.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium,devices}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), SEASON='season-aaaaaaaaaaaaaaaa', d='2026-11-06', G='/schools/melissa/games/mel-anna';
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:d,opp:'Anna',ha:'H'}],
  games:{[SEASON]:{list:{'mel-anna':{opp:'Anna',date:d,plays:0,real:1,gc:'A1106',updated:1}}},'mel-anna':{meta:{opp:'Anna',gameDate:d,gc:'A1106'}}}}}},9124);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8765);
const DS=JSON.parse(fs.readFileSync(ROOT+'/app.html','utf8').match(/var DEFAULT_SHEET = (\[.*\]);?\s*$/m)[1]);
const GRID=(()=>{ const cells=[]; let r0=0; const band=(idx,per)=>{ let h=0; idx.forEach((i,k)=>{ const bx=DS[i], c0=(k%per)*2, rr=r0; if(k%per===0&&k){ r0+=h+1; h=0 } const R=k%per===0&&k?r0:rr;
    cells.push({r:r0,c:c0,rs:1,cs:2,v:bx.name,h:1,f:bx.kind==='sit'?'1F3864':'FFD400'}); const pl=bx.plays.slice(0,12); pl.forEach((p,j)=>cells.push({r:r0+1+Math.floor(j/2),c:c0+j%2,rs:1,cs:1,v:p.t,b:i,k:/POWER|ZIP|SMACK|ZONE|DUO/.test(p.t)?'run':'pass'})); h=Math.max(h,Math.ceil(pl.length/2)) }); r0+=h+1 };
  const forms=DS.map((b,i)=>i).filter(i=>DS[i].kind==='form'), sits=DS.map((b,i)=>i).filter(i=>DS[i].kind==='sit');
  band(forms.slice(0,7),7); band(forms.slice(7,14),7); band(sits.slice(0,7),7); band(sits.slice(7,14),7); return {cols:14,rows:r0,cells} })();
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

 await toDef(A); await A.click('#smSkip'); await result(A); await spot(A);
 const audit=async(tag)=>{ const r=await A.evaluate(()=>{ const out={}; const vis=e=>{ const r=e.getBoundingClientRect(); if(!r.width||!r.height) return false; for(let x=e;x;x=x.parentElement){ const c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false } return true };
     document.querySelectorAll('section[id^="v-"]:not([hidden]) button, section[id^="v-"]:not([hidden]) input, section[id^="v-"]:not([hidden]) select, section[id^="v-"]:not([hidden]) textarea, section[id^="v-"]:not([hidden]) summary, section[id^="v-"]:not([hidden]) [data-n], section[id^="v-"]:not([hidden]) canvas, section[id^="v-"]:not([hidden]) svg, section[id^="v-"]:not([hidden]) td, header button, header select, #tagNag button, .modal:not([hidden]) button').forEach(e=>{ if(e.disabled||!vis(e)||getComputedStyle(e).pointerEvents==='none') return; if(e.tagName==='TD'&&!e.onclick&&getComputedStyle(e).cursor!=='pointer') return;
       let p=e.closest('[id]'); p=p&&p!==e?p:(e.parentElement&&e.parentElement.closest('[id]')); const k=(p?p.id:'?'); (out[k]=out[k]||[]).push((e.id?'#'+e.id:e.tagName.toLowerCase()+'.'+String(e.className.baseVal!=null?e.className.baseVal:e.className).split(' ')[0])+':'+(e.textContent||e.value||'').trim().slice(0,18)) });
     return out }); console.log('--- '+tag); for(const k in r) console.log('  '+k+' ['+r[k].length+']: '+[...new Set(r[k])].slice(0,40).join(' | ')) };
 const lock=async()=>{ await A.evaluate(()=>fetch('http://localhost:9124/schools/melissa/locks/u1.json',{method:'PUT',body:'true'})); await A.reload(); await A.waitForTimeout(3000); console.log('locked:',await A.evaluate(()=>document.body.classList.contains('inlocked'))) };
 const unlock=async()=>{ await A.evaluate(()=>fetch('http://localhost:9124/schools/melissa/locks/u1.json',{method:'DELETE'})); await A.reload(); await A.waitForTimeout(3000) };
 // simple mode, on the defense step
 await toDef(A); await lock(); await A.evaluate(()=>document.getElementById('t-chart').click()); await A.waitForTimeout(300); console.log('step',await step(A)); await audit('CHART simple'); await A.screenshot({path:OUT+'lock_simple.png'});
 for (const t of ['t-home','t-log','t-report','t-drives','t-games','t-week','t-setup']) { const ok2=await A.evaluate(id=>{ const b=document.getElementById(id); if(!b) return false; b.click(); return true },t); if(!ok2){ console.log('no tab',t); continue } await A.waitForTimeout(400); await audit(t) }

 // locked, Full input: the suggested calls can't be picked, even by a scripted click
 await unlock(); await A.evaluate(()=>document.getElementById('t-chart').click()); await A.click('#imFull'); await lock(); await A.evaluate(()=>document.getElementById('t-chart').click()); await A.waitForTimeout(300); await audit('CHART full');
 const before=await A.evaluate(()=>document.getElementById('callPicked').textContent);
 await A.evaluate(()=>{ const c=document.querySelector('#ncBox .nc-card'); if(c) c.click(); const f=document.querySelector('#csForms button'); if(f) f.click(); document.getElementById('sbUs').click(); });
 await A.waitForTimeout(200);
 ok(before===await A.evaluate(()=>document.getElementById('callPicked').textContent) && await A.evaluate(()=>document.getElementById('formPicked').textContent)==='—','locked: suggested call and formation taps do nothing');
 ok(await A.evaluate(()=>document.getElementById('scoreModal').hidden),'locked: score can\'t be opened');
 await A.screenshot({path:OUT+'lock_full.png'});
 await A.click('#ncWhy').catch(()=>{}); await A.click('#t-report'); ok(await A.isVisible('#tSit'),'locked: OC Report opens'); await A.click('#ocQtr .chip >> nth=1'); ok(await A.getAttribute('#ocQtr .chip >> nth=1','aria-pressed')==='true','locked: report filters still work');
 await A.click('#htBtn'); ok(await A.isVisible('#htModal'),'locked: halftime report opens'); await A.evaluate(()=>{ document.getElementById('htModal').hidden=true });
 await A.click('#t-log'); ok(await A.isVisible('#logXlsx') && await A.isEnabled('#logXlsx'),'locked: Plays tab and exports available');
 await A.click('#t-setup'); const v0=await A.inputValue('#lForm'); await A.evaluate(()=>{ const e=document.getElementById('lForm'); e.focus(); }); await A.keyboard.type('ZZZ'); ok(v0===await A.inputValue('#lForm'),'locked: settings can\'t be typed into');
 await A.evaluate(()=>document.getElementById('gsvFull').click()); ok(!await A.isChecked('#gsvFull'),'locked: settings checkboxes don\'t change');
 await unlock(); await A.evaluate(()=>document.getElementById('t-chart').click()); await A.waitForTimeout(200); await A.click('#csForms button >> nth=0'); ok(await A.evaluate(()=>document.getElementById('formPicked').textContent)!=='—','unlocked again: charting works');
 const P={errs:[]};
 ok(A.errs.length+P.errs.length===0,'no page errors '+A.errs.concat(P.errs).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
