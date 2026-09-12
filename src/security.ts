import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from './types.ts';
import type { Push } from './types.ts';

export function verifySignature(body: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !/^sha256=[a-f0-9]{64}$/.test(header) || !secret) return false;
  const received = Buffer.from(header.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(received, expected);
}

export function verifyBearer(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safePath(path: string): boolean {
  return Boolean(path) && path.length <= 240 && !/[\\\u0000-\u001f\u007f:]/.test(path) &&
    !path.startsWith('/') && !path.split('/').some(p => p === '.' || p === '..' || p === '');
}

export function readablePath(path: string): boolean {
  if (!safePath(path)) return false;
  if (path.split('/').some(p => /^(\.git|node_modules|dist|build|coverage|\.next|\.buggle|vendor|test-results|playwright-report)$/.test(p))) return false;
  if (/(^|\/)(\.env[^/]*|[^/]*(?:secret|credential|token)[^/]*|[^/]*\.(?:pem|key|p12|pfx))$/i.test(path)) return false;
  return /\.(?:[cm]?[jt]sx?|vue|svelte|json|md|html|css|ya?ml)$/.test(path) || /(^|\/)(?:\.prettierrc|\.eslintrc)$/.test(path);
}

export function normalizePush(
  payload: unknown,
  policy: { repository: string; installationId: number; botLogin: string },
): Push | { ignored: string } {
  if (!isRecord(payload) || !isRecord(payload.repository) || !isRecord(payload.installation)) {
    throw new Error('Expected a GitHub App push payload.');
  }
  const repo = payload.repository.full_name;
  const installationId = payload.installation.id;
  if (typeof repo !== 'string' || repo.toLowerCase() !== policy.repository.toLowerCase() || installationId !== policy.installationId) {
    throw new Error('Repository or installation is not configured for this service.');
  }
  const ref = payload.ref;
  if (typeof ref !== 'string' || !ref.startsWith('refs/heads/')) return { ignored: 'Only branch pushes are analysed.' };
  if (ref.startsWith('refs/heads/buggle/')) return { ignored: 'Buggle proposal branch.' };
  if (isRecord(payload.sender) && payload.sender.login === policy.botLogin) return { ignored: 'Buggle bot push.' };
  if (payload.deleted === true || payload.after === '0'.repeat(40)) return { ignored: 'Branch deleted.' };
  if (typeof payload.before !== 'string' || typeof payload.after !== 'string' ||
    !/^[a-f0-9]{40}$/.test(payload.before) || !/^[a-f0-9]{40}$/.test(payload.after) ||
    ref.length > 255 || /[\u0000-\u001f\u007f]/.test(ref)) throw new Error('Invalid branch or commit identifiers.');
  return { repository: policy.repository, installationId: policy.installationId, ref, base: payload.before, head: payload.after };
}
