// Mock game: their full Hudl games uploaded per opponent, and every mock game saved (signed-in coaches and shared-link players)
// Run: node tests/ui/mg.js   (screenshots go to $SHOT_DIR, default a temp folder)
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const ROOT='/home/claude/booth-chart', OUT=(process.env.SHOT_DIR || path.join(os.tmpdir(),'booth-shots')+'/'); fs.mkdirSync(OUT,{recursive:true});
const TMP=path.join(os.tmpdir(),'mg-files'); fs.mkdirSync(TMP,{recursive:true});
const SEASON='season-aaaaaaaaaaaaaaaa', D='2026-11-20';
const H=["PLAY #","ODK","QTR","SERIES","DN","DIST","YARD LN","HASH","PLAY TYPE","RESULT","GN/LS","O FORMATION","FRONT","COVERAGE","BLITZ","MFC/MFO/0","TEAM"];
const FRONTS=['41 OVER','HEADS','41 UNDER'], COVS=['2','3','3 CLOUD'];
const game=(n,seed)=>Array.from({length:n},(_,i)=>{ const d=i%3!==2; return [i+1,d?'D':'O',1+i%4,1+(i>>3),1+i%3,10-(i%3)*3,-30+(i%40),'M',i%2?'Run':'Pass',i%2?'Rush':'Complete',(i*5+seed)%11-2,'GOLD',d?FRONTS[(i+seed)%3]:'',d?COVS[(i+seed)%3]:'',d&&i%5===0?'SAM':'',d?(i%2?'MFC':'MFO'):'','DESOTO'] });
const csvOf=rows=>[H.join(',')].concat(rows.map(r=>r.join(','))).join('\n');
const F1=path.join(TMP,'DeSoto vs Duncanville.csv'), F2=path.join(TMP,'DeSoto vs Cedar Hill.csv');
fs.writeFileSync(F1,csvOf(game(150,1))); fs.writeFileSync(F2,csvOf(game(120,2)));
const SHEET={boxes:[{name:"GOLD",kind:"form",form:"GOLD",plays:[{t:"SPLIT ZONE",k:"run"},{t:"STICK",k:"pass"},{t:"SMACK",k:"run"}]},{name:"3RD SHORT",kind:"sit",key:"3S",plays:[{t:"CRAB",k:"run"}]}],name:"Test sheet"};
const R=start({admins:{},members:{u1:'melissa'},schools:{melissa:{season:SEASON,profile:{name:'Melissa'},schedule:[{date:D,opp:'DeSoto',ha:'N',venue:'Mesquite Memorial Stadium'}], weeks:{[D]:{callsheet:{sheet:[{name:'GOLD',kind:'form',form:'GOLD',plays:[{t:'SPLIT ZONE'},{t:'STICK'},{t:'SMACK'}]},{name:'3RD SHORT',kind:'sit',key:'3S',plays:[{t:'CRAB'}]}],grid:null,at:2}}},
  games:{[SEASON]:{list:{}}}, mock:{weeks:{[D]:{opp:'DeSoto',plays:40,n:1,f:{0:{name:'DeSoto film',data:JSON.stringify({header:H,rows:game(40,9)})}}}}}}}},9130);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8770);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const wait=async(fn,ms=10000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await fn()) return true; await new Promise(r=>setTimeout(r,250)) } return false };
