import{p as l,g}from"./index-BNNiYcy5.js";const f="./ghostscript/",m={web:["-dPDFSETTINGS=/screen"],balanced:["-dPDFSETTINGS=/ebook"],strong:["-dPDFSETTINGS=/screen","-dColorImageResolution=45","-dGrayImageResolution=45","-dMonoImageResolution=72"]},b=["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite"];function c(){return l[g()].runtimeErrors}const h=`
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
`;let i=null,u=null;const p=new Map;let w=0;function y(){if(u)return u;const t=new URL(f,window.location.href).href,e=new Blob([h],{type:"text/javascript"}),r=URL.createObjectURL(e);return i=new Worker(r),URL.revokeObjectURL(r),u=new Promise((s,n)=>{i.onmessage=o=>{const a=o.data;if(a.op==="ready"){s(),i.onmessage=S;return}if(a.op==="init-error"){n(new Error(a.message??c().ghostscriptInit));return}}}),i.postMessage({op:"init",gsBase:t}),u}function S(t){const e=t.data;if(e.id===void 0)return;const r=p.get(e.id);r&&(p.delete(e.id),e.op==="result"&&e.output?r.resolve(new Uint8Array(e.output)):r.reject(e.message??c().compressFailed))}async function d(t,e){await y();const r=++w,s=t.buffer.slice(t.byteOffset,t.byteOffset+t.byteLength);return new Promise((n,o)=>{p.set(r,{resolve:n,reject:a=>o(new Error(a))}),i.postMessage({op:"run",id:r,input:s,args:e},[s])})}async function P(t,e,r){try{const s=[...b,...m[r]],n=await d(t,s),o=new Blob([n.buffer],{type:"application/pdf"}),a=e.replace(/\.pdf$/i,"");return{kind:"success",sizeOriginal:t.byteLength,sizeResult:n.byteLength,downloadUrl:URL.createObjectURL(o),fileName:`${a}-compressed.pdf`}}catch(s){return{kind:"error",message:s instanceof Error?s.message:c().compressFailed}}}async function F(t,e){try{const s=await d(t,["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite","-dPDFSETTINGS=/prepress"]),n=e.replace(/\.pdf$/i,"");return{ok:!0,bytes:s,fileName:`${n}-repaired.pdf`}}catch(r){return{ok:!1,message:r instanceof Error?r.message:c().repairFailed}}}export{P as compressWithWasm,F as repairWithWasm};
