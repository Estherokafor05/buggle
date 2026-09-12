import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizePush, verifyBearer, verifySignature } from './security.ts';
import type { JobStore } from './store.ts';

type ServerOptions = {
  repository: string; installationId: number; botLogin: string;
  webhookSecret: string; apiToken: string;
};
function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

export function createBuggleServer(store: JobStore, options: ServerOptions) {
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (req.method === 'GET' && path === '/health') return json(res, 200, { service: 'buggle', status: 'ok', version: '0.1.0' });
      if (path.startsWith('/runs')) {
        if (!verifyBearer(header(req, 'authorization'), options.apiToken)) return json(res, 401, { error: 'Unauthorised.' });
        if (req.method === 'GET' && path === '/runs') {
          return json(res, 200, { runs: store.list().map(({ result, ...job }) => ({ ...job, decision: result?.proposal.decision ?? null })) });
        }
        const match = /^\/runs\/([a-f0-9-]{36})(\/retry)?$/.exec(path);
        if (match && req.method === 'GET' && !match[2]) {
          const run = store.get(match[1]);
          return json(res, run ? 200 : 404, run ?? { error: 'Run not found.' });
        }
        if (match && req.method === 'POST' && match[2]) {
          return store.retry(match[1]) ? json(res, 202, { status: 'queued' }) : json(res, 409, { error: 'Only failed or needs-context runs can be retried.' });
        }
        return json(res, 404, { error: 'Route not found.' });
      }
      if (req.method !== 'POST' || path !== '/webhooks/github') return json(res, 404, { error: 'Route not found.' });
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 2 * 1024 * 1024) return json(res, 413, { error: 'Webhook exceeds 2 MB.' });
        chunks.push(buffer);
      }
      const body = Buffer.concat(chunks);
      if (!verifySignature(body, header(req, 'x-hub-signature-256'), options.webhookSecret)) return json(res, 401, { error: 'Invalid webhook signature.' });
      const event = header(req, 'x-github-event');
      if (event === 'ping') return json(res, 200, { status: 'pong' });
      if (event !== 'push') return json(res, 202, { ignored: 'Only push events are supported in this version.' });
      const deliveryId = header(req, 'x-github-delivery');
      if (!deliveryId || !/^[a-zA-Z0-9-]{1,100}$/.test(deliveryId)) return json(res, 400, { error: 'Missing or invalid delivery ID.' });
      let payload: unknown;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
      let push: ReturnType<typeof normalizePush>;
      try { push = normalizePush(payload, options); } catch { return json(res, 403, { error: 'Payload is invalid or outside the configured repository and installation.' }); }
      if ('ignored' in push) return json(res, 202, push);
      if (store.pendingCount() >= 500) return json(res, 503, { error: 'Queue is full. Redeliver later.' });
      const result = store.enqueue(deliveryId, push);
      return json(res, 202, { id: result.job.id, status: result.job.status, duplicate: result.duplicate });
    } catch {
      if (!res.headersSent && !res.destroyed) json(res, 500, { error: 'Request failed.' });
    }
  });
}