const errs=[];
async function page(b,signedIn,url){ const ctx=await b.newContext({viewport:{width:1366,height:1024}}); await ctx.route(/googleapis\.com|gstatic|fonts\.|cdnjs/, r=>r.fulfill({status:200,body:''}));
  await ctx.addInitScript(([si,SHEET])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9130',apiKey:'x'}; localStorage.setItem('sol-mock-sheet',JSON.stringify(SHEET));
    if(si) localStorage.setItem('solutions-auth-v1', JSON.stringify({uid:'u1',email:'chris@melissa.test',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}})) },[signedIn,SHEET]);
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept()); await p.goto(url); await p.waitForTimeout(1500); return p }
async function play(p,n){ for(let i=0;i<n*8 && await p.evaluate(()=>__mock.G.snaps.length)<n;i++){
  await p.evaluate(()=>{ const G=__mock.G; if(G.over) return; if(G.wait && G.ourBall){ G.ourBall(); return } if(G.fourth){ const b=[...document.querySelectorAll('#res button, .fourth button, button')].find(x=>x.offsetParent&&/go for it|punt/i.test(x.textContent)); if(b){ b.click(); return } }
    const g=[...document.querySelectorAll('#grid .gc button:enabled')][0]; if(g) g.click(); const s=document.getElementById('snapBtn'); if(s && s.offsetParent) s.click() });
  await p.waitForTimeout(900) } return p.evaluate(()=>__mock.G.snaps.length) }
