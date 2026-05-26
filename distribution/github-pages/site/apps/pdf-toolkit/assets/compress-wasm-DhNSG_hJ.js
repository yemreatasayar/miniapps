const p="./ghostscript/",l={web:["-dPDFSETTINGS=/screen"],balanced:["-dPDFSETTINGS=/ebook"],strong:["-dPDFSETTINGS=/screen","-dColorImageResolution=45","-dGrayImageResolution=45","-dMonoImageResolution=72"]},g=["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite"],f=`
var gs = null;
var jobCounter = 0;

self.onmessage = async function (ev) {
  var d = ev.data;

  if (d.op === 'init') {
    try {
      importScripts(d.gsBase + 'gs.js');
      var wasmBinary = await fetch(d.gsBase + 'gs.wasm').then(function(r) { return r.arrayBuffer(); });
      gs = await Module({ wasmBinary: wasmBinary });
      self.postMessage({ op: 'ready' });
    } catch (err) {
      self.postMessage({ op: 'init-error', message: String((err && err.message) || err) });
    }
    return;
  }

  if (d.op === 'run') {
    var id = ++jobCounter;
    var inputPath = '/tmp/gs-in-' + d.id + '.pdf';
    var outputPath = '/tmp/gs-out-' + d.id + '.pdf';
    try {
      gs.FS.writeFile(inputPath, new Uint8Array(d.input));
      gs.callMain(d.args.concat(['-sOutputFile=' + outputPath, inputPath]));
      var result = gs.FS.readFile(outputPath);
      try { gs.FS.unlink(inputPath); } catch (_) {}
      try { gs.FS.unlink(outputPath); } catch (_) {}
      self.postMessage({ op: 'result', id: d.id, output: result.buffer }, [result.buffer]);
    } catch (err) {
      try { gs.FS.unlink(inputPath); } catch (_) {}
      try { gs.FS.unlink(outputPath); } catch (_) {}
      self.postMessage({ op: 'error', id: d.id, message: String((err && err.message) || err) });
    }
  }
};
`;let i=null,u=null;const c=new Map;let m=0;function b(){if(u)return u;const t=new URL(p,window.location.href).href,e=new Blob([f],{type:"text/javascript"}),r=URL.createObjectURL(e);return i=new Worker(r),URL.revokeObjectURL(r),u=new Promise((s,a)=>{i.onmessage=o=>{const n=o.data;if(n.op==="ready"){s(),i.onmessage=h;return}if(n.op==="init-error"){a(new Error(n.message??"Ghostscript WASM başlatılamadı."));return}}}),i.postMessage({op:"init",gsBase:t}),u}function h(t){const e=t.data;if(e.id===void 0)return;const r=c.get(e.id);r&&(c.delete(e.id),e.op==="result"&&e.output?r.resolve(new Uint8Array(e.output)):r.reject(e.message??"Sıkıştırma başarısız."))}async function d(t,e){await b();const r=++m,s=t.buffer.slice(t.byteOffset,t.byteOffset+t.byteLength);return new Promise((a,o)=>{c.set(r,{resolve:a,reject:n=>o(new Error(n))}),i.postMessage({op:"run",id:r,input:s,args:e},[s])})}async function S(t,e,r){try{const s=[...g,...l[r]],a=await d(t,s),o=new Blob([a.buffer],{type:"application/pdf"}),n=e.replace(/\.pdf$/i,"");return{kind:"success",sizeOriginal:t.byteLength,sizeResult:a.byteLength,downloadUrl:URL.createObjectURL(o),fileName:`${n}-compressed.pdf`}}catch(s){return{kind:"error",message:s instanceof Error?s.message:"Sıkıştırma başarısız."}}}async function w(t,e){try{const s=await d(t,["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite","-dPDFSETTINGS=/prepress"]),a=e.replace(/\.pdf$/i,"");return{ok:!0,bytes:s,fileName:`${a}-repaired.pdf`}}catch(r){return{ok:!1,message:r instanceof Error?r.message:"Repair başarısız."}}}export{S as compressWithWasm,w as repairWithWasm};
