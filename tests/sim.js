// Game Preview sim: what it learns from finished games moves the forecast the right way.
// Run: node tests/sim.js
const fs=require('fs'), path=require('path'), vm=require('vm');
const ctx={window:{}, Math, Date}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname,'..','sim.js'),'utf8'), ctx);
const S=ctx.window.SolSim;
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
// their film and our charted snaps: plain, so the learned numbers are what moves things
const opp=[], ours=[]; let n=0;
for (let i=0;i<240;i++) { const dn=1+i%3, run=i%2===0, y=10+(i*7)%85; opp.push({dn, dist:10, y, run, gain:[2,4,6,9,-1,12,3,5][i%8], shell:i%3?'2-HIGH':'1-HIGH', blitz:i%5?'No':'Yes', res:'', td:false}) }
for (let i=0;i<200;i++) { const dn=1+i%3, run=i%2===0; ours.push({kind:'play', res:'Rush', pt:run?'Run':'Pass', gain:[3,5,7,1,-2,14,4,6][i%8], call:run?'2 POWER':'MESH', dn, dist:10, yl:'O'+(20+(i*3)%30), series:Math.floor(i/6), gid:'g'+Math.floor(i/60)}) }
const f=(cal)=>S.forecast(opp, ours, cal, 1500).tend;
const base=f({g:0,n:3});
const pr=(k,a,b2)=>console.log('   ',k, a.toFixed(2),'→',b2.toFixed(2));
let t=f({g:0,n:3,ef:10}); pr('efficient %',base.eff.m,t.eff.m); ok(t.eff.m>base.eff.m+4,'learning "we were more efficient than forecast" raises efficient plays');
t=f({g:0,n:3,ef:-10}); ok(t.eff.m<base.eff.m-4,'and the other way lowers it');
t=f({g:0,n:3,t3:15}); pr('3rd down %',base.third.m,t.third.m); ok(t.third.m>base.third.m+5,'learning a better 3rd-down rate raises 3rd down');
t=f({g:0,n:3,ex:0.04}); pr('explosives',base.expl.m,t.expl.m); ok(t.expl.m>base.expl.m+1,'learning more explosives raises explosive plays');
t=f({g:0,n:3,ex:-0.04}); ok(t.expl.m<base.expl.m-1,'and fewer lowers them');
t=f({g:0,n:3,to:0.03}); pr('turnovers',base.to.m,t.to.m); ok(t.to.m>base.to.m+0.5,'learning more turnovers raises turnovers');
t=f({g:1.5,n:3}); ok(t.ypp.m>base.ypp.m+0.8,'yards a play still learns the way it did');
t=f({g:0,n:3,ef:999,t3:-999,ex:5,to:-5}); ok(isFinite(t.pts.m) && t.eff.m<=100 && t.to.m>=0,'wild numbers are capped, nothing breaks');
t=f(null); ok(Math.abs(t.pts.m-f({g:0,n:0}).pts.m)<1e-9,'nothing learned yet: same forecast as before');
// red zone: a defense that stiffens inside the 20 costs us points
const tough=opp.map(o=>o.y>=80?Object.assign({},o,{gain:o.gain-4}):o), soft=opp.map(o=>o.y>=80?Object.assign({},o,{gain:o.gain+4}):o);
const pt=S.forecast(tough,ours,{g:0,n:0},1500).tend.pts.m, ps=S.forecast(soft,ours,{g:0,n:0},1500).tend.pts.m; console.log('    red zone tough',pt.toFixed(1),'soft',ps.toFixed(1));
ok(ps>pt,'their red-zone defense counts: a softer red zone means more points');
console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
