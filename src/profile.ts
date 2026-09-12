import { posix } from 'node:path';
import { isRecord } from './types.ts';
import type { Profile, Snapshot } from './types.ts';
import { safePath } from './security.ts';

export const isTestFile = (p: string): boolean => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(p);
const likelyUi = (p: string): boolean => /\.(?:tsx?|jsx?|vue|svelte|css|html)$/.test(p) || /(^|\/)package\.json$/.test(p);

export function relevantChanges(snapshot: Snapshot): string[] {
  return snapshot.changes.map(c => c.path).filter(likelyUi);
}

export function profileRepository(snapshot: Snapshot, configuredDirectory?: string): Profile {
  let pkg: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(snapshot.files['package.json'] ?? '{}');
    if (isRecord(parsed)) pkg = parsed;
  } catch { /* Recorded below; never execute a repository config. */ }
  const deps = { ...(isRecord(pkg.dependencies) ? pkg.dependencies : {}), ...(isRecord(pkg.devDependencies) ? pkg.devDependencies : {}) };
  const paths = snapshot.paths;
  const configFiles = paths.filter(p => /(^|\/)playwright\.config\.[cm]?[jt]s$/.test(p));
  const warnings = [...snapshot.warnings];
  const testFiles = paths.filter(isTestFile);
  // Infer from files that actually import Playwright; unit test directories are not UI test conventions.
  const playwrightTests = testFiles.filter(p => /(?:@playwright\/test|playwright-bdd)/.test(snapshot.files[p] ?? ''));
  const directories = [...new Set(playwrightTests.map(p => posix.dirname(p)))];
  let testDirectory: string | null = null;
  if (configuredDirectory) {
    if (!safePath(configuredDirectory)) warnings.push('Configured test directory is invalid.');
    else testDirectory = configuredDirectory;
  } else if (directories.length === 1 && directories[0] !== '.') {
    testDirectory = directories[0];
  } else {
    warnings.push('Set BUGGLE_TEST_DIR after reviewing the Playwright test directory.');
  }
  if (!snapshot.files['package.json']) warnings.push('A root package.json is required; monorepo package selection is not implemented.');
  if (!configFiles.length) warnings.push('No Playwright configuration found.');
  if (!testFiles.some(p => Boolean(snapshot.files[p]))) warnings.push('No existing test source is available to learn conventions.');
  const scripts: Record<string, string> = {};
  if (isRecord(pkg.scripts)) for (const [k, v] of Object.entries(pkg.scripts)) if (typeof v === 'string') scripts[k] = v;
  const testsText = testFiles.map(p => snapshot.files[p] ?? '').join('\n');
  const selectorUsage = Object.fromEntries(['getByRole', 'getByLabel', 'getByTestId', 'locator'].map(name => [name, (testsText.match(new RegExp(`\\.${name}\\(`, 'g')) ?? []).length]));
  return {
    framework: (deps['@playwright/test'] || playwrightTests.length) && configFiles.length ? 'playwright' : 'unsupported',
    packageManager: paths.some(p => p === 'pnpm-lock.yaml') ? 'pnpm' : paths.includes('yarn.lock') ? 'yarn' : 'npm',
    testDirectory, testFiles,
    fixtureFiles: paths.filter(p => /(^|\/)(?:fixtures?)(?:\/|\.)/.test(p)),
    pageObjectFiles: paths.filter(p => /(^|\/)(?:page-objects?|pageObjects)(?:\/|\.)|\.page\.[jt]s$/.test(p)),
    configFiles, scripts, selectorUsage, warnings,
  };
}

export function selectContextPaths(paths: string[], changes: { path: string }[]): string[] {
  const changed = new Set(changes.map(c => c.path));
  return paths.filter(p =>
    p === 'package.json' || p === 'AGENTS.md' || p === 'README.md' || p === 'tsconfig.json' ||
    /playwright\.config|(^|\/)(?:requirements|acceptance|specification|fixtures?|page-objects?|pageObjects)(?:[/.])|\.page\.[jt]s$/.test(p) ||
    /(^|\/)(?:\.prettierrc|prettier\.config|eslint\.config)/.test(p) || isTestFile(p) || changed.has(p),
  ).sort((a, b) => {
    const priority = (p: string) => p === 'package.json' ? 0 : /playwright\.config/.test(p) ? 1 : changed.has(p) ? 2 : isTestFile(p) ? 3 : 4;
    return priority(a) - priority(b) || a.localeCompare(b);
  });
}
