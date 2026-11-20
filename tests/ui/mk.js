// Mock game: the call sheet follows the same fit rules
// Run: node tests/ui/mk.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/');
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8765);
const DS=JSON.parse(fs.readFileSync(ROOT+'/app.html','utf8').match(/var DEFAULT_SHEET = (\[.*\]);?\s*$/m)[1]);
const GRID=(()=>{ const cells=[]; let r0=0; const band=(idx,per)=>{ let h=0; idx.forEach((i,k)=>{ const bx=DS[i], c0=(k%per)*2; if(k%per===0&&k){ r0+=h+1; h=0 }
    cells.push({r:r0,c:c0,rs:1,cs:2,v:bx.name,h:1,f:bx.kind==='sit'?'1F3864':'FFD400'}); const pl=bx.plays.slice(0,12); pl.forEach((p,j)=>cells.push({r:r0+1+Math.floor(j/2),c:c0+j%2,rs:1,cs:1,v:p.t,b:i,k:/POWER|ZIP|SMACK|ZONE|DUO/.test(p.t)?'run':'pass'})); h=Math.max(h,Math.ceil(pl.length/2)) }); r0+=h+1 };
  const forms=DS.map((b,i)=>i).filter(i=>DS[i].kind==='form'), sits=DS.map((b,i)=>i).filter(i=>DS[i].kind==='sit');
  band(forms.slice(0,7),7); band(forms.slice(7,14),7); band(sits.slice(0,7),7); band(sits.slice(7,14),7); return {cols:14,rows:r0,cells} })();
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
(async()=>{
 const b=await chromium.launch();
 const mk=async(vp,sheet,view)=>{ const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2}); await ctx.route(/googleapis\.com|gstatic|firebaseio|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
   await p.addInitScript(([sheet,view])=>{ if(sheet) localStorage.setItem('sol-mock-sheet',JSON.stringify(sheet)); if(view) localStorage.setItem('solutions-gsview',JSON.stringify(view)) },[sheet,view]);
   await p.goto('http://localhost:8765/mock.html'); await p.waitForTimeout(1500); return p };
 const m=p=>p.evaluate(()=>{ const g=document.getElementById('grid'), w=g.parentNode, b=g.querySelector('.gc button'); return {over:w.scrollWidth-w.clientWidth, overH:w.scrollHeight-w.clientHeight, font:b?parseFloat(getComputedStyle(b).fontSize):0, fit:document.getElementById('fitBtn').textContent, n:g.children.length} });
 console.log('sample sheet');
 let P=await mk({width:1366,height:1024}); await P.click('#sampleBtn'); await P.waitForTimeout(800); let r=await m(P); console.log(r); ok(r.n>0 && r.over<=1 && r.overH<=1,'sample sheet fits whole, no scrolling');
 console.log('wide 14-column sheet');
 const sheet={boxes:DS,grid:GRID,name:'Wide test sheet'};
 P=await mk({width:1366,height:1024},sheet); const started=await P.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/start|kick ?off|play/i.test(x.textContent)&&x.offsetParent); return b?b.id+':'+b.textContent:'' }); console.log('start button:',started);
 await P.evaluate(()=>{ try { startGame() } catch(e){ const b=document.getElementById('startBtn')||document.getElementById('goBtn'); if(b) b.click() } }); await P.waitForTimeout(800);
 r=await m(P); console.log(r); ok(r.n>100 && r.over<=1 && r.overH<=1 && /whole/.test(r.fit),'iPad sideways: whole sheet on screen by default'); await P.locator('.gswrap').screenshot({path:OUT+'mock_whole.png'}); await P.screenshot({path:OUT+'mock_page.png'});
 await P.click('#fitBtn'); r=await m(P); console.log(r); ok(r.over<=1 && /width/.test(r.fit),'Fit: width has no sideways scroll, bigger text');
 await P.click('#fitBtn'); r=await m(P); console.log(r); ok(r.over>1 && /off/.test(r.fit) && r.font===12,'Fit: off is the old full-size sheet');
 await P.click('#fitBtn'); await P.setViewportSize({width:1024,height:1366}); await P.waitForTimeout(400); r=await m(P); console.log(r); ok(r.over<=1 && r.overH<=1,'re-fits when the iPad is turned upright');
 const tapped=await P.evaluate(()=>{ const b=document.querySelector('#grid .gc button:enabled'); if(!b) return 'none enabled'; b.click(); return b.textContent }); await P.waitForTimeout(500); console.log('tapped',tapped); r=await m(P); ok(r.over<=1,'still fitted after tapping a play');
 P.errs.length&&console.log(P.errs);
 console.log('follows the Settings choice');
 P=await mk({width:1366,height:1024},sheet,{open:'w',min:11}); await P.evaluate(()=>{ const b=document.getElementById('startBtn')||document.getElementById('goBtn'); if(b) b.click() }); await P.waitForTimeout(800); r=await m(P); console.log(r); ok(/width/.test(r.fit) && r.font>=11 && r.over<=1,'opens on Fit: width with Large text when Settings says so');
 P=await mk({width:1366,height:1024},sheet,{open:'keep'}); await P.evaluate(()=>{ const b=document.getElementById('startBtn')||document.getElementById('goBtn'); if(b) b.click() }); await P.waitForTimeout(800); r=await m(P); ok(/off/.test(r.fit),'"Keep my zoom" in Settings leaves the mock sheet full size');

 console.log('charting practice: a call that is on the sheet twice counts in either spot');
 { let done=false;
   for (let i=0;i<40 && !done;i++) {
     const Q=await mk({width:1366,height:1024}); await Q.evaluate(()=>{ document.querySelector('[name=mode][value=chart]').checked=true }); await Q.click('#sampleBtn'); await Q.waitForTimeout(500);
     await Q.evaluate(()=>{ const b=document.getElementById('startBtn')||document.getElementById('goBtn'); if(b) b.click() }); await Q.waitForTimeout(700);
     const r=await Q.evaluate(()=>{ const d=document.querySelector('.drill b'); if(!d) return null; const call=d.textContent.replace(/[“”]/g,'').trim();
       const hdr=[...document.querySelectorAll('#grid .gh')].find(h=>/3RD SHORT/.test(h.textContent)); if(!hdr) return {call}; const hr=hdr.getBoundingClientRect();
       const lab=b=>[...b.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
       const inSit=[...document.querySelectorAll('#grid .gc button')].filter(b=>{ const x=b.getBoundingClientRect(); return x.left>=hr.left-1 && x.right<=hr.right+1 });
       const elsewhere=[...document.querySelectorAll('#grid .gc button')].filter(b=>inSit.indexOf(b)<0);
       const t=inSit.find(b=>call!==lab(b) && call.endsWith(' '+lab(b)) && elsewhere.some(e=>lab(e)===lab(b)));
       if(!t) return {call}; t.click(); return {call, tapped:lab(t)} });
     if (r && r.tapped) { await Q.waitForTimeout(400); const st=await Q.evaluate(()=>{ const d=document.querySelector('.drill'); return d?d.textContent:'' });
       console.log('  heard',r.call,'tapped',r.tapped,'in 3RD SHORT');
       ok(!/Find it on the sheet/.test(st) && !/Listen again/.test(await Q.evaluate(()=>document.body.innerText)),'the situation-box copy of the call is accepted'); done=true }
     await Q.context().close();
   }
   ok(done,'found a duplicate call to test within 40 games');
 }
 ok(P.errs.length===0,'no page errors '+P.errs.join('|'));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
