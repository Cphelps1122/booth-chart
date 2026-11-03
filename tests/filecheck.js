// File check tests:  node tests/filecheck.js
require('../scoutkit.js'); let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
const H=['PLAY #','ODK','DN','DIST','PLAY TYPE','RESULT','GN/LS','FRONT','COVERAGE','BLITZ','MFC/MFO/0','TEAM'];
const rows=n=>Array.from({length:n},(_,i)=>[(i%(n/2))+1,'D',1+(i%3),10,i%2?'Run':'Pass',i%2?'Rush':'Complete',4,'4-3','C3','None','MFC',i<n/2?'Anna':'Lovejoy']);
const chk=(h,r,w)=>SK.check(SK.load([{name:'t',header:h,rows:r}]),{want:w});
ok(chk(H,rows(60),'D').lvl==='ok','clean defense file passes');
ok(chk(H.filter(x=>x!=='DN'),rows(60).map(r=>r.filter((_,i)=>i!==2)),'D').lvl==='stop','no DN column stops');
ok(chk(H,rows(60).map(r=>(r[1]='O',r)),'D').lvl==='stop','offense-only file stops a defense report');
ok(chk(H,rows(60).map((r,i)=>(i<18&&(r[4]='',r[5]=''),r)),'D').lvl==='stop','30% plays with no run/pass stops');
ok(/blank PLAY TYPE/.test(JSON.stringify(chk(H,rows(60).map((r,i)=>(i<10&&(r[4]=''),r)),'D').items)),'blank play type warns');
ok(/Odd values/.test(JSON.stringify(chk(H,rows(60).map((r,i)=>(i===3&&(r[2]=7),r)),'D').items)),'5th+ down flagged');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
