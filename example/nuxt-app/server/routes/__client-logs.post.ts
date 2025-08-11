export default defineEventHandler(async (event) => {
  // In dev, consume the body and log to the terminal similarly to the Vite plugin
  if (import.meta.dev) {
    try {
      const raw = await readRawBody(event);
      const text = typeof raw === 'string' ? raw : raw ? raw.toString('utf-8') : '';
      const payload = text ? JSON.parse(text) : null;
      if (payload && Array.isArray(payload.entries)) {
        const tag = '[nuxt-browser]';
        const sid = String(payload.sessionId ?? 'anon').slice(0, 8);
        for (const entry of payload.entries) {
          const level = normalizeLevel(String(entry.level));
          const line = `${tag} [${sid}] ${level.toUpperCase()}: ${entry.text}${entry.source ? ` (${entry.source})` : ''}`;
          print(level, line);
          if (entry.stack) {
            // Condensed single line for readability in Nitro logs
            const first = String(entry.stack).split(/\r?\n/g).find((l) => l.trim().length > 0) || '';
            if (first) print(level, `    ${first.trim()}`);
          }
        }
      }
    } catch (err) {
      console.error('[nuxt-browser] endpoint error:', err);
    }
    setResponseStatus(event, 204);
    return '';
  }

  // In production builds, do nothing.
  setResponseStatus(event, 404);
  return 'Not Found';
});

function print(level: string, msg: string) {
  switch (level) {
    case 'error':
      console.error(msg);
      break;
    case 'warn':
      console.warn(msg);
      break;
    case 'info':
      console.info(msg);
      break;
    case 'debug':
    case 'log':
    default:
      console.log(msg);
  }
}

function normalizeLevel(l: string): 'log' | 'info' | 'warn' | 'error' | 'debug' {
  if (l === 'warning') return 'warn';
  if (l === 'verbose') return 'debug';
  return ['log', 'info', 'warn', 'error', 'debug'].includes(l as any) ? (l as any) : 'log';
}



