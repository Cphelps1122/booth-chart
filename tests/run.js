// Solutions sync tests. Run before every push:  node tests/run.js
// Starts a fake database (port 9124) and a local web server (port 8765), then plays a fake game on 3 devices.
const {chromium}=require('playwright'); const {start}=require('./rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..'), SEASON='season-aaaaaaaaaaaaaaaa', d='2026-11-06', G='/schools/melissa/games/mel-anna';
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:d,opp:'Anna',ha:'H'}],
  games:{[SEASON]:{list:{'mel-anna':{opp:'Anna',date:d,plays:0,real:1,gc:'A1106',updated:1}}},'mel-anna':{meta:{opp:'Anna',gameDate:d,gc:'A1106'}}}}}},9124);
const web=http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8765);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
(async()=>{
 const b=await chromium.launch(); const devs=[];
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1100,height:1300}});
   await ctx.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.ctx=ctx; p.errs=[]; p.on('pageerror',e=>p.errs.push(name+': '+e.message+' @'+(e.stack||'').split('\n')[1]));
   await p.addInitScript(([SEASON])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9124',apiKey:'x'}; if (sessionStorage.s) return; sessionStorage.s=1;
     localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     localStorage.setItem('cardinals-booth-season-v1', SEASON); localStorage.setItem('solutions-role', 'chart');
     localStorage.setItem('cardinals-booth-sync-v1', JSON.stringify({url:'http://localhost:9124',code:'mel-anna'})); localStorage.setItem('cardinals-last-used', String(Date.now())) },[SEASON]);
   await p.goto('http://localhost:8765/app.html'); await p.waitForTimeout(2500); devs.push(p); return p };
 const A=await mk('A'), B=await mk('B'), C=await mk('C');
 const st=(p,f)=>p.evaluate(f);
 const snaps=p=>st(p,()=>(window.__sol.S.snaps||[]).length);
 const srvSnaps=()=>Object.keys(R.getAt(G+'/snaps')||{}).length;
 const log=async p=>{ if(!await p.isVisible('#logBtn')) await p.click('#t-chart'); await p.evaluate(()=>{ const S=window.__sol.S, l=S.snaps[S.snaps.length-1]; if(l&&l.gain==null){ l.gain=4; window.__sol.save() } }); await p.click('#cRes [data-v="Rush"]'); await p.waitForTimeout(200); if(await p.isEnabled('#logBtn')) await p.click('#logBtn'); await p.waitForTimeout(300) }; // fast mode logs Rush on its own

 await st(A,()=>{ window.__sol.S.reels={}; window.__sol.S.scoreLog=[]; window.__sol.save() }); // empty lists, which the real database drops
 console.log('1. Two devices edit different game info at the same moment');
 await Promise.all([ st(A,()=>{ window.__sol.S.oppScore=7; window.__sol.save() }), st(B,()=>{ window.__sol.S.clipNotes={x1:'watch the backside end'}; window.__sol.save() }) ]);
 await wait(()=>{ const m=R.getAt(G+'/meta')||{}; return m.oppScore===7 && m.clipNotes });
 const m=R.getAt(G+'/meta')||{}; ok(m.oppScore===7, 'score from A saved'); ok(!!(m.clipNotes&&m.clipNotes.x1), 'note from B saved (not overwritten)'); ok(m.opp==='Anna', 'untouched info kept');
 for (const [n,p] of [['A',A],['B',B],['C',C]]) ok(await wait(()=>st(p,()=>window.__sol.S.oppScore===7 && !!(window.__sol.S.clipNotes||{}).x1)), n+' sees both changes');

 console.log('2. Plays logged on 3 devices');
 for (const p of [A,B,C]) { await log(p); await wait(async()=>await snaps(B)===await snaps(p) && await snaps(C)===await snaps(p)) }
 ok(await wait(()=>srvSnaps()===3), 'database has 3 plays (has '+srvSnaps()+')');
 for (const [n,p] of [['A',A],['B',B],['C',C]]) ok(await wait(async()=>await snaps(p)===3), n+' shows 3 plays');

 await A.waitForTimeout(6500); for (const [n,p] of [['A',A],['B',B],['C',C]]) ok((await p.textContent('#pSync'))==='Live', n+' status light says Live once all is saved ('+await p.textContent('#pSync')+')');
 console.log('3. One device drops offline, keeps charting, comes back');
 await C.ctx.setOffline(true); await log(C); await log(C); await log(A); // A and C now both chart blind to each other await A.waitForTimeout(2000);
 ok(srvSnaps()===4, 'while C is offline, database only has A\'s new play');
 ok(await wait(async()=>/waiting/.test(await C.textContent('#pSync'))), 'C status light shows changes waiting ('+await C.textContent('#pSync')+')');
 await C.ctx.setOffline(false); await C.evaluate(()=>window.dispatchEvent(new Event('online')));
 ok(await wait(()=>srvSnaps()===6, 15000), 'after reconnect database has all 6 plays (has '+srvSnaps()+')');
 for (const [n,p] of [['A',A],['B',B],['C',C]]) ok(await wait(async()=>await snaps(p)===6, 15000), n+' shows 6 plays');

 ok(await wait(async()=>await C.textContent('#pSync')==='Live'), 'C status light back to Live');
 console.log('4. End game');
 await st(A,()=>{ document.getElementById('egModal').hidden=false; document.getElementById('egUs').value='28'; document.getElementById('egThem').value='14' }); await A.click('#egGo');
 ok(await wait(()=>{ const f=(R.getAt(G+'/meta')||{}).final; return f && f.us===28 && f.them===14 }), 'final score saved');
 ok(await wait(()=>st(B,()=>!!window.__sol.S.final)), 'other devices see the final');
 ok(srvSnaps()===6 && !!(R.getAt(G+'/meta')||{}).clipNotes, 'plays and notes still there after End game');

 const errs=devs.flatMap(p=>p.errs); ok(errs.length===0, 'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
 console.log(`\n${pass} passed, ${fail} failed`); await b.close(); R.srv.close(); web.close(); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
