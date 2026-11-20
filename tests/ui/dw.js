// Mock game: this week's run and pass drawings (PDF, and PowerPoint as from Google Slides) become plays that run the way they're drawn,
// with the defense lined up where it's drawn. Fixtures: tests/ui/fixtures/make_drawings.py
// Run: node tests/ui/dw.js
const {chromium}=require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), FX=ROOT+'/tests/ui/fixtures/';
fs.mkdirSync(OUT,{recursive:true});
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8768);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
// a call sheet with both plays on it, and GOLD MESH a second time in a situation box
const SHEET={name:'Week sheet',boxes:[{name:'OPENERS',kind:'sit',key:'1',plays:[{t:'GOLD MESH',c:'pass'},{t:'SPLIT ZONE',c:'run'}]},{name:'3RD LONG',kind:'sit',key:'3L7',plays:[{t:'GOLD MESH',c:'pass'}]}],
  grid:{rows:3,cols:2,cells:[{r:0,c:0,rs:1,cs:1,v:'OPENERS',h:1,f:'1F3864'},{r:1,c:0,rs:1,cs:1,v:'GOLD MESH',k:'pass',b:0},{r:2,c:0,rs:1,cs:1,v:'SPLIT ZONE',k:'run',b:0},{r:0,c:1,rs:1,cs:1,v:'3RD LONG',h:1,f:'8C1F2F'},{r:1,c:1,rs:1,cs:1,v:'GOLD MESH',k:'pass',b:1}]}};
