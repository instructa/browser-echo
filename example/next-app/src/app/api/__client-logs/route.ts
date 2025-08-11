export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid', { status: 400 });
  }

  const validLevels = new Set(['log', 'info', 'warn', 'error', 'debug']);
  const print = (level: string, line: string) => {
    const fn = (console as any)[level] || console.log;
    try {
      fn(line);
    } catch {
      // ignore
    }
  };

  type Entry = { level?: string; text?: string };
  type Batch = { entries?: Entry[] } & Entry;

  const payload = body as Batch;

  if (Array.isArray((payload as any)?.entries)) {
    for (const entry of (payload as any).entries as Entry[]) {
      const level = validLevels.has(String(entry.level)) ? String(entry.level) : 'log';
      const text = typeof entry.text === 'string' ? entry.text : '';
      print(level, `[browser] ${level.toUpperCase()}: ${text}`);
    }
    return new Response(null, { status: 204 });
  }

  const level = validLevels.has(String((payload as Entry)?.level))
    ? String((payload as Entry).level)
    : 'log';
  const text = typeof (payload as Entry)?.text === 'string' ? (payload as Entry).text : '';
  print(level, `[browser] ${level.toUpperCase()}: ${text}`);

  return new Response(null, { status: 204 });
}
