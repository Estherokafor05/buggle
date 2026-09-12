export type BrowserRunStatus = 'passed' | 'application_failure' | 'outdated_tests' | 'environment_failure' | 'inconclusive';
export type ReviewedCommand = readonly [string, ...string[]];
export type RevisionExecution = { revision: string; phase: 'completed' | 'environment_failure'; exitCode: number | null; report: string | null; traces: string[]; screenshots: string[]; retries: number | null; failedTests: string[]; error?: string };
export type BrowserRunRequest = { repository: string; baseRevision: string; headRevision: string; files: { path: string; content: string }[]; installCommand: ReviewedCommand; testCommand: ReviewedCommand; previewUrl: string };
export type BrowserRunReport = { repository: string; baseRevision: string; headRevision: string; status: BrowserRunStatus; explanation: string; executions: RevisionExecution[]; humanReviewRequired: true };

/** Implementations must provision an ephemeral sandbox and must not inherit service credentials. */
export interface RevisionSandbox { execute(request: BrowserRunRequest, revision: string): Promise<RevisionExecution>; }

function sameFailures(a: RevisionExecution, b: RevisionExecution): boolean {
  return a.failedTests.length > 0 && a.failedTests.length === b.failedTests.length && a.failedTests.every((failure, index) => failure === b.failedTests[index]);
}

export async function runReviewedProposal(request: BrowserRunRequest, sandbox: RevisionSandbox): Promise<BrowserRunReport> {
  if (request.files.length === 0) throw new Error('At least one reviewed test file is required.');
  if (request.baseRevision === request.headRevision) throw new Error('Base and head revisions must differ.');
  for (const revision of [request.baseRevision, request.headRevision]) {
    if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error('Runner revisions must be full commit SHAs.');
  }
  if (!request.installCommand[0] || !request.testCommand[0]) throw new Error('Reviewed commands cannot be empty.');
  if (!request.previewUrl.startsWith('https://')) throw new Error('The preview URL must use HTTPS.');
  const paths = new Set<string>();
  for (const file of request.files) {
    if (!file.path || file.path.startsWith('/') || file.path.split('/').includes('..') || paths.has(file.path)) {
      throw new Error('Reviewed test paths must be unique repository-relative paths.');
    }
    paths.add(file.path);
  }
  const head = await sandbox.execute(request, request.headRevision);
  if (head.phase === 'environment_failure') return result(request, 'environment_failure', 'The head revision could not be prepared or executed.', [head]);
  if (head.exitCode === 0) return result(request, 'passed', 'The reviewed tests passed at the application revision.', [head]);
  if (!head.report) return result(request, 'inconclusive', 'The test command failed without a readable Playwright report.', [head]);

  // Run the identical reviewed tests at base. Assertions are never rewritten to obtain a pass.
  const base = await sandbox.execute(request, request.baseRevision);
  if (base.phase === 'environment_failure' || !base.report) return result(request, 'inconclusive', 'The head failed, but the base comparison could not produce test evidence.', [head, base]);
  if (base.exitCode === 0) return result(request, 'application_failure', 'The tests pass at the base revision and fail at the head revision.', [head, base]);
  if (sameFailures(head, base)) return result(request, 'outdated_tests', 'The same tests fail at both revisions; the reviewed tests or their assumptions are outdated.', [head, base]);
  return result(request, 'inconclusive', 'Both revisions fail, but with different test failures.', [head, base]);
}

function result(request: BrowserRunRequest, status: BrowserRunStatus, explanation: string, executions: RevisionExecution[]): BrowserRunReport {
  return { repository: request.repository, baseRevision: request.baseRevision, headRevision: request.headRevision, status, explanation, executions, humanReviewRequired: true };
}
