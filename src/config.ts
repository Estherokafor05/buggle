import { readFileSync } from 'node:fs';
import { safePath } from './security.ts';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Set ${key} before starting Buggle.`);
    return value;
  };
  const integer = (key: string, fallback?: number): number => {
    const value = env[key] ? Number(env[key]) : fallback;
    if (value === undefined || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
    return value;
  };
  const repository = required('BUGGLE_REPOSITORY');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9._-]+$/.test(repository)) throw new Error('BUGGLE_REPOSITORY must be owner/repository.');
  const webhookSecret = required('GITHUB_WEBHOOK_SECRET');
  const apiToken = required('BUGGLE_API_TOKEN');
  if (webhookSecret.length < 32 || apiToken.length < 32 || webhookSecret === apiToken) throw new Error('Use distinct webhook and API secrets of at least 32 characters.');
  const testDirectory = env.BUGGLE_TEST_DIR?.trim() || undefined;
  if (testDirectory && (!safePath(testDirectory) || testDirectory.startsWith('.'))) throw new Error('BUGGLE_TEST_DIR must be a relative test directory.');
  const port = integer('PORT', 3000);
  if (port > 65535) throw new Error('PORT must be at most 65535.');
  const maxCallsPerHour = integer('BUGGLE_MAX_MODEL_CALLS_PER_HOUR', 10);
  if (maxCallsPerHour > 100) throw new Error('This starter caps model calls at 100 per hour.');
  return {
    repository, installationId: integer('GITHUB_INSTALLATION_ID'), appId: required('GITHUB_APP_ID'),
    privateKey: readFileSync(required('GITHUB_APP_PRIVATE_KEY_PATH'), 'utf8'),
    webhookSecret, apiToken, testDirectory, port, maxCallsPerHour,
    host: env.HOST || '127.0.0.1', dbPath: env.BUGGLE_DB_PATH || '.buggle/jobs.sqlite',
    botLogin: env.BUGGLE_BOT_LOGIN || 'buggle[bot]',
    openaiKey: required('OPENAI_API_KEY'), openaiModel: required('OPENAI_MODEL'),
  };
}