(async()=>{
 const b=await chromium.launch();
 console.log('1. Their full games, uploaded to the opponent');
 let P=await page(b,true,'http://localhost:8770/mock.html');
 await P.evaluate(()=>{ const x=[...document.querySelectorAll('#schedBtns button')].find(b=>/DeSoto/.test(b.textContent)); x.click() });
 ok(await wait(()=>P.isVisible('#oppUp')),'picking DeSoto shows "Add their games (Hudl)"');
 ok(/DeSoto film.*40 plays.*sent from Reports/.test(await P.textContent('#oppFiles')),'the game sent from Reports is listed');
 await P.setInputFiles('#fOpp',[F1,F2]);
 ok(await wait(()=>{ const a=((R.db.schools.melissa.mock||{}).added||{})[D]; return a && Object.keys(a).length===2 }),'both games are saved to DeSoto\'s week');
 const fl=await P.textContent('#oppFiles'); ok(/Duncanville.*150 plays · 100 defensive snaps/.test(fl) && /Cedar Hill.*120 plays · 80 defensive snaps/.test(fl),'each game is listed with its plays and defensive snaps');
 ok(/^3 file\(s\)/.test(await P.textContent('#nThem')) && +(await P.textContent('#nThem')).match(/(\d+) defensive/)[1]>150,'the mock game now uses all 3 games: '+await P.textContent('#nThem'));
 await P.setInputFiles('#fOpp',[F1]); await P.waitForTimeout(800);
 ok(Object.keys(R.db.schools.melissa.mock.added[D]).length===2 && /already here/i.test(await P.textContent('#toast')),'uploading the same game again is skipped');
 await P.evaluate(()=>{ const b=[...document.querySelectorAll('#oppFiles [data-rmf]')].find(x=>/Cedar Hill/.test(x.closest('.row').textContent)); b.click() });
 ok(await wait(()=>Object.keys(R.db.schools.melissa.mock.added[D]).length===1),'Remove takes a game out');
 R.db.schools.melissa.mock.weeks[D]={opp:'DeSoto',plays:40,n:1,f:{0:{name:'DeSoto film',data:JSON.stringify({header:H,rows:game(40,9)})}}}; // Reports sending again doesn't wipe uploads
 await P.reload(); await P.waitForTimeout(1200); await P.evaluate(()=>{ [...document.querySelectorAll('#schedBtns button')].find(b=>/DeSoto/.test(b.textContent)).click() });
 ok(await wait(async()=>/Duncanville/.test(await P.textContent('#oppFiles')) && !/Cedar Hill/.test(await P.textContent('#oppFiles'))),'after a reload (and Reports sending again) the uploaded game is still there');
 await P.evaluate(()=>document.getElementById('oppUp').scrollIntoView()); await P.screenshot({path:OUT+'mock_their_games.png'});

 console.log('2. Every mock game saves, even one left early');
 await P.evaluate(()=>__mock.startGame()); console.log('   start:',await P.textContent('#toast')); const n1=await play(P,4); console.log('   played',n1);
 ok(await wait(()=>{ const g=R.db.schools.melissa.mock.games; return g && Object.values(g).some(x=>x.plays>=3 && x.done===false && x.who==='chris') }),'after a few plays the game is already saved (stopped early, played by chris)');
 const before=Object.keys(R.db.schools.melissa.mock.games).length;
 await play(P,7); await P.waitForTimeout(1500);
 ok(Object.keys(R.db.schools.melissa.mock.games).length===before,'the same game updates, it is not saved again as a new one');
 await P.evaluate(()=>document.getElementById('endBtn').click());
 ok(await wait(()=>Object.values(R.db.schools.melissa.mock.games).some(x=>x.done===true && x.plays>=7)),'ending it marks it finished');
 await P.evaluate(()=>{ __mock.newGame() }); await play(P,3);
 await P.close(); // leaving the page mid-game
 ok(await wait(()=>Object.keys(R.db.schools.melissa.mock.games).length===2),'a second game, left without ending it, is saved too');

 console.log('3. A shared link player\'s games save to the school');
 P=await page(b,true,'http://localhost:8770/mock.html'); await P.waitForTimeout(500);
 const realSheet=await P.evaluate(()=>JSON.parse(localStorage.getItem('sol-mock-sheet')));
 R.db.share={tok12345678abcdefgh:{by:'u1',at:1,items:JSON.stringify({sheet:realSheet,ours:[],them:[],us:'Melissa',opp:'DeSoto'})}}; // an older link with no school in it
 await P.evaluate(()=>{ localStorage.setItem('sol-mock-share',JSON.stringify('tok12345678abcdefgh')) }); await P.reload(); 
 ok(await wait(()=>JSON.parse(R.db.share.tok12345678abcdefgh.items).s==='melissa'),'opening the mock game adds the school to an older share link');
 const S=await page(b,false,'http://localhost:8770/mock.html?share=tok12345678abcdefgh'); await S.waitForTimeout(800);
 ok(await S.isVisible('#whoRow') && !await S.isVisible('#allBox'),'a shared-link player is asked for a name and does not see the school\'s list');
 await S.evaluate(()=>__mock.startGame()); ok(await S.evaluate(()=>!document.getElementById('setup').hidden),'Start needs a name first');
 await S.fill('#whoName','Coach Scoggin'); await S.evaluate(()=>__mock.startGame()); console.log('   shared start:',await S.textContent('#toast')); await play(S,4);
 ok(await wait(()=>{ const m=(R.db.mockplays||{}).melissa; return m && Object.values(m).some(x=>x.who==='Coach Scoggin' && x.plays>=4 && x.k && x.link==='tok12345678abcdefgh') }),'their game saves to the school with their name');
 await S.evaluate(()=>document.getElementById('endBtn').click());
 ok(await wait(()=>Object.values(R.db.mockplays.melissa).some(x=>x.done===true)),'and is marked finished when they end it');

 console.log('4. The coach sees every game');
 await P.reload(); await P.waitForTimeout(1500); await P.evaluate(()=>{ document.getElementById('allBox').open=true });
 ok(await wait(async()=>/\(3\)/.test(await P.textContent('#allCount'))),'Every mock game played: 3 '+await P.textContent('#allCount'));
 const al=await P.textContent('#allList'); ok(/Coach Scoggin \(shared link\)/.test(al) && /chris/.test(al) && /stopped early/.test(al) && /DeSoto/.test(al),'it shows who played, the opponent, and games stopped early');
 await P.evaluate(()=>{ [...document.querySelectorAll('#schedBtns button')].find(b=>/DeSoto/.test(b.textContent)).click(); document.getElementById('mgBox').open=true });
 ok(await wait(async()=>/\(3\)/.test(await P.textContent('#mgCount'))),'and all 3 count in the DeSoto mock folder');
 await P.evaluate(()=>document.getElementById('allBox').scrollIntoView()); await P.screenshot({path:OUT+'mock_every_game.png'});
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed'); await b.close(); process.exit(fail?1:0);
})().catch(e=>{ console.error(e.message.split('\n')[0], errs); process.exit(1) });
