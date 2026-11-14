// Call sheet: fit to the screen, full screen, and the per-device settings
// Run: node tests/ui/gst.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), SEASON='season-aaaaaaaaaaaaaaaa', d='2026-11-06';
start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:d,opp:'Anna',ha:'H'}],
  games:{[SEASON]:{list:{'mel-anna':{opp:'Anna',date:d,plays:0,real:1,gc:'A1106',updated:1}}},'mel-anna':{meta:{opp:'Anna',gameDate:d,gc:'A1106'}}}}}},9124);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8765);
const DS=JSON.parse(fs.readFileSync(ROOT+'/app.html','utf8').match(/var DEFAULT_SHEET = (\[.*\]);?\s*$/m)[1]);
const GRID=(()=>{ const cells=[]; let r0=0; const band=(idx,per)=>{ let h=0; idx.forEach((i,k)=>{ const bx=DS[i], c0=(k%per)*2, rr=r0; if(k%per===0&&k){ r0+=h+1; h=0 } const R=k%per===0&&k?r0:rr;
    cells.push({r:r0,c:c0,rs:1,cs:2,v:bx.name,h:1,f:bx.kind==='sit'?'1F3864':'FFD400'}); const pl=bx.plays.slice(0,12); pl.forEach((p,j)=>cells.push({r:r0+1+Math.floor(j/2),c:c0+j%2,rs:1,cs:1,v:p.t,b:i,k:/POWER|ZIP|SMACK|ZONE|DUO/.test(p.t)?'run':'pass'})); h=Math.max(h,Math.ceil(pl.length/2)) }); r0+=h+1 };
  const forms=DS.map((b,i)=>i).filter(i=>DS[i].kind==='form'), sits=DS.map((b,i)=>i).filter(i=>DS[i].kind==='sit');
  band(forms.slice(0,7),7); band(forms.slice(7,14),7); band(sits.slice(0,7),7); band(sits.slice(7,14),7); return {cols:14,rows:r0,cells} })();
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
(async()=>{
 const b=await chromium.launch();
 const mk=async(name,vp)=>{ const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2});
   await ctx.route(/googleapis\.com|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(name+': '+e.message+' @'+(e.stack||'').split('\n')[1]));
   await p.addInitScript(([SEASON])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9124',apiKey:'x'}; if (sessionStorage.s) return; sessionStorage.s=1;
     localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     localStorage.setItem('cardinals-booth-season-v1', SEASON); localStorage.setItem('solutions-role', 'chart');
     localStorage.setItem('cardinals-booth-sync-v1', JSON.stringify({url:'http://localhost:9124',code:'mel-anna'})); localStorage.setItem('cardinals-last-used', String(Date.now())) },[SEASON]);
   await p.goto('http://localhost:8765/app.html'); await p.waitForTimeout(2500); await p.click('#t-chart');
   await p.evaluate(G=>{ window.__sol.S.sheetGrid=G; window.__sol.save() }, GRID);
   return p };

 const A=await mk('ipad',{width:1024,height:1366});
 const fitW=p=>p.evaluate(()=>{ const g=document.getElementById('gsGrid'), w=document.getElementById('gsWrap'); const r=g.getBoundingClientRect(), wr=w.getBoundingClientRect(); const b=g.querySelector('.gc button'); return {over:w.scrollWidth-w.clientWidth, overH:w.scrollHeight-w.clientHeight, gw:Math.round(r.width), ww:Math.round(wr.width), font:b?Math.round(parseFloat(getComputedStyle(b).fontSize)*(+g.style.zoom||1)*10)/10:0, bh:b?Math.round(b.getBoundingClientRect().height):0, zoom:g.style.zoom} });
 console.log('1. Opens fitted to the width');
 await A.click('#imSheet'); await A.waitForTimeout(300); let m=await fitW(A); console.log(m);
 ok(m.over<=1,'no sideways scrolling on an upright iPad (over '+m.over+')'); ok(m.gw>=m.ww-6,'sheet uses the full width'); await A.locator('#gsPanel').screenshot({path:OUT+'gs_fit_portrait.png'});
 await A.setViewportSize({width:1366,height:1024}); await A.waitForTimeout(400); m=await fitW(A); console.log(m); ok(m.over<=1 && m.gw>=m.ww-6,'re-fits when the iPad is turned sideways'); await A.screenshot({path:OUT+'gs_fit_land.png'});
 console.log('2. Zoom and Fit button');
 await A.click('#gsZi'); await A.click('#gsZi'); await A.click('#gsZi'); let m2=await fitW(A); ok(m2.over>1 && (await A.textContent('#gsFit'))==='Fit','+ zooms in from the fitted size ('+JSON.stringify(m2)+')');
 await A.click('#gsFit'); m2=await fitW(A); ok(m2.over<=1 && m2.overH<=1 && /whole/.test(await A.textContent('#gsFit')),'Fit goes back to the whole sheet, the default '+JSON.stringify(m2));
 await A.click('#gsFit'); m2=await fitW(A); ok(m2.over<=1 && /width/.test(await A.textContent('#gsFit')),'a second tap switches to fitting the width ('+JSON.stringify(m2)+')'); await A.screenshot({path:OUT+'gs_fit_whole.png'});
 await A.click('#gsFit');
 console.log('3. Full screen');
 await A.click('#gsFullB'); await A.waitForTimeout(300); m=await fitW(A); console.log(m);
 const cov=await A.evaluate(()=>{ const r=document.getElementById('gsPanel').getBoundingClientRect(); return r.left<=0&&r.top<=0&&r.width>=innerWidth&&r.height>=innerHeight });
 ok(cov && m.over<=1,'sheet covers the whole screen, still fitted'); ok(!await A.isVisible('#gsQ'),'search and other panels hidden'); await A.screenshot({path:OUT+'gs_full_land.png'});
 await A.click('#gsGrid .gc button:not([data-noadv]) >> nth=0'); await A.waitForTimeout(300);
 ok(!await A.evaluate(()=>document.body.classList.contains('gs-full')) && await A.evaluate(()=>!!window.__sol.S && !!document.querySelector('#gsGrid button[aria-pressed=true]')),'tapping a play leaves full screen with the play picked');
 ok(await A.evaluate(()=>{ const r=document.getElementById('cRes').getBoundingClientRect(); return r.top>0 && r.bottom<innerHeight }),'result buttons are on screen'); await A.screenshot({path:OUT+'gs_after_pick.png'});
 await A.click('#cRes [data-v="Incomplete"]'); await A.waitForTimeout(200); if(await A.isEnabled('#logBtn')) await A.click('#logBtn'); await A.waitForTimeout(400);
 const n=await A.evaluate(()=>window.__sol.S.snaps.length), back=await A.evaluate(()=>document.body.classList.contains('gs-full')), rdy=await A.evaluate(()=>window.__sol.S.cur.ready);
 console.log('snaps',n,'ready',rdy,'full',back);
 await A.click('#gsFullB').catch(()=>{}); 
 console.log('4. Settings');
 await A.evaluate(()=>document.body.classList.remove('gs-full')); await A.click('#t-setup'); await A.waitForTimeout(200);
 ok(await A.isVisible('#gsvPanel'),'Settings shows Call sheet view'); await A.locator('#gsvPanel').screenshot({path:OUT+'gs_settings.png'});
 await A.selectOption('#gsvOpen','all'); await A.check('#gsvFull'); await A.selectOption('#gsvMin','11');
 await A.reload(); await A.waitForTimeout(2500); await A.evaluate(()=>document.getElementById('t-chart').click()); await A.waitForTimeout(300); m=await fitW(A); console.log(m);
 ok(await A.evaluate(()=>document.body.classList.contains('gs-full')),'setting: opens full screen after a reload'); ok(m.font>=10.9,'setting: text no smaller than Large ('+m.font+'px)');
 await A.click('#gsFullB'); ok(!await A.evaluate(()=>document.body.classList.contains('gs-full')),'Exit leaves full screen');
 await A.click('#imFull'); ok(await A.isVisible('#csForms') && !await A.isVisible('#gsPanel'),'Full input unchanged');
 const P=await mk('phone',{width:390,height:844}); await P.click('#imSheet'); await P.waitForTimeout(300); m=await fitW(P); console.log(m); ok(m.over<=1,'phone: fitted too'); await P.screenshot({path:OUT+'gs_phone.png'});
 ok(A.errs.length+P.errs.length===0,'no page errors '+A.errs.concat(P.errs).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
