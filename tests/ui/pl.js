// Matchup Predictor: learning from past games, and the why-panel on Game Impact
// Run: node tests/ui/pl.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), SEASON='season-aaaaaaaaaaaaaaaa';
// a season of scores: Melissa and Anna share opponents so both get ratings
const teams=['Melissa','Anna','Prosper','Celina','Lovejoy','Royse City'];
const mk=(a,b,sa,sb,d)=>({opp:b,us:sa,them:sb,date:d,ha:'H'});
const sched=(team,rows)=>({name:team,games:rows});
const S={
  Melissa: sched('Melissa',[mk(0,'Prosper',35,14,'2026-09-04'),mk(0,'Celina',28,21,'2026-09-11'),mk(0,'Lovejoy',42,7,'2026-09-18'),mk(0,'Royse City',31,17,'2026-09-25'),mk(0,'Anna',24,20,'2026-10-02')]),
  Anna: sched('Anna',[mk(0,'Prosper',21,24,'2026-09-04'),mk(0,'Celina',17,28,'2026-09-11'),mk(0,'Lovejoy',35,14,'2026-09-18'),mk(0,'Royse City',28,10,'2026-09-25'),mk(0,'Melissa',20,24,'2026-10-02')]),
};
const scores={}; Object.keys(S).forEach(k=>{ scores[k]={team:k,name:k,games:S[k].games.map(g=>({opp:g.opp,us:g.us,them:g.them,date:g.date,ha:g.ha}))} });
const weeks={'2026-11-20':{}};
const base=(extra)=>({admins:{},members:{u1:'melissa'},schools:{melissa:Object.assign({season:SEASON,profile:{name:'Melissa'},
  schedule:[{date:'2026-11-20',opp:'Anna',ha:'H'}], scores:scores, weeks:weeks,
  games:{[SEASON]:{list:{}}}},extra)}});
