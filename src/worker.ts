import { ContextError, RemoteError } from './types.ts';
import type { Model, Profile, Report, Snapshot, Source } from './types.ts';
import { profileRepository, relevantChanges } from './profile.ts';
import { validateProposal } from './model.ts';
import type { JobStore } from './store.ts';

function report(snapshot: Snapshot, profile: Profile, summary: string, decision: 'no_change' | 'needs_context', reasons: string[]): Report {
  return {
    repository: snapshot.repository, head: snapshot.head, profile,
    proposal: { decision, summary, reasons, files: [] },
    validation: { browserExecution: 'not_run', humanReviewRequired: true },
  };
}

export async function analyse(
  snapshot: Snapshot, model: Model, options: { testDirectory?: string; reserveModelCall?: () => boolean } = {},
): Promise<Report> {
  const profile = profileRepository(snapshot, options.testDirectory);
  if (!relevantChanges(snapshot).length) return report(snapshot, profile, 'No supported UI source changes to analyse.', 'no_change', ['No model call was needed.']);
  if (profile.framework !== 'playwright' || !profile.testDirectory || profile.warnings.length) {
    return report(snapshot, profile, 'Repository context needs review before generating tests.', 'needs_context', [
      ...(profile.framework !== 'playwright' ? ['This version requires an existing Playwright project.'] : []),
      ...profile.warnings,
    ]);
  }
  if (options.reserveModelCall && !options.reserveModelCall()) return report(snapshot, profile, 'Hourly model call limit reached.', 'needs_context', ['Retry in a later hour after reviewing usage.']);
  try {
    const proposal = validateProposal(await model.propose(snapshot, profile), snapshot, profile);
    return { repository: snapshot.repository, head: snapshot.head, profile, proposal,
      validation: { browserExecution: 'not_run', humanReviewRequired: true } };
  } catch (error) {
    if (error instanceof ContextError) return report(snapshot, profile, 'Proposal needs manual review.', 'needs_context', [error.message]);
    throw error;
  }
}

export async function processNext(
  store: JobStore, source: Source, model: Model,
  options: { testDirectory?: string; maxCallsPerHour: number },
): Promise<boolean> {
  const job = store.claim();
  if (!job) return false;
  try {
    // Check GitHub's live branch, not webhook arrival order. Delayed deliveries cannot replace a newer result.
    if (await source.branchHead(job.repository, job.ref) !== job.head) {
      store.finish(job.id, 'superseded'); return true;
    }
    const snapshot = await source.snapshot(job);
    if (snapshot.repository !== job.repository || snapshot.head !== job.head) throw new Error('Source returned a different revision.');
    if (await source.branchHead(job.repository, job.ref) !== job.head) {
      store.finish(job.id, 'superseded'); return true;
    }
    const result = await analyse(snapshot, model, {
      testDirectory: options.testDirectory,
      reserveModelCall: () => store.reserveModelCall(options.maxCallsPerHour),
    });
    if (await source.branchHead(job.repository, job.ref) !== job.head) store.finish(job.id, 'superseded');
    else store.finish(job.id, 'completed', result);
  } catch (error) {
    // Never store arbitrary network errors, payloads, credentials or stack traces in API-visible results.
    const message = error instanceof ContextError || error instanceof RemoteError ? error.message : 'Analysis failed. Check connectivity and service configuration, then retry.';
    store.finish(job.id, 'failed', null, message);
  }
  return true;
}
