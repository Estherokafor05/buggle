import { createSign } from 'node:crypto';
import { ContextError, RemoteError } from './types.ts';
import type { Push, Snapshot, Source } from './types.ts';
import { readablePath } from './security.ts';
import { selectContextPaths } from './profile.ts';

type GithubOptions = { repository: string; installationId: number; appId: string; privateKey: string; fetcher?: typeof fetch };

export class GithubSource implements Source {
  #options: GithubOptions;
  #fetch: typeof fetch;
  #token: { value: string; expires: number } | null = null;
  constructor(options: GithubOptions) {
    this.#options = options;
    this.#fetch = options.fetcher ?? fetch;
  }

  async #request<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.#fetch(`https://api.github.com${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'buggle/0.1', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new RemoteError(`GitHub returned HTTP ${response.status}.`);
    return await response.json() as T;
  }

  async #installationToken(): Promise<string> {
    if (this.#token && this.#token.expires > Date.now() + 60_000) return this.#token.value;
    const now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: this.#options.appId })}`;
    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    const jwt = `${unsigned}.${sign.sign(this.#options.privateKey, 'base64url')}`;
    const token = await this.#request<{ token: string; expires_at: string }>(
      `/app/installations/${this.#options.installationId}/access_tokens`, jwt, 'POST',
      { repositories: [this.#options.repository.split('/')[1]], permissions: { contents: 'read' } },
    );
    if (!token.token || !Number.isFinite(Date.parse(token.expires_at))) throw new RemoteError('Invalid installation token response.');
    this.#token = { value: token.token, expires: Date.parse(token.expires_at) };
    return token.token;
  }

  #repo(repository: string): string {
    if (repository !== this.#options.repository) throw new Error('Repository is outside the configured installation.');
    return `/repos/${repository.split('/').map(encodeURIComponent).join('/')}`;
  }

  async branchHead(repository: string, ref: string): Promise<string | null> {
    if (!ref.startsWith('refs/heads/')) throw new Error('Expected a branch ref.');
    const token = await this.#installationToken();
    try {
      const result = await this.#request<{ object: { sha: string } }>(`${this.#repo(repository)}/git/ref/heads/${encodeURIComponent(ref.slice(11))}`, token);
      return result.object.sha;
    } catch (error) {
      if (error instanceof RemoteError && error.message === 'GitHub returned HTTP 404.') return null;
      throw error;
    }
  }

  async snapshot(push: Push): Promise<Snapshot> {
    if (push.base === '0'.repeat(40)) throw new ContextError('New branch: a comparison baseline must be selected before test generation.');
    const token = await this.#installationToken();
    const repo = this.#repo(push.repository);
    const compare = await this.#request<{ status: string; files?: { filename: string; status: string; patch?: string }[] }>(`${repo}/compare/${push.base}...${push.head}?per_page=1&page=1`, token);
    if (!['ahead', 'identical'].includes(compare.status)) throw new ContextError('History was rewritten or diverged. Review the comparison baseline.');
    if (!compare.files || compare.files.length >= 300) throw new ContextError('GitHub comparison may be incomplete; this starter handles fewer than 300 changed files.');
    const changes = compare.files.filter(f => readablePath(f.filename)).map(f => ({ path: f.filename, status: f.status, patch: f.patch }));
    const commit = await this.#request<{ tree: { sha: string } }>(`${repo}/git/commits/${push.head}`, token);
    const tree = await this.#request<{ truncated: boolean; tree: { path: string; type: string; mode: string; size?: number }[] }>(`${repo}/git/trees/${commit.tree.sha}?recursive=1`, token);
    if (tree.truncated || tree.tree.length > 5000) throw new ContextError('Repository tree exceeds the initial context limit.');
    const entries = tree.tree.filter(f => f.type === 'blob' && f.mode !== '120000' && readablePath(f.path));
    const paths = entries.map(f => f.path);
    const selected = selectContextPaths(paths, changes);
    const warnings: string[] = [];
    if (selected.length > 40) warnings.push('More than 40 relevant source files; context selection needs review.');
    const files: Record<string, string> = {};
    let bytes = 0;
    for (const path of selected.slice(0, 40)) {
      const entry = entries.find(f => f.path === path)!;
      if ((entry.size ?? 0) > 32_000) { warnings.push(`File exceeds 32 KB: ${path}`); continue; }
      const data = await this.#request<{ type: string; encoding: string; content: string }>(`${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${push.head}`, token);
      if (data.type !== 'file' || data.encoding !== 'base64') { warnings.push(`Unreadable source: ${path}`); continue; }
      const source = Buffer.from(data.content, 'base64');
      bytes += source.byteLength;
      if (bytes > 96_000) { warnings.push('Repository context exceeds 96 KB.'); break; }
      if (source.includes(0)) { warnings.push(`Binary source: ${path}`); continue; }
      files[path] = source.toString('utf8');
    }
    const patchSize = changes.reduce((sum, c) => sum + Buffer.byteLength(c.patch ?? ''), 0);
    if (patchSize > 48_000) warnings.push('Changed-file patches exceed 48 KB.');
    for (const change of changes) {
      if (/\.[jt]sx?$/.test(change.path) && !change.patch) warnings.push(`Missing source patch: ${change.path}`);
    }
    return { repository: push.repository, head: push.head, paths, files, changes, warnings };
  }
}
