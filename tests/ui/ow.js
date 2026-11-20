// Mock game: any coach signed in to the school can upload (not only the account that set it up); View-only devices and shared links can't
// Run: node tests/ui/ow.js
const {chromium}=require('playwright'); const {start}=require('/home/claude/booth-chart/tests/rtdb_server.js');
const http=require('http'), fs=require('fs'), path=require('path'); const ROOT='/home/claude/booth-chart';
const R=start({admins:{},members:{u1:'melissa',u2:'melissa'},schools:{melissa:{profile:{name:'Melissa'},mock:{owner:'u1'}}}},9131);
http.createServer((q,r)=>{ const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}
  r.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript'}[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(r) }).listen(8771);
let pass=0, fail=0; const ok=(c,m)=>{ console.log((c?'  PASS ':'  FAIL ')+m); c?pass++:fail++ };
(async()=>{ const b=await chromium.launch();
 const open=async(uid,role)=>{ const ctx=await b.newContext({viewport:{width:1024,height:1366}}); await ctx.route(/googleapis\.com|gstatic|fonts\./, r=>r.fulfill({status:200,body:'{}'}));
   const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
   await p.addInitScript(([uid,role])=>{ window.SOL_TEST=1; window.SOL_CONFIG={db:'http://localhost:9131',apiKey:'x'};
     if(uid) localStorage.setItem('solutions-auth-v1', JSON.stringify({uid,email:'x@x',idToken:'t',refreshToken:'r',exp:Date.now()+3600e3,school:'melissa',profile:{name:'Melissa'}}));
     const d=new Date(), t=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); if(role) localStorage.setItem('solutions-role',JSON.stringify({r:role,d:t})) },[uid,role]);
   await p.goto('http://localhost:8771/mock.html'); await p.waitForTimeout(2000);
   const v=await p.evaluate(()=>({sheet:!document.getElementById('dSheet').hidden, draw:!document.getElementById('dDraw').hidden, book:!document.getElementById('dBook').hidden, note:document.getElementById('lockNote').hidden?'':document.getElementById('lockNote').textContent}));
   await ctx.close(); return v };
 let v=await open('u1'); ok(v.sheet&&v.draw&&v.book,'the coach who set it up can upload');
 v=await open('u2'); ok(v.sheet&&v.draw&&v.book&&!v.note,'another coach at the same school can upload too (call sheet, drawings, playbook)');
 v=await open('u2','view'); ok(!v.sheet&&!v.draw&&/View only/.test(v.note),'a device set to View only cannot: '+v.note);
 v=await open('u2','chart'); ok(v.sheet&&v.draw,'a device set to another role can');
 console.log('\n'+pass+' passed, '+fail+' failed'); process.exit(fail?1:0) })();
