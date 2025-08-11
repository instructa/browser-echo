import { describe, it, expect } from 'vitest';
import { POST } from '../src/route';

it('accepts payload and returns 204', async () => {
  const req: any = { json: async () => ({ sessionId: 'deadbeef', entries: [{ level: 'info', text: 'hi next' }] }) };
  const res: any = await POST(req);
  // NextResponse has private fields; just check status
  expect((res as any).status).toBe(204);
});
