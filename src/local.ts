import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readablePath } from './security.ts';
import { selectContextPaths } from './profile.ts';
import type { Snapshot } from './types.ts';

// Read-only inspection. Does not import repository modules or execute package scripts.
export async function inspectLocal(directory: string): Promise<Snapshot> {
  const root = resolve(directory);
  const paths: string[] = [];
  const warnings: string[] = [];
  let visited = 0;
  async function walk(relative = ''): Promise<void> {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      if (++visited > 5000) throw new Error('Local repository exceeds 5000 directory entries.');
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !/^(node_modules|vendor|dist|build|coverage|test-results|playwright-report)$/.test(entry.name)) await walk(path);
      } else if (entry.isFile() && readablePath(path)) paths.push(path);
    }
  }
  await walk();
  const selected = selectContextPaths(paths, []);
  const files: Record<string, string> = {};
  let total = 0;
  if (selected.length > 40) warnings.push('More than 40 context files.');
  for (const path of selected.slice(0, 40)) {
    const buffer = await readFile(join(root, path));
    if (buffer.length > 32_000) { warnings.push(`File exceeds 32 KB: ${path}`); continue; }
    total += buffer.length;
    if (total > 96_000) { warnings.push('Context exceeds 96 KB.'); break; }
    if (!buffer.includes(0)) files[path] = buffer.toString('utf8');
  }
  return { repository: 'local/inspection', head: 'working-tree', paths, files, changes: [], warnings };
}