(async()=>{
 const b=await chromium.launch();
 const mk=async(vp)=>{ const ctx=await b.newContext({viewport:vp||{width:1366,height:1024},deviceScaleFactor:1}); await ctx.route(/googleapis\.com|gstatic|firebaseio|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
   await p.addInitScript(([sheet])=>{ window.SOL_TEST=1; if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem('sol-mock-sheet',JSON.stringify(sheet)) } },[SHEET]);
   await p.goto('http://localhost:8768/mock.html'); await p.waitForTimeout(1200); return p };
 for (const fn of ['drawings.pptx','drawings.pdf']) {
  console.log(fn);
  const p=await mk();
  ok(await p.isVisible('#dDraw'),'the upload box is on the setup screen');
  await p.setInputFiles('#fDraw', FX+fn); await p.waitForSelector('#drBox:not([hidden])',{timeout:15000}).catch(()=>{});
  const cards=await p.evaluate(()=>[...document.querySelectorAll('#drList .drcard')].map(c=>({call:c.querySelector('input[type=text]').value, st:c.querySelector('.drst').textContent, issues:[...c.querySelectorAll('li')].map(l=>l.textContent), use:c.querySelector('.druse').checked, run:c.querySelector('input[value=run]').checked, cv:!!c.querySelector('canvas')})));
  console.log('   ',JSON.stringify(cards));
  ok(cards.length===2,'one play per page / slide');
  ok(cards[0] && cards[0].call==='GOLD MESH' && /On your call sheet/.test(cards[0].st) && !cards[0].run,'page 1 is GOLD MESH, matched to the call sheet, a pass');
  ok(cards[1] && cards[1].call==='SPLIT ZONE' && /On your call sheet/.test(cards[1].st) && cards[1].run,'page 2 is SPLIT ZONE, a run');
  ok(cards.every(c=>c.use && c.cv && !c.issues.length),'both read cleanly, with a picture to check');
  if (fn.endsWith('pptx')) await p.locator('#drBox').screenshot({path:OUT+'drawings_review.png'});
  // drag the Mike in the GOLD MESH preview 3 yards deeper
  const cv=p.locator('#drList .drcard canvas').first(), bb=await cv.boundingBox(), sx=bb.width/520, u=520/54;
  const mx=bb.x+(260+0*u)*sx, my=bb.y+(380*0.62-5*u)*sx; await p.mouse.move(mx,my); await p.mouse.down(); await p.mouse.move(mx,my-3*u*sx,{steps:5}); await p.mouse.up();
  await p.click('#drSave'); await p.waitForTimeout(400);
  const PB=await p.evaluate(()=>__mock.PB), D=PB&&PB.drawn||{}; console.log('    saved as',Object.keys(D).join(', '));
  ok(Object.keys(D).length===2 && D['GOLD MESH'] && D['SPLIT ZONE'],'both saved to the playbook '+Object.keys(D).join(', '));
  const M=(D['GOLD MESH']||{d:[]}).d.find(q=>q.lab==='M');
  ok(M && Math.abs(M.y-8)<0.6,'dragging a defender in the check picture moves him (Mike at '+(M&&M.y)+' yds)');
  ok(JSON.parse(await p.evaluate(()=>localStorage.getItem('sol-mock-playbook'))).drawn,'kept on this device');
  // call it in a game: players, routes and the defense come from the drawing
  await p.evaluate(()=>__mock.startGame()); await p.waitForTimeout(600);
  const r=await p.evaluate(()=>{ const L=__mock.allPlays(), out=[]; L.forEach(c=>{ __mock.tapPlay(c); const P=__mock.P, BP=__mock.bookPaths(c), bx=P.o[2].x;
      out.push({name:c.name, src:BP&&BP.src, o:P.o.map(q=>[Math.round((q.x-bx)*10)/10, q.y]), d:P.d.map(q=>[q.lab, Math.round((q.x-bx)*10)/10, q.y]), wr:BP&&BP.paths[6]&&BP.paths[6].map(q=>[Math.round((q[0]-bx)*10)/10, Math.round(q[1]*10)/10]), rb:BP&&BP.paths[10]&&BP.paths[10].map(q=>[Math.round((q[0]-bx)*10)/10, Math.round(q[1]*10)/10])}); __mock.tapPlay(c) }); return out });
  const gm=r.find(x=>x.name==='GOLD MESH'), gm2=r.filter(x=>x.name==='GOLD MESH')[1], sz=r.find(x=>x.name==='SPLIT ZONE');
  console.log('    GOLD MESH', JSON.stringify(gm&&{src:gm.src,o:gm.o,wr:gm.wr}));
  ok(gm && /drawing/.test(gm.src),'GOLD MESH runs from the drawing ('+(gm&&gm.src)+')');
  ok(gm && JSON.stringify(gm.o[9])===JSON.stringify([18,-1]) && JSON.stringify(gm.o[10])===JSON.stringify([0,-7]),'players line up where they are drawn');
  ok(gm && gm.wr && gm.wr[gm.wr.length-1][1]>16,'the #1 runs the go route that is drawn');
  const cs=gm? gm.d.filter(q=>Math.abs(Math.abs(q[1])-18)<0.6 && Math.abs(q[2]-7)<0.6).length:0, mk2=gm? gm.d.find(q=>q[0]==='M'):null;
  ok(cs===2 && mk2 && Math.abs(mk2[2]-8)<0.6,'the defense lines up where it is drawn (both corners, the Mike where I dragged him)');
  ok(gm2 && /drawing/.test(gm2.src),'the second GOLD MESH on the sheet (3rd long box) uses the same drawing');
  ok(sz && /drawing/.test(sz.src) && sz.rb && sz.rb[sz.rb.length-1][1]>-1.5,'SPLIT ZONE: the back runs the drawn track');
  await p.evaluate(()=>{ const c=__mock.allPlays()[0]; __mock.tapPlay(c) }); await p.waitForTimeout(500);
  if (fn.endsWith('pptx')) await p.screenshot({path:OUT+'drawings_field.png'});
  ok(p.errs.length===0,'no page errors '+p.errs.join(' | '));
  await p.context().close();
 }
 console.log('a picture that is not drawn with shapes');
 { const p=await mk(); const bad=FX+'../fixtures/../../../media'; const f=OUT+'not_a_play.pdf'; fs.writeFileSync(f,'%PDF-1.4 broken');
   await p.setInputFiles('#fDraw', f); await p.waitForTimeout(2500);
   const t=await p.evaluate(()=>document.getElementById('drList').innerText); ok(/Couldn't open this file/.test(t),'a file it can\'t read says so instead of saving nonsense');
   ok(p.errs.length===0,'no page errors '+p.errs.join(' | ')); await p.context().close() }

 console.log('a plays file (.json) made from drawings that are pictures');
 { const p=await mk(); const f=OUT+'plays.json';
   fs.writeFileSync(f, JSON.stringify({solDrawn:1,plays:[{name:'GOLD MESH',page:3,run:false,o:[{x:-4.2,y:-.9},{x:-2.1,y:-.9},{x:0,y:-.9},{x:2.1,y:-.9},{x:4.2,y:-.9},{x:0,y:-4.5},{x:-18,y:-1},{x:-9,y:-1.5},{x:6.3,y:-1},{x:18,y:-1},{x:0,y:-7}],p:[null,null,null,null,null,null,[[0,0],[0,18]],null,null,null,null],d:[]}]}));
   await p.setInputFiles('#fDraw', f); await p.waitForSelector('#drBox:not([hidden])',{timeout:8000}).catch(()=>{});
   const c=await p.evaluate(()=>[...document.querySelectorAll('#drList .drcard')].map(c=>({call:c.querySelector('input[type=text]').value, st:c.querySelector('.drst').textContent, use:c.querySelector('.druse').checked})));
   ok(c.length===1 && c[0].call==='GOLD MESH' && /On your call sheet/.test(c[0].st) && c[0].use,'it goes through the same check screen');
   await p.click('#drSave'); await p.waitForTimeout(300); const D=await p.evaluate(()=>__mock.PB&&__mock.PB.drawn||{});
   ok(D['GOLD MESH'] && D['GOLD MESH'].p[6][1][1]===18,'and saves like a drawing');
   fs.writeFileSync(f,'{"nope":1}'); await p.setInputFiles('#fDraw', f); await p.waitForTimeout(800);
   ok(/isn't a plays file/.test(await p.evaluate(()=>document.getElementById('drList').innerText)),'any other .json says so');
   ok(p.errs.length===0,'no page errors '+p.errs.join(' | ')); await p.context().close() }
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
