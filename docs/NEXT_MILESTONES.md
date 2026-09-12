# Next milestones

## 1. Review the initial backend

The project repository is
[Estherokafor05/buggle](https://github.com/Estherokafor05/buggle). Review the
starter on its development branch and draft PR. Run the included backend CI
before merging the code into the default branch.

Acceptance: code is committed to the chosen repository and CI passes on its PR.

## 2. Exercise a real integration

Register Buggle's own GitHub App, deploy the webhook service and configure a
small application repository with existing Playwright tests and clear
acceptance criteria. Supply runtime credentials securely. Push a small UI
change and review the resulting AI-generated proposal.

Acceptance: a real signed push produces a grounded proposal tied to the exact
commit; duplicate and stale deliveries are handled correctly; missing
requirements remain visible. Record provider usage and end-to-end latency.

## 3. Execute generated tests in isolation

Build an ephemeral runner for the application's pinned revision and proposed
test files. Use reviewed install/test commands, a commit-specific preview URL
and isolated test accounts. Keep model credentials and repository write tokens
out of the execution environment. Collect a Playwright report, trace,
screenshots, exit status and application revision. Distinguish environment
failure, test failure and inconclusive results.

Acceptance: a known passing journey runs successfully and a seeded application
regression fails without the agent weakening the expected result. Reports
record precisely what ran, including retries.

## 4. Publish test changes through draft PRs

Add a separate writer with Contents and Pull Requests write permissions. Limit
changes to reviewed test paths, recheck the source SHA and create a Buggle
branch based on that SHA. Publish execution evidence, rationale and unresolved
questions in a draft PR. Reuse one proposal PR for the relevant change and
avoid triggering Buggle recursively.

Acceptance: the PR contains only intended test changes, targets the correct
source branch and requires a person to approve and merge it.

## 5. Pilot operations

Add installation onboarding, repository profile approval, run visibility,
spending controls, tenant isolation and retention controls before serving
multiple companies. Evaluate using known changes, seeded regressions and
ambiguous requirements. Track acceptance rate, test validity, flakiness,
regressions caught, maintenance time and cost per accepted test change.
