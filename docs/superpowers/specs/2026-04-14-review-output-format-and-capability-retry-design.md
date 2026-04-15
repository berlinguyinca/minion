# Review Output Formatting and Capability Retry Design

## Context

The review pipeline currently emits raw AI error payloads directly to the console. When the AI layer fails, the user sees long JSON blobs embedded in log lines such as:

`[review] Failed to process PR #12: AI invocation failed (model: map, exit: 1): {"version":1,"success":false,...}`

That is hard to scan in a live terminal and it hides the actual failure reason. The review flow also treats every failed PR the same way, which means PRs that fail because of temporary capability gaps or AI-layer instability can get stuck behind the normal retry gate.

## Goal

Make review/merge failure output readable in the terminal and allow PRs that failed because of AI capability issues to be retried on later runs instead of being treated as permanent failures.

## Scope

### In scope

- Replace raw AI error strings in console output with concise, human-readable summaries.
- Ensure the summaries stay single-line and do not include embedded JSON payloads.
- Add a retryable failure signal for AI capability issues.
- Keep retryable PR failures eligible for another review attempt even when the normal retry limit or backoff would otherwise block them.
- Apply the same formatting path to review, merge, and issue-processing AI failure logs so the console output stays consistent.
- Add tests that verify both the formatted output and the retry behavior.

### Out of scope

- Changing GitHub comment templates beyond the existing error summary behavior.
- Changing merge logic, rebase logic, or provider selection.
- Introducing new AI providers or changing prompt contracts.

## Design

### Recommended approach

Use a shared AI error classifier/formatter in `src/ai/errors.ts` that returns:

- a short human-readable message for console/state output
- a boolean indicating whether the failure should be treated as retryable

The classifier should collapse the current raw provider messages into concise text and strip embedded JSON where present. It should also mark capability-style AI failures as retryable, so the PR stays eligible for another pass on a future run.

For this design, “capability-style” means AI failures that look like unsupported features or provider contract failures, including:

- `AIInvocationError` messages that contain phrases such as `unsupported`, `not supported`, `capability`, or `cannot handle`
- AI invocation payloads that embed a structured failure response with `success: false`
- rate-limit and timeout failures that should be retried automatically once the next run starts

Environment failures such as a missing binary remain non-retryable, because they require setup changes rather than another review pass.

### Retry policy

Add an optional retryable marker to PR outcomes in state. `StateManager.shouldReviewPR()` should continue using the existing rules for normal failures, but it should allow retryable failures to bypass the max-attempt/backoff gate.

This keeps the current protection against repeated ordinary failures while making capability-related failures retriable as the AI layer improves.

### Console output

All user-facing AI failure logs should use the shared formatter before printing:

- `PipelineRunner` should log formatted error text for review and merge failures.
- `PRReviewProcessor`, `MergeProcessor`, and `IssueProcessor` should avoid returning or logging raw AI invocation payloads.
- The output should stay line-oriented and readable in a terminal, with no JSON blobs pasted into the prefix line.

### Alternatives considered

1. **Format logs only, leave retry logic unchanged**
   - Rejected because it improves readability but still leaves capability failures stuck behind the retry gate.

2. **Add a dedicated `retryable` flag to PR outcomes and keep the existing retry policy for everything else**
   - Recommended because it is the smallest change that solves both the formatting and reattempt problems without changing normal failure handling.

3. **Create a broader error taxonomy and state machine for AI failures**
   - Rejected for now because it would be more invasive than the current problem requires.

## Files likely touched

- `src/ai/errors.ts`
- `src/config/state.ts`
- `src/pipeline/runner.ts`
- `src/pipeline/pr-review-processor.ts`
- `src/pipeline/merge-processor.ts`
- `src/pipeline/issue-processor.ts`
- `src/types/index.ts`
- `test/unit/ai/errors.test.ts`
- `test/unit/config/state.test.ts`
- `test/unit/pipeline/runner.test.ts`
- `test/unit/pipeline/pr-review-processor.test.ts`
- `test/unit/pipeline/merge-processor.test.ts`

## Acceptance criteria

- [ ] Review and merge failure logs no longer print raw JSON payloads from the AI provider.
- [ ] The review failure line for a PR remains readable as a short human message on one line.
- [ ] PR failures classified as capability-related remain eligible for another review attempt on the next run.
- [ ] Non-capability failures still respect the existing max-attempt/backoff behavior.
- [ ] Existing merge and review behavior remains unchanged apart from error formatting and retry eligibility.
- [ ] Tests cover the formatter, the retryable-state path, and the console output path.

## Test plan

- Add unit tests for the AI error formatter/classifier.
- Add state-manager tests proving retryable PR failures bypass the normal retry gate.
- Add runner tests proving review/merge failure logs use the formatted message instead of raw AI JSON.
- Run the relevant unit test files and the full test suite if the local changes touch shared plumbing.
