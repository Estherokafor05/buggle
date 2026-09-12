# Operations

## API

| Method | Path | Authentication | Result |
| --- | --- | --- | --- |
| GET | `/health` | None | Service liveness only |
| POST | `/webhooks/github` | GitHub HMAC signature | Queued job ID or ignored event |
| GET | `/runs` | `Authorization: Bearer <BUGGLE_API_TOKEN>` | Latest 50 runs, excluding generated file bodies |
| GET | `/runs/{id}` | Bearer token | Full run and proposal |
| POST | `/runs/{id}/retry` | Bearer token | Requeue a failed or needs-context run |

Webhook acknowledgements happen after the job is persisted and before model
work. A successfully processed job can still require more context; inspect
`result.proposal.decision` in addition to the job status. Deleted branches, tags
and Buggle's own branches/bot pushes are ignored.

## Deployment

Run one service process per database on Node 24. Use a persistent disk and
back up the SQLite database using a SQLite-aware backup procedure. The starter
is not configured for horizontal scaling, a shared multi-tenant service or
serverless request-only runtimes. Startup requeues work that was interrupted
while running. After a crash, generation may be repeated and incur a second
model charge; no exactly-once model billing guarantee is made.

The default bind address is `127.0.0.1`. If using a container, choose the bind
address appropriate for its reverse proxy. Use HTTPS for externally accessible
webhooks and API requests. Keep the database and App private key out of the
repository; configure credentials through local environment files or the
deployment's secrets manager. The run detail API contains repository source.

## Initial limits

- One repository, one installation and one active analysis worker.
- 500 pending jobs; excess deliveries receive HTTP 503 for later redelivery.
- 2 MB webhook body and 15-second HTTP request deadline.
- 5,000 repository tree entries; no truncated Git trees.
- Fewer than 300 comparison files; larger comparisons require review.
- 40 relevant context files, at most 32 KB each and 96 KB of total source.
- 48 KB of changed-file patch text.
- At most three proposed test files, 20,000 characters each.
- Default 10 model calls per hour; configurable up to 100.
- 6,000 maximum model output tokens per request; 60-second model request timeout.

These limits bound the first pilot. They do not enforce a monetary spending
cap. Set usage alerts and monitor actual spend; an enforceable currency budget
requires additional metering and admission controls.

No worker retries are automatic. Inspect the failure, correct configuration or
wait for the hourly budget to reset, then use the authenticated retry endpoint.
Superseded jobs cannot be retried because a newer branch revision exists.

## Context that needs review

New branches with an all-zero comparison base, rewritten/diverged history,
incomplete patches and repositories beyond the context limits are stopped.
Monorepo package selection, custom test directory inference and requirements
retrieval from issue trackers remain future work. No test configuration is
executed merely to discover its settings.

Proposed test code is never marked as passing. Browser execution,
typechecking/linting of generated tests in the target repository and evidence
artifacts still need an execution service. The CI in this project checks
Buggle's own backend, rather than the proposed customer tests.
