export type Change = { path: string; status: string; patch?: string };
export type Snapshot = {
  repository: string;
  head: string;
  paths: string[];
  files: Record<string, string>;
  changes: Change[];
  warnings: string[];
};

export type Profile = {
  framework: 'playwright' | 'unsupported';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  testDirectory: string | null;
  testFiles: string[];
  fixtureFiles: string[];
  pageObjectFiles: string[];
  configFiles: string[];
  scripts: Record<string, string>;
  selectorUsage: Record<string, number>;
  warnings: string[];
};

export type Proposal = {
  decision: 'propose_tests' | 'no_change' | 'needs_context';
  summary: string;
  reasons: string[];
  files: { path: string; content: string; reason: string }[];
};

export type Report = {
  repository: string;
  head: string;
  profile: Profile;
  proposal: Proposal;
  validation: { browserExecution: 'not_run'; humanReviewRequired: true };
};

export type Push = {
  repository: string;
  installationId: number;
  ref: string;
  base: string;
  head: string;
};

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'superseded';
export type Job = Push & {
  id: string;
  deliveryId: string;
  status: JobStatus;
  createdAt: string;
  result: Report | null;
  error: string | null;
};

export interface Source {
  branchHead(repository: string, ref: string): Promise<string | null>;
  snapshot(push: Push): Promise<Snapshot>;
}

export interface Model {
  propose(snapshot: Snapshot, profile: Profile): Promise<Proposal>;
}

export class ContextError extends Error {}
export class RemoteError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
