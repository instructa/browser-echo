'use client';

import Script from 'next/script';
import type { BrowserLogLevel } from '@browser-echo/core';
import type { JSX } from 'react';

export interface BrowserEchoScriptProps {
  enabled?: boolean;
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  stackMode?: 'none' | 'condensed' | 'full';
  showSource?: boolean;
  batch?: { size?: number; interval?: number };
  networkLogs?: { enabled?: boolean; captureFull?: boolean };
}

export default function BrowserEchoScript(props: BrowserEchoScriptProps): JSX.Element {
  // Early return if disabled
  if (props.enabled === false) {
    return <></>;
  }

  // Default to the conventional Next.js API route path
  const route = props.route ?? '/api/client-logs';
  const include = JSON.stringify(props.include ?? ['log','info','warn','error','debug']);
  const preserve = props.preserveConsole ?? true;
  const tag = props.tag ?? '[browser]';
  const stackMode = props.stackMode ?? 'condensed';
  const showSource = props.showSource ?? true;
  const batchSize = props.batch?.size ?? 20;
  const batchInterval = props.batch?.interval ?? 300;
  const netEnabled = props.networkLogs?.enabled === true;
  const netFull = !!props.networkLogs?.captureFull;

  const code = `
(function(){
  if (typeof window==='undefined') return;
  if (window.__browser_echo_installed__) return;
  window.__browser_echo_installed__ = true;
  var ROUTE=${JSON.stringify(route)}, INCLUDE=${include}, PRESERVE=${JSON.stringify(preserve)}, TAG=${JSON.stringify(tag)};
  var STACK_MODE=${JSON.stringify(stackMode)}, SHOW_SOURCE=${JSON.stringify(showSource)};
  var BATCH_SIZE=${JSON.stringify(batchSize)}, BATCH_INTERVAL=${JSON.stringify(batchInterval)};
  var NET_ENABLED=${JSON.stringify(netEnabled)}, NET_FULL=${JSON.stringify(netFull)};
  var SESSION=(function(){try{var a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('')}catch{return String(Math.random()).slice(2,10)}})();
  var q=[],t=null;
  function enqueue(e){q.push(e); if(q.length>=BATCH_SIZE){flush()} else if(!t){t=setTimeout(flush,BATCH_INTERVAL)}}
  function flush(){ if(t){clearTimeout(t); t=null} if(!q.length) return;
    var p=JSON.stringify({sessionId:SESSION,entries:q.splice(0,q.length)});
    try{ if(navigator.sendBeacon) navigator.sendBeacon(ROUTE,new Blob([p],{type:'application/json'}));
      else fetch(ROUTE,{method:'POST',headers:{'content-type':'application/json'},body:p,keepalive:true,cache:'no-store'}).catch(()=>{}); }catch(_){ }
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
  function captureStack(){ 
    if(STACK_MODE === 'none') return '';
    try{ 
      var e=new Error(), raw=e.stack||'', lines=raw.split('\n').slice(1);
      var filtered = lines.filter(l=>!/browser-echo|captureStack|safeFormat|enqueue|flush/.test(l));
      if(STACK_MODE === 'condensed') {
        // Return only the first meaningful line for condensed mode
        return filtered.slice(0, 1).join('\n');
      }
      return filtered.join('\n'); 
    }catch{return ''} 
  }
  function parseSource(stack){ if(!stack) return ''; var m=stack.match(/\(?((?:file:\/\/|https?:\/\/|\/)[^) \n]+):(\d+):(\d+)\)?/); return m? (m[1]+':'+m[2]+':'+m[3]) : '' }
  var ORIGINAL={}; for (var i=0;i<INCLUDE.length;i++){ (function(level){
    var orig=console[level]?console[level].bind(console):console.log.bind(console); ORIGINAL[level]=orig;
    console[level]=function(){ var args=[...arguments]; var text=args.map(safeFormat).join(' ');
      var stack=captureStack(); var source=SHOW_SOURCE ? parseSource(stack) : '';
      enqueue({level:level,text:text,time:Date.now(),stack:stack,source:source});
      if(PRESERVE){ try{ orig.apply(console,args) }catch(e){} } }
  })(INCLUDE[i]) }
  try{ ORIGINAL['info'] && ORIGINAL['info'](TAG+' forwarding console logs to '+ROUTE+' (session '+SESSION+')') }catch(_){ }

  function normUrl(input){ try { var s=''; if(typeof input==='string') s=input; else if (input && typeof input.url==='string') s=input.url; else if (input && input.href) s=String(input.href||''); return s; } catch { return '' } }
  if (NET_ENABLED) {
    try {
      var __origFetch = window.fetch && window.fetch.bind(window);
      if (__origFetch) {
        window.fetch = function(input, init){
          var start = performance.now();
          var method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
          var u = normUrl(input);
          function emit(status, ok, extra){ var dur = Math.max(0, Math.round(performance.now()-start)); var st = isFinite(status) ? String(status) : 'ERR'; var line = '[NETWORK] ['+method+'] ['+(u||'(request)')+'] ['+st+'] ['+dur+'ms]'+(extra?(' '+extra):''); enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); }
          try {
            var p = __origFetch(input, init);
            return Promise.resolve(p).then(function(res){ try { if (NET_FULL) { var len = 0; try { var cl = res && res.headers && res.headers.get && res.headers.get('content-length'); len = Number(cl||0)|0; } catch {} emit(Number(res && res.status || 0)|0, !!(res && res.ok), '[size:'+len+']'); } else { emit(Number(res && res.status || 0)|0, !!(res && res.ok)); } } catch {} return res; }).catch(function(err){ emit(0,false, err && err.message ? String(err.message) : 'fetch failed'); throw err; });
          } catch (err) { emit(0,false, err && err.message ? String(err.message) : 'fetch failed'); throw err; }
        }
      }
    } catch {}
    try {
      var XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype) {
        var _open = XHR.prototype.open, _send = XHR.prototype.send;
        XHR.prototype.open = function(method, url){ try{ this.__be_method__ = String(method||'GET').toUpperCase() }catch{} try{ this.__be_url__ = String(url||'') }catch{} return _open.apply(this, arguments); };
        XHR.prototype.send = function(){ var start = performance.now(); var onEnd = ()=>{ try{ var dur = Math.max(0, Math.round(performance.now()-start)); var method = this.__be_method__ || 'GET'; var u = this.__be_url__ || ''; var status = Number(this.status||0)|0; var ok = status >= 200 && status < 400; var extra = NET_FULL ? ('ready:'+this.readyState) : ''; var line = '[NETWORK] ['+method+'] ['+u+'] ['+(status||'ERR')+'] ['+dur+'ms]'+(extra?(' '+extra):''); enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); } catch {} try { this.removeEventListener('loadend', onEnd); this.removeEventListener('error', onEnd); this.removeEventListener('abort', onEnd); } catch {} };
          try { this.addEventListener('loadend', onEnd); } catch {}
          try { this.addEventListener('error', onEnd); } catch {}
          try { this.addEventListener('abort', onEnd); } catch {}
          return _send.apply(this, arguments);
        }
      }
    } catch {}
    try {
      var WS = window.WebSocket;
      if (WS) {
        // @ts-ignore
        window.WebSocket = new Proxy(WS, {
          construct: function(Target, args) {
            var url = normUrl(args && args[0]);
            var start = performance.now();
            // @ts-ignore
            var socket = new Target(...args);
            try {
              socket.addEventListener('open', function(){
                var dur = Math.max(0, Math.round(performance.now() - start));
                var line = '[NETWORK] [WS OPEN] ['+(url||'(ws)')+'] ['+dur+'ms]';
                enqueue({ level: 'info', text: line, time: Date.now(), tag: '[network]' });
              });
              socket.addEventListener('close', function(ev){
                var dur = Math.max(0, Math.round(performance.now() - start));
                var code = Number(ev && ev.code || 0) | 0;
                var reason = ev && ev.reason ? String(ev.reason) : '';
                var extra = reason ? ('code:'+code+' reason:'+reason) : ('code:'+code);
                var line = '[NETWORK] [WS CLOSE] ['+(url||'(ws)')+'] ['+dur+'ms] '+extra;
                enqueue({ level: code === 1000 ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' });
              });
              socket.addEventListener('error', function(){
                var dur = Math.max(0, Math.round(performance.now() - start));
                var line = '[NETWORK] [WS ERROR] ['+(url||'(ws)')+'] ['+dur+'ms]';
                enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' });
              });
            } catch {}
            return socket;
          }
        });
      }
    } catch {}
  }
})();
  `.trim();

  return <Script id="browser-echo" strategy="beforeInteractive">{code}</Script>;
}
