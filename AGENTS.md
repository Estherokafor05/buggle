# Working on Buggle

- Use Node 24 and erasable TypeScript with explicit `.ts` imports.
- Keep the existing single-repository scope explicit until tenancy is implemented.
- Do not execute repository or generated test code in the webhook/model process.
- Do not weaken, skip or remove assertions to obtain a passing result.
- Generated test proposals require human review. Mark browser execution as
  `not_run` until an actual isolated runner supplies evidence.
- Keep credentials out of committed files and generated reports.
- Use injected adapters and fixtures for automated checks; do not incur live
  model charges during CI.
- Verify behaviour changes with `npm test` and `npm run typecheck`.
- Use `npm run demo` to verify the documented offline workflow.
- Keep README status and milestone documentation aligned with implemented code.
