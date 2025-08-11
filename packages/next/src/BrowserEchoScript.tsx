'use client';

import Script from 'next/script';
import type { BrowserLogLevel } from '@browser-echo/core';

export interface BrowserEchoScriptProps {
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
}

export default function BrowserEchoScript(props: BrowserEchoScriptProps) {
  const route = props.route ?? '/__client-logs';
  const include = JSON.stringify(props.include ?? ['log','info','warn','error','debug']);
  const preserve = props.preserveConsole ?? true;
  const tag = props.tag ?? '[browser]';
  const batchSize = props.batch?.size ?? 20;
  const batchInterval = props.batch?.interval ?? 300;

  const code = `
(function(){
  if (typeof window==='undefined') return;
  if (window.__browser_echo_installed__) return;
  window.__browser_echo_installed__ = true;
  var ROUTE=${JSON.stringify(route)}, INCLUDE=${include}, PRESERVE=${JSON.stringify(preserve)}, TAG=${JSON.stringify(tag)};
  var BATCH_SIZE=${JSON.stringify(batchSize)}, BATCH_INTERVAL=${JSON.stringify(batchInterval)};
  var SESSION=(function(){try{var a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('')}catch{return String(Math.random()).slice(2,10)}})();
  var q=[],t=null;
  function enqueue(e){q.push(e); if(q.length>=BATCH_SIZE){flush()} else if(!t){t=setTimeout(flush,BATCH_INTERVAL)}}
  function flush(){ if(t){clearTimeout(t); t=null} if(!q.length) return;
    var p=JSON.stringify({sessionId:SESSION,entries:q.splice(0,q.length)});
    try{ if(navigator.sendBeacon) navigator.sendBeacon(ROUTE,new Blob([p],{type:'application/json'}));
      else fetch(ROUTE,{method:'POST',headers:{'content-type':'application/json'},body:p,keepalive:true,cache:'no-store'}).catch(()=>{}); }catch(_){}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') flush()});
  addEventListener('pagehide', flush); addEventListener('beforeunload', flush);
  function safeFormat(v){ if(typeof v==='string') return v; if(v && v instanceof Error) return (v.name||'Error')+': '+(v.message||'');
    try{var seen=new WeakSet(); return JSON.stringify(v,(k,val)=>{ if(typeof val==='bigint') return String(val)+'n';
      if(typeof val==='function') return '[Function '+(val.name||'anonymous')+']';
      if(val && val instanceof Error) return {name:val.name,message:val.message,stack:val.stack};
      if(typeof val==='symbol') return val.toString();
      if(val && typeof val==='object'){ if(seen.has(val)) return '[Circular]'; seen.add(val) } return val; }); }
    catch(e){ try{return String(v)}catch{return '[Unserializable]'} } }
  function captureStack(){ try{ var e=new Error(), raw=e.stack||'', lines=raw.split('\\n').slice(1);
    return lines.filter(l=>!/browser-echo|captureStack|safeFormat|enqueue|flush/.test(l)).join('\\n'); }catch{return ''} }
  function parseSource(stack){ if(!stack) return ''; var m=stack.match(/\\(?((?:file:\\/\\/|https?:\\/\\/|\\/)[^) \\n]+):(\\d+):(\\d+)\\)?/); return m? (m[1]+':'+m[2]+':'+m[3]) : '' }
  var ORIGINAL={}; for (var i=0;i<INCLUDE.length;i++){ (function(level){
    var orig=console[level]?console[level].bind(console):console.log.bind(console); ORIGINAL[level]=orig;
    console[level]=function(){ var args=[...arguments]; var text=args.map(safeFormat).join(' ');
      var stack=captureStack(); var source=parseSource(stack);
      enqueue({level:level,text:text,time:Date.now(),stack:stack,source:source});
      if(PRESERVE){ try{ orig.apply(console,args) }catch(e){} } }
  })(INCLUDE[i]) }
  try{ ORIGINAL['info'] && ORIGINAL['info'](TAG+' forwarding console logs to '+ROUTE+' (session '+SESSION+')') }catch(_){}
})();
  `.trim();

  return <Script id="browser-echo" strategy="beforeInteractive">{code}</Script>;
}
