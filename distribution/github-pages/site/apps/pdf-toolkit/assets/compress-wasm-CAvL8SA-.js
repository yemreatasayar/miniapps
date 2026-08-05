import{p as l,g}from"./index-roKWI4IN.js";const f="./ghostscript/",m={web:["-dPDFSETTINGS=/screen"],balanced:["-dPDFSETTINGS=/ebook"],strong:["-dPDFSETTINGS=/screen","-dColorImageResolution=45","-dGrayImageResolution=45","-dMonoImageResolution=72"]},b=["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite"];function c(){return l[g()].runtimeErrors}const h=`
var gs = null;
var jobCounter = 0;

self.onmessage = async function (ev) {
  var d = ev.data;

  if (d.op === 'init') {
    try {
      importScripts(d.gsBase + 'gs.js');
      gs = await Module({
        locateFile: function (path) {
          return d.gsBase + path;
        }
      });
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
`;let i=null,u=null;const p=new Map;let S=0;function w(){if(u)return u;const r=new URL(f,window.location.href).href,e=new Blob([h],{type:"text/javascript"}),t=URL.createObjectURL(e);return i=new Worker(t),URL.revokeObjectURL(t),u=new Promise((s,n)=>{i.onmessage=a=>{const o=a.data;if(o.op==="ready"){s(),i.onmessage=y;return}if(o.op==="init-error"){n(new Error(o.message??c().ghostscriptInit));return}}}),i.postMessage({op:"init",gsBase:r}),u}function y(r){const e=r.data;if(e.id===void 0)return;const t=p.get(e.id);t&&(p.delete(e.id),e.op==="result"&&e.output?t.resolve(new Uint8Array(e.output)):t.reject(e.message??c().compressFailed))}async function d(r,e){await w();const t=++S,s=r.buffer.slice(r.byteOffset,r.byteOffset+r.byteLength);return new Promise((n,a)=>{p.set(t,{resolve:n,reject:o=>a(new Error(o))}),i.postMessage({op:"run",id:t,input:s,args:e},[s])})}async function P(r,e,t){try{const s=[...b,...m[t]],n=await d(r,s),a=new Blob([n.buffer],{type:"application/pdf"}),o=e.replace(/\.pdf$/i,"");return{kind:"success",sizeOriginal:r.byteLength,sizeResult:n.byteLength,downloadUrl:URL.createObjectURL(a),fileName:`${o}-compressed.pdf`}}catch(s){return{kind:"error",message:s instanceof Error?s.message:c().compressFailed}}}async function F(r,e){try{const s=await d(r,["-dBATCH","-dNOPAUSE","-dQUIET","-sDEVICE=pdfwrite","-dPDFSETTINGS=/prepress"]),n=e.replace(/\.pdf$/i,"");return{ok:!0,bytes:s,fileName:`${n}-repaired.pdf`}}catch(t){return{ok:!1,message:t instanceof Error?t.message:c().repairFailed}}}export{P as compressWithWasm,F as repairWithWasm};
