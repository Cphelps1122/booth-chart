// tiny Realtime Database REST + streaming mock for tests
const http=require('http');
function prune(v){ if(v===null||v===undefined) return null; if(typeof v!=='object') return v; const isA=Array.isArray(v); let o=isA?[]:{}; let n=0; for(const k of Object.keys(v)){ const x=prune(v[k]); if(x!==null){ isA?o[k]=x:o[k]=x; n++ } } if(isA){ o=o.some(x=>x===undefined)?Object.fromEntries(Object.entries(o)):o } return n?o:null }
function start(seed, port){
  const db=JSON.parse(JSON.stringify(seed)); const subs=[];
  const parts=p=>decodeURIComponent(p).replace(/\.json$/,'').split('/').filter(Boolean);
  const getAt=ps=>{let o=db; for(const k of ps){ if(o==null||typeof o!=='object') return null; o=o[k] } return o===undefined?null:o};
  const setAt=(ps,v)=>{ let o=db; for(let i=0;i<ps.length-1;i++){ if(o[ps[i]]==null||typeof o[ps[i]]!=='object') o[ps[i]]={}; o=o[ps[i]] } if(v===null) delete o[ps[ps.length-1]]; else o[ps[ps.length-1]]=v };
  const notify=(ws)=>{ subs.forEach(s=>{ const L=s.ps; let path, data;
      if (ws.length>=L.length && L.every((k,i)=>ws[i]===k)) { path='/'+ws.slice(L.length).join('/'); data=getAt(ws) }
      else if (L.length>ws.length && ws.every((k,i)=>L[i]===k)) { path='/'; data=getAt(L) } else return;
      s.res.write('event: put\ndata: '+JSON.stringify({path,data})+'\n\n') }) };
  const srv=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://x'), ps=parts(u.pathname);
    res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,PUT,PATCH,DELETE,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if (req.method==='OPTIONS') return res.end();
    if (req.method==='GET' && (req.headers.accept||'').includes('text/event-stream')) { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'}); res.write('event: put\ndata: '+JSON.stringify({path:'/',data:getAt(ps)})+'\n\n'); const s={ps,res}; subs.push(s); req.on('close',()=>subs.splice(subs.indexOf(s),1)); return }
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      let v=null; try{ v=body?JSON.parse(body):null }catch(e){}
      if (req.method==='GET'){ let x=getAt(ps); if(u.searchParams.get('shallow')==='true'&&x&&typeof x==='object'){const o={};Object.keys(x).forEach(k=>o[k]=true);x=o} res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify(x)) }
      v=prune(v); if (req.method==='PUT') setAt(ps,v);
      if (req.method==='PATCH'){ const cur=getAt(ps)||{}; Object.keys(v||{}).forEach(k=>{ if(v[k]===null) delete cur[k]; else cur[k]=v[k] }); setAt(ps,cur) }
      if (req.method==='DELETE') setAt(ps,null);
      if (req.method==='POST'){ const id='p'+Date.now(); setAt(ps.concat(id),v) }
      notify(ps); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(v));
    });
  }); srv.listen(port); return {db,srv,getAt:p=>getAt(parts(p))};
}
module.exports={start};
