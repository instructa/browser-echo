import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add a GET handler for testing
export async function GET() {
  return new NextResponse(JSON.stringify({ message: 'Browser Echo endpoint is working!' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Entry = { level: BrowserLogLevel | string; text: string; time?: number; stack?: string; source?: string; };
type Payload = { sessionId?: string; entries: Entry[] };

export async function POST(req: NextRequest) {
  let payload: Payload | null = null;
  try { 
    payload = (await req.json()) as Payload; 
  } catch { 
    return new NextResponse('invalid JSON', { status: 400 }); 
  }
  
  if (!payload || !Array.isArray(payload.entries)) {
    return new NextResponse('invalid payload', { status: 400 });
  }

  const sid = (payload.sessionId ?? 'anon').slice(0, 8);
  for (const entry of payload.entries) {
    const level = norm(entry.level);
    let line = `[browser] [${sid}] ${level.toUpperCase()}: ${entry.text}`;
    if (entry.source) line += ` (${entry.source})`;
    print(level, color(level, line));
    if (entry.stack) print(level, dim(indent(entry.stack, '    ')));
  }
  return new NextResponse(null, { status: 204 });
}

function norm(l: string): BrowserLogLevel {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return (['log','info','warn','error','debug'] as const).includes(l as any) ? (l as BrowserLogLevel) : 'log';
}

function print(level: BrowserLogLevel, msg: string) {
  switch (level) {
    case 'error': console.error(msg); break;
    case 'warn':  console.warn(msg); break;
    default:      console.log(msg);
  }
}

function indent(s: string, prefix = '  ') {
  return String(s).split(/\r?\n/g).map((l) => (l.length ? prefix + l : l)).join('\n');
}

const c = { 
  reset:'\x1b[0m', 
  red:'\x1b[31m', 
  yellow:'\x1b[33m', 
  magenta:'\x1b[35m', 
  cyan:'\x1b[36m', 
  white:'\x1b[37m', 
  dim:'\x1b[2m' 
};

function color(level: BrowserLogLevel, msg: string) {
  switch (level) {
    case 'error': return c.red + msg + c.reset;
    case 'warn':  return c.yellow + msg + c.reset;
    case 'debug': return c.magenta + msg + c.reset;
    case 'info':  return c.cyan + msg + c.reset;
    default:      return c.white + msg + c.reset;
  }
}

function dim(s: string) { 
  return c.dim + s + c.reset; 
}