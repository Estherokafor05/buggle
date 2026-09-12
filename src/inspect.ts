import { inspectLocal } from './local.ts';
import { profileRepository } from './profile.ts';

const directory = process.argv[2];
if (!directory) { console.error('Usage: npm run inspect -- /path/to/repository'); process.exitCode = 1; }
else {
  try { console.log(JSON.stringify(profileRepository(await inspectLocal(directory), process.env.BUGGLE_TEST_DIR), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Inspection failed.'); process.exitCode = 1; }
}
