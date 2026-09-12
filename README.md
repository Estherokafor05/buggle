# Buggle

Repository-aware AI assistance for maintaining web UI tests.

**Version 0.1: runnable backend starter.** This implementation receives GitHub
push events, reads the affected repository at the pushed commit, learns its
Playwright conventions and stores a reviewable test proposal. The project
repository is [Estherokafor05/buggle](https://github.com/Estherokafor05/buggle).

The included automated checks and demo use local fixtures and mocked remote
services. Live GitHub App authentication and live model output still need to be
validated with deployment credentials. Browser execution and PR publication are
the next development milestones. Every proposal explicitly records
`browserExecution: "not_run"` and `humanReviewRequired: true`.

## Run locally without credentials

Use Node.js 24.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run demo
npm run inspect -- examples/shop
```

The demo writes `.buggle/demo-report.json`. It exercises the queue, repository
profile, proposal validation and stored result using a deterministic model
fixture. It makes no external requests. `examples/shop` supplies repository
evidence; it does not include a running web application.

Inspect an existing repository without changing it or running its scripts:

```sh
npm run inspect -- /path/to/application
```

## Implemented

| Component | Behaviour |
| --- | --- |
| Webhook ingress | Verify HMAC against raw request bytes; constrain repository and installation; queue branch pushes |
| Persistent queue | SQLite, duplicate delivery/commit detection, restart recovery, bounded pending jobs |
| Commit checks | Compare with the live branch before and after generation; discard outdated proposals |
| GitHub App adapter | Obtain a short-lived token scoped to one repository and read-only contents access |
| Repository profile | Detect Playwright, package manager, scripts, test directories, fixtures, page objects and selector usage |
| Context handling | Read source at the pushed SHA; stop for incomplete, oversized or ambiguous context |
| AI adapter | Send bounded repository evidence to OpenAI Responses with a strict JSON output schema |
| Proposal checks | Restrict proposed paths; flag obvious skips, sleeps, assertion changes and other prohibited patterns |
| Run API | Authenticated list, detail and retry endpoints |
| Usage control | Persistent hourly model call cap and one active worker |
| CI | Type checking, automated tests and offline demo on pushes and PRs |

## Start a configured service

1. Create a GitHub App with **Contents: Read-only** and subscribe to **Push**.
   GitHub provides metadata access for installed repositories.
2. Install it on a selected application repository with existing Playwright tests.
3. Deploy this Node service with a persistent disk for its SQLite database and
   an HTTPS reverse proxy. Set the App webhook URL to
   `https://your-buggle-host/webhooks/github`.
4. Copy `.env.example` to `.env` and populate the App ID, installation ID, private
   key file path, webhook secret, API token and model credentials. Set
   `BUGGLE_REPOSITORY` to the application containing the tests.
5. Set `BUGGLE_TEST_DIR` explicitly if the existing tests use multiple directories
   or custom fixture imports that make automatic inference ambiguous.
6. Run `npm start`. Request `/health`, then send a GitHub test delivery and push a
   small source change to a configured branch.

The ChatGPT GitHub connection is separate from the GitHub App credentials used
by the running Buggle service. This starter contains no credentials.

Source context is submitted to the configured model provider during a live run.
The adapter sets `store: false`. That setting does not make a broader assertion
about provider retention or account-specific data controls.

See [Operations](docs/OPERATIONS.md) for endpoints and operational limits,
[Architecture](docs/ARCHITECTURE.md) for the workflow and
[Next milestones](docs/NEXT_MILESTONES.md) for the remaining MVP work.

## Verification

Locally verified on 12 September 2026 with Node 24.19.0:

- TypeScript check passed.
- 23 automated tests passed, including an HTTP webhook-to-result integration test.
- Offline demo completed and produced a proposal marked as unexecuted.
- Sample repository inspection identified its Playwright conventions.

Remote GitHub and OpenAI calls are mocked in the automated checks. No live model
request, live application browser run or remote PR creation is claimed.

## References

- [GitHub webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub commit comparisons](https://docs.github.com/en/rest/commits/commits#compare-two-commits)
- [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
