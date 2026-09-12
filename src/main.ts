import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readConfig } from './config.ts';
import { GithubSource } from './github.ts';
import { OpenAIModel } from './model.ts';
import { JobStore } from './store.ts';
import { createBuggleServer } from './server.ts';
import { processNext } from './worker.ts';

const config = readConfig();
mkdirSync(dirname(config.dbPath), { recursive: true, mode: 0o700 });
const store = new JobStore(config.dbPath);
store.recover(); // One service process per database; see docs/OPERATIONS.md.
const source = new GithubSource(config);
const model = new OpenAIModel(config.openaiKey, config.openaiModel);
const server = createBuggleServer(store, config);
let current: Promise<unknown> | null = null;
let stopping = false;
const timer = setInterval(() => {
  if (current || stopping) return;
  current = processNext(store, source, model, config).catch(() => {
    console.error('Worker could not process the queue; check database availability.');
  }).finally(() => { current = null; });
}, 500);
server.listen(config.port, config.host, () => console.log(`Buggle listening on ${config.host}:${config.port}`));
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true; clearInterval(timer);
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (current) await current;
  store.close();
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
server.on('error', error => { console.error(error.message); void stop(); process.exitCode = 1; });
