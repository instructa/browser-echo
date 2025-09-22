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
  networkLogs?: {
    enabled?: boolean;
    captureFull?: boolean;
    bodies?: {
      request?: boolean;
      response?: boolean;
      maxBytes?: number;
      allowContentTypes?: string[];
      prettyJson?: boolean;
    };
  };
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
  var NET_BODY=${JSON.stringify(props.networkLogs?.bodies || {})};
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
  function __getHeader(headers,name){ try{ if(!headers) return ''; var key=String(name).toLowerCase(); if (headers.get) { var v=headers.get(name)||headers.get(key)||''; return String(v||'').toLowerCase(); } if (Array.isArray(headers)) { for (var i=0;i<headers.length;i++){ var kv=headers[i]; if (String(kv[0]).toLowerCase()===key) return String(kv[1]||'').toLowerCase(); } } if (typeof headers==='object'){ for (var k in headers){ if (k.toLowerCase()===key) return String(headers[k]||'').toLowerCase(); } } } catch{} return '' }
  function __isAllowed(ct){ try{ var allow=(NET_BODY.allowContentTypes && NET_BODY.allowContentTypes.length) ? NET_BODY.allowContentTypes : ['application/json','text/','application/x-www-form-urlencoded']; var c=String(ct||'').toLowerCase(); if(!c) return false; for (var i=0;i<allow.length;i++){ var al=String(allow[i]); if (c.startsWith(al)) return true; } } catch{} return false }
  function __isLikelyText(s){ var t=String(s||'').trim(); if(!t) return true; if(t[0]==='{'||t[0]==='[') return true; return /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(t) }
  function __fmtSnippet(raw, ct){ try{ var max=(NET_BODY.maxBytes ?? 2048)|0; var pretty=(NET_BODY.prettyJson !== false); var text=String(raw||''); var lct=String(ct||'').toLowerCase(); if (pretty && (lct.startsWith('application/json') || text.trim().startsWith('{') || text.trim().startsWith('['))) { try { text = JSON.stringify(JSON.parse(text), null, 2) } catch {} } var enc=new TextEncoder(); var bytes=enc.encode(text); if (bytes.length <= max) return text; var sliced=bytes.slice(0, Math.max(0, max)); var dec=new TextDecoder(); var shown=dec.decode(sliced); var extra=bytes.length - sliced.length; return shown+'… (+'+extra+' bytes)'; } catch { return '' } }
  if (NET_ENABLED) {
    try {
      var __origFetch = window.fetch && window.fetch.bind(window);
      if (__origFetch) {
        window.fetch = function(input, init){
          var start = performance.now();
          var method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
          var u = normUrl(input);
          function baseLine(status, dur){ var st = isFinite(status) ? String(status) : 'ERR'; return '[NETWORK] ['+method+'] ['+(u||'(request)')+'] ['+st+'] ['+dur+'ms]'; }
          function reqSnippet(){ var cfg = NET_BODY || {}; if(!cfg.request) return Promise.resolve(''); try{ if (input && typeof input==='object' && input.clone) { var req=input; var headers=req.headers && req.headers.get ? req.headers : null; var ct=__getHeader(headers,'content-type') || (init && init.headers ? __getHeader(init.headers,'content-type') : ''); if (!__isAllowed(ct)) return Promise.resolve(''); return req.clone().text().then(function(txt){ return __fmtSnippet(txt, ct) }); } var ct2 = init && init.headers ? __getHeader(init.headers,'content-type') : ''; var body = init && init.body; if (typeof body==='string') { if (!ct2 || __isAllowed(ct2) || __isLikelyText(body)) return Promise.resolve(__fmtSnippet(body, ct2)); } else if (body && body.toString && (body instanceof URLSearchParams)) { var s = body.toString(); var reqCt = ct2 || 'application/x-www-form-urlencoded'; if (__isAllowed(reqCt)) return Promise.resolve(__fmtSnippet(s, reqCt)); } else if (body && typeof body.size==='number') { var size = Number(body.size)|0; return Promise.resolve('[binary: '+size+' bytes]'); } } catch {} return Promise.resolve('') }
          function resSnippet(res){ var cfg = NET_BODY || {}; if(!cfg.response) return Promise.resolve(''); try{ var ct=__getHeader(res && res.headers, 'content-type'); if (!__isAllowed(ct)) return Promise.resolve(''); if (res && res.clone) { try { var clone=res.clone(); if (clone && clone.body && clone.body.getReader) { return (async function(){ try{ var reader=clone.body.getReader(); var chunks=[]; var received=0; var max=(NET_BODY.maxBytes ?? 2048)|0; while(true){ var r=await reader.read(); if(r.done) break; var v=r.value; if(v){ var need = max - received; if (received < max) chunks.push(need >= v.length ? v : v.slice(0, need)); received += v.length; if (received >= max) { try{ reader.cancel && reader.cancel() }catch{} break; } } } var totalLen=chunks.reduce((n,a)=>n+a.length,0); var out=new Uint8Array(totalLen); var off=0; for (var i=0;i<chunks.length;i++){ var a=chunks[i]; out.set(a, off); off+=a.length; } var dec=new TextDecoder(); var shown=dec.decode(out); if (received <= max) return __fmtSnippet(shown, ct); var extra = received - out.length; return shown+'… (+'+extra+' bytes)'; } catch { try { var t = await clone.text(); return __fmtSnippet(t, ct) } catch { return '' } } })(); } return clone.text().then(function(txt){ return __fmtSnippet(txt, ct) }) } } catch {} return Promise.resolve('') }
          try {
            var p = __origFetch(input, init);
            return Promise.resolve(p).then(function(res){ var dur=Math.max(0, Math.round(performance.now()-start)); var st=Number(res && res.status || 0)|0; var ok=!!(res && res.ok); var extra = NET_FULL ? (' [size:' + (Number(res && res.headers && res.headers.get && res.headers.get('content-length') || 0) | 0) + ']') : ''; Promise.all([reqSnippet(), resSnippet(res)]).then(function(arr){ var reqS=arr[0], resS=arr[1]; var line = baseLine(st, dur) + extra; if (reqS) line += '\n    req: ' + reqS; if (resS) line += '\n    res: ' + resS; enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); }).catch(function(){ var line=baseLine(st, dur) + extra; enqueue({ level: ok ? 'info' : 'warn', text: line, time: Date.now(), tag: '[network]' }); }); return res; }).catch(function(err){ var dur=Math.max(0, Math.round(performance.now()-start)); reqSnippet().then(function(reqS){ var line = baseLine(0, dur) + ' fetch failed'; if (reqS) line += '\n    req: ' + reqS; enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' }); }).catch(function(){ var line=baseLine(0, dur) + ' fetch failed'; enqueue({ level: 'warn', text: line, time: Date.now(), tag: '[network]' }); }); throw err; });
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
