// Home screen: every coach page can be reached from the home screen, on an iPad and a phone
// Run: node tests/ui/hm.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || require('path').join(require('os').tmpdir(),'booth-shots')+'/'), SEASON='season-aaaaaaaaaaaaaaaa', d='2026-11-06';
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:d,opp:'Anna',ha:'H'}],games:{[SEASON]:{list:{}}}}}},9127);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8767);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
// every page a coach uses; the player quiz, shared reels, pricing and the public site are not coach pages
const PAGES=['defense.html','reports.html','scout.html','stats.html','impact.html','mock.html','track.html','quizzes.html'];
(async()=>{
 const b=await chromium.launch();
 for (const [name,vp] of [['ipad',{width:1024,height:1366}],['phone',{width:390,height:844}]]) {
  console.log(name);
  const ctx=await b.newContext({viewport:vp,deviceScaleFactor:2}); await ctx.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
  await p.addInitScript(([SEASON])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9127',apiKey:'x'};
    localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
    localStorage.setItem('cardinals-booth-season-v1', SEASON) },[SEASON]);
  await p.goto('http://localhost:8767/app.html'); await p.waitForTimeout(2500);
  const strip=await p.evaluate(()=>{ const n=document.getElementById('homeAll'); if(!n) return null; const r=n.getBoundingClientRect();
    return { vis: r.width>0 && r.height>0, links:[...n.querySelectorAll('a')].filter(a=>!a.hidden).map(a=>a.getAttribute('href')), chart: !!n.querySelector('[data-role=chart]'), adm: !document.getElementById('allAdm').hidden, wide: n.scrollWidth<=document.documentElement.clientWidth+1 } });
  ok(strip && strip.vis,'the All pages strip shows on the home screen without opening anything');
  ok(strip && PAGES.every(x=>strip.links.includes(x)),'it links every coach page: '+(strip?strip.links.join(' '):''));
  ok(strip && strip.chart,'and has a Chart button'); ok(strip && !strip.adm,'Admin stays hidden for a coach'); ok(strip && strip.wide,'it wraps instead of running off the screen');
  const doors=await p.evaluate(()=>[...document.querySelectorAll('.h-door a')].map(a=>a.getAttribute('href').split('#')[0]));
  ok(['mock.html','quizzes.html','track.html'].every(x=>doors.includes(x)),'Mock game, Player quizzes and Tracking are in the home sections too');
  await p.evaluate(()=>document.getElementById('homeAll').scrollIntoView({block:'center'})); await p.waitForTimeout(300); await p.screenshot({path:OUT+'home_'+name+'.png'});
  for (const x of PAGES) { const r=await p.request.get('http://localhost:8767/'+x); ok(r.ok(),x+' opens'); }
  await p.click('#homeAll [data-role=chart]'); await p.waitForTimeout(800);
  ok(await p.evaluate(()=>{ const v=document.getElementById('v-chart'); return !!v && v.offsetParent!==null }),'Chart opens the chart');
  await p.evaluate(()=>{ document.getElementById('tmThem').textContent='McKinney North'; document.getElementById('wpDelta').textContent='+12 last play' }); await p.waitForTimeout(200);
  const sb=await p.evaluate(()=>{ const w=document.documentElement.clientWidth; return [...document.querySelectorAll('.hrow.gamebar .board .sb')].map(e=>{ const r=e.getBoundingClientRect(); return {vis:r.width>0, right:r.right, left:r.left, w} }) });
  ok(sb.length===4 && sb.every(s=>s.vis && s.left>=0 && s.right<=s.w+1),'scoreboard: all four boxes fit on the screen '+JSON.stringify(sb.map(s=>Math.round(s.right))));
  await p.evaluate(()=>{ window.scrollTo(0,0); document.querySelectorAll('.nc,#nextCall,[id^=nc]').forEach(e=>e.style.visibility='hidden') }); await p.waitForTimeout(200); const hb=await p.locator('header').boundingBox(); await p.screenshot({path:OUT+'scoreboard_'+name+'.png',clip:{x:0,y:0,width:vp.width,height:Math.min(320,(hb?hb.height:220))}});
  ok(p.errs.length===0,'no page errors '+p.errs.join(' | '));
  await ctx.close();
 }
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
