import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Job, JobStatus, Push, Report } from './types.ts';

export class JobStore {
  #db: DatabaseSync;
  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, delivery_id TEXT UNIQUE NOT NULL,
        repository TEXT NOT NULL, installation_id INTEGER NOT NULL, ref TEXT NOT NULL,
        base TEXT NOT NULL, head TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, result TEXT, error TEXT,
        UNIQUE(repository, ref, head)
      );
      CREATE TABLE IF NOT EXISTS model_calls (started_at INTEGER NOT NULL);
    `);
  }
  close(): void { this.#db.close(); }
  recover(): void { this.#db.exec("UPDATE jobs SET status='queued' WHERE status='running'"); }

  enqueue(deliveryId: string, push: Push): { duplicate: boolean; job: Job } {
    const existing = this.#db.prepare('SELECT * FROM jobs WHERE delivery_id=? OR (repository=? AND ref=? AND head=?)').get(deliveryId, push.repository, push.ref, push.head);
    if (existing) return { duplicate: true, job: this.#decode(existing) };
    const id = randomUUID();
    this.#db.prepare('INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)').run(
      id, deliveryId, push.repository, push.installationId, push.ref, push.base, push.head, 'queued', new Date().toISOString(),
    );
    return { duplicate: false, job: this.get(id)! };
  }

  claim(): Job | null {
    const row = this.#db.prepare(`UPDATE jobs SET status='running'
      WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1)
      RETURNING *`).get();
    return row ? this.#decode(row) : null;
  }
  finish(id: string, status: JobStatus, result: Report | null = null, error: string | null = null): void {
    this.#db.prepare('UPDATE jobs SET status=?, result=?, error=? WHERE id=?').run(status, result ? JSON.stringify(result) : null, error, id);
  }
  reserveModelCall(limit: number, now = Date.now()): boolean {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      this.#db.prepare('DELETE FROM model_calls WHERE started_at <= ?').run(now - 3_600_000);
      const count = this.#db.prepare('SELECT COUNT(*) AS n FROM model_calls').get()!;
      const allowed = Number(count.n) < limit;
      if (allowed) this.#db.prepare('INSERT INTO model_calls VALUES (?)').run(now);
      this.#db.exec('COMMIT');
      return allowed;
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): Job | null {
    const row = this.#db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    return row ? this.#decode(row) : null;
  }
  pendingCount(): number { return Number(this.#db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get()!.n); }
  retry(id: string): boolean {
    const job = this.get(id);
    if (!job || !(job.status === 'failed' || (job.status === 'completed' && job.result?.proposal.decision === 'needs_context'))) return false;
    this.#db.prepare("UPDATE jobs SET status='queued', result=NULL, error=NULL WHERE id=?").run(id);
    return true;
  }
  list(): Job[] { return this.#db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT 50').all().map(row => this.#decode(row)); }

  #decode(row: Record<string, unknown>): Job {
    return {
      id: String(row.id), deliveryId: String(row.delivery_id), repository: String(row.repository),
      installationId: Number(row.installation_id), ref: String(row.ref), base: String(row.base), head: String(row.head),
      status: row.status as JobStatus, createdAt: String(row.created_at),
      result: row.result ? JSON.parse(String(row.result)) as Report : null,
      error: row.error ? String(row.error) : null,
    };
  }
}
