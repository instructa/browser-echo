import { NextRequest, NextResponse } from 'next/server';

type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
declare const runtime = "nodejs";
declare const dynamic = "force-dynamic";
declare function POST(req: NextRequest): Promise<NextResponse<unknown>>;

export { POST, dynamic, runtime };
export type { BrowserLogLevel };