const setCal=(R,v)=>{ R.db.schools.melissa.predCal=v };
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=9000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8766);
(async()=>{
 const b=await chromium.launch();
 const open=async(R,page)=>{ const ctx=await b.newContext({viewport:{width:1280,height:1400},deviceScaleFactor:1});
   await ctx.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
   await p.addInitScript(([SEASON])=>{ window.SOL_CONFIG={db:'http://localhost:9124',apiKey:'x'};
     localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     localStorage.setItem('cardinals-booth-season-v1', SEASON); localStorage.setItem('solutions-morerep','1'); },[SEASON]);
   await p.goto('http://localhost:8766/'+page); await p.waitForTimeout(2500); return p };
 const predNums=async p=>{ await p.evaluate(()=>{ const b=document.querySelector('[data-tpl="pred"]'); if(b) b.click() }); await p.waitForTimeout(2000);
   return p.evaluate(()=>{ const e=[...document.querySelectorAll('.tps')].map(x=>({t:x.querySelector('b').textContent, v:+x.querySelector('em').textContent}));
     const note=[...document.querySelectorAll('.tnote')].map(x=>x.textContent).filter(t=>/Learning from our games|starts correcting itself/.test(t))[0]||'';
     return {e, note} }) };
 console.log('1. No learning yet');
 let R=start(base(),9124);
 let P=await open(R,'reports.html'); let a=await predNums(P); console.log(JSON.stringify(a).slice(0,260));
 await P.screenshot({path:OUT+'pred.png',fullPage:true});
 console.log('tabs:',await P.evaluate(()=>[...document.querySelectorAll('[data-tpl]')].map(x=>x.dataset.tpl).join(',')));
 console.log('out:',(await P.evaluate(()=>{const o=document.getElementById('tplOut');return o?o.textContent:'NO tplOut'})).slice(0,400));
 ok(a.e.length===2 && a.e[0].v>0,'projected score shows: '+a.e.map(x=>x.t+' '+x.v).join(', '));
 ok(/starts correcting itself/.test(a.note),'says it will start correcting once games are graded');
 const base0=a.e;
 console.log('2. With a learned correction');
 setCal(R,{sc:{us:4,them:-2,n:5},at:Date.now()});
 let P2=await open(R,'reports.html'); let a2=await predNums(P2); console.log(JSON.stringify(a2).slice(0,320));
 ok(a2.e[0].v===base0[0].v-4 && a2.e[1].v===base0[1].v+2,'ran 4 high on us and 2 low on them → both corrected: '+base0.map(x=>x.v).join('-')+' → '+a2.e.map(x=>x.v).join('-'));
 ok(/Learning from our games/.test(a2.note) && /4\.0 high on Melissa/.test(a2.note) && /2\.0 low on Anna/.test(a2.note),'the card explains it: '+a2.note.slice(0,150));
 setCal(R,{sc:{us:4,them:-2,n:1},at:Date.now()});
 let P3=await open(R,'reports.html'); let a3=await predNums(P3);
 ok(a3.e[0].v===base0[0].v,'one game is not enough to correct from');

 console.log('3. Game Impact writes what it learned');
 const snaps=(n)=>{ const o={}; for(let i=1;i<=n;i++) o['s'+i]={id:'s'+i,n:i,t:i,qtr:1,dn:1,dist:10,yl:'O30',form:'SLOT DIP',call:'2 POWER',callType:'run',res:'Rush',gain:5,shell:'2-HIGH',box:'6',blitz:'No',series:1}; return o };
 const game=(code,date,opp,pkU,pkT,fu,ft)=>({meta:{opp:opp,gameDate:date,gc:'X',final:{us:fu,them:ft,at:1},preKick:{at:1,sc:{us:pkU,them:pkT}}},snaps:snaps(24)});
 const R2=start(base({games:{[SEASON]:{list:{
     g1:{opp:'Celina',date:'2026-10-09',plays:24,real:1,gc:'X',updated:1,final:1},
     g2:{opp:'Lovejoy',date:'2026-10-16',plays:24,real:1,gc:'X',updated:1,final:1},
     g3:{opp:'Prosper',date:'2026-10-23',plays:24,real:1,gc:'X',updated:1,final:1},
     g4:{opp:'Royse City',date:'2026-10-30',plays:24,real:1,gc:'X',updated:1,final:1},
     g5:{opp:'Anna',date:'2026-11-06',plays:24,real:1,gc:'X',updated:1,final:1}}},
   g1:game('g1','2026-10-09','Celina',35,10,28,14), g2:game('g2','2026-10-16','Lovejoy',31,7,24,10),
   // charted before locking existed: the week's pick, saved the day before kickoff — counts
   g3:{meta:{opp:'Prosper',gameDate:'2026-10-23',gc:'X',final:{us:21,them:17,at:1}},snaps:snaps(24)},
   // same, but the pick was saved the day AFTER the game: hindsight, must be ignored
   g4:{meta:{opp:'Royse City',gameDate:'2026-10-30',gc:'X',final:{us:14,them:28,at:1}},snaps:snaps(24)},
   // a pick saved before picks carried a time: not counted until the coach taps Count it
   g5:{meta:{opp:'Anna',gameDate:'2026-11-06',gc:'X',final:{us:27,them:13,at:1}},snaps:snaps(24)}},
   weeks:Object.assign({},weeks,{'2026-10-23':{pred:{us:30,them:10,wp:80,at:Date.parse('2026-10-22T12:00:00')}},'2026-10-30':{pred:{us:14,them:28,wp:50,at:Date.parse('2026-10-31T12:00:00')}},'2026-11-06':{pred:{us:21,them:19,wp:55}}})}),9125);
 const I=await (async()=>{ const ctx=await b.newContext({viewport:{width:1280,height:1400}});
   await ctx.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
   await p.addInitScript(([SEASON])=>{ window.SOL_CONFIG={db:'http://localhost:9125',apiKey:'x'};
     localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     localStorage.setItem('cardinals-booth-season-v1', SEASON); },[SEASON]);
   await p.goto('http://localhost:8766/impact.html'); await p.waitForTimeout(3500); return p })();
 console.log('loaded:', await I.evaluate(()=>{const n=document.getElementById('loadNote');return n?n.textContent:''}));
 const got=await wait(()=>{ const c=R2.db.schools.melissa.predCal; return c && c.sc && c.sc.n===3 }, 12000);
 const cal=R2.db.schools.melissa.predCal;
 ok(got,'Game Impact saved what it learned: '+JSON.stringify(cal));
 // picked 35-10 and 31-7, finals 28-14 and 24-10 → ran high on us, low on them; held back by games played
 ok(cal && cal.sc.n===3,'counts the two locked games and the one saved before kickoff, not the one saved after: '+JSON.stringify(cal));
 ok(cal && Math.abs(cal.sc.us-(7+7+9)/6)<0.06 && Math.abs(cal.sc.them-(-4-3-7)/6)<0.06,'the numbers are right (ran high on us, low on them, held back by games played)');

 console.log('4. The why-panel');
 await I.evaluate(()=>{ const b=document.querySelector('#gameSeg button[data-g=""]'); if(b) b.click() }); await I.waitForTimeout(1200);
 const why=await I.evaluate(()=>{ const h=[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)); if(!h) return null;
   const sec=h.closest('.panel'); return { head:h.textContent, note:sec.querySelector('.note').textContent, rows:[...sec.querySelectorAll('tbody tr, table tr')].slice(1).map(r=>[...r.children].map(c=>c.textContent.trim()).join(' | ')) } });
 ok(why,'the panel is on Season impact');
 console.log(why && why.head); (why?why.rows:[]).forEach(r=>console.log('   '+r.slice(0,150)));
 ok(why && /3 of 5 games feeding it/.test(why.head),'counts how many games feed it: '+(why&&why.head));
 ok(why && /ran .*high on Melissa/.test(why.note),'says what it learned: '+(why&&why.note.slice(0,120)));
 ok(why && why.rows.length===5 && why.rows.filter(r=>/Not counted/.test(r)).length===2,'every game listed, two marked not counted');
 ok(why && /after kickoff/.test(why.rows.filter(r=>/Not counted/.test(r))[0]),'and it says why: '+(why?why.rows.filter(r=>/Not counted/.test(r))[0].slice(0,140):''));
 await I.evaluate(()=>{ const h=[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)); h.closest('.panel').scrollIntoView() }); await I.waitForTimeout(400); const el=await I.evaluateHandle(()=>[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)).closest('.panel')); await el.asElement().screenshot({path:OUT+'why.png'});

 console.log('5. Count it: the coach confirms an untimed pick');
 const btns=()=>I.evaluate(()=>[...document.querySelectorAll('button[data-pok]')].map(b=>b.closest('tr').children[0].textContent.trim()+' | '+b.textContent));
 let B=await btns(); ok(B.length===1 && /Anna \| Count it/.test(B[0]),'only the untimed pick gets a Count it button (not the one saved after kickoff): '+B.join(' ; '));
 await I.click('button[data-pok]');
 ok(await wait(()=>{ const c=R2.db.schools.melissa.predCal; return c && c.sc && c.sc.n===4 }),'tapping it feeds the game in: '+JSON.stringify(R2.db.schools.melissa.predCal));
 const c4=R2.db.schools.melissa.predCal; ok(c4 && Math.abs(c4.sc.us-(7+7+9-6)/7)<0.06 && Math.abs(c4.sc.them-(-4-3-7+6)/7)<0.06,'and the numbers include it');
 ok(R2.db.schools.melissa.predOk && R2.db.schools.melissa.predOk['2026-11-06'],'the confirmation is saved for every device');
 const row=await I.evaluate(()=>[...document.querySelectorAll('button[data-pok]')].map(b=>b.closest('tr').textContent)[0]||''); const head=await I.evaluate(()=>[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)).textContent);
 ok(/You confirmed/.test(row) && /Stop counting/.test(row) && /4 of 5/.test(head),'the row says so and offers Stop counting: '+head);
 { const el=await I.evaluateHandle(()=>[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)).closest('.panel')); await el.asElement().screenshot({path:OUT+'why-counted.png'}) }
 await I.click('button[data-pok]');
 ok(await wait(()=>{ const c=R2.db.schools.melissa.predCal; return c && c.sc && c.sc.n===3 && !(R2.db.schools.melissa.predOk||{})['2026-11-06'] }),'Stop counting takes it back out');
 await I.click('button[data-pok]'); await wait(()=>R2.db.schools.melissa.predCal.sc.n===4);
 // a view-only account sees the panel but gets no button
 R2.db.schools.melissa.locks={u1:true}; await I.reload(); await I.waitForTimeout(3500);
 await I.evaluate(()=>{ const b=document.querySelector('#gameSeg button[data-g=""]'); if(b) b.click() }); await I.waitForTimeout(800);
 const lk=await I.evaluate(()=>({n:document.querySelectorAll('button[data-pok]').length, t:[...document.querySelectorAll('.panel h2')].find(x=>/Why the predictor learned/.test(x.textContent)).textContent}));
 ok(lk.n===0 && /4 of 5/.test(lk.t),'a view-only account still sees it counted but has nothing to tap');

 I.errs.length && console.log('impact errors:', I.errs.slice(0,3));

 ok(P.errs.length+P2.errs.length+P3.errs.length+I.errs.length===0,'no page errors '+P.errs.concat(P2.errs,P3.errs,I.errs).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
