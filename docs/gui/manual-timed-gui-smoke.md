# Manual timed GUI smoke test

Use this checklist when validating against a real GitHub account in Electron.

## Setup
1. Ensure `GITHUB_TOKEN` or `gh auth token` is available.
2. Optional: configure `config.yaml` with frequently used repos.
3. Start the GUI with the normal project command.

## Timing checkpoints
Record wall-clock times from launch or action start:

| Checkpoint | Target | Actual | Notes |
| --- | ---: | ---: | --- |
| Window visible | < 2s |  |  |
| Cached/configured repos visible | < 1s after window |  |  |
| Full GitHub repo refresh complete | account-dependent |  |  |
| Type `owner/name` and press Enter -> issue list starts | < 1s |  |  |
| Cached issues visible on repeated repo select | < 500ms |  |  |
| First issue page visible on uncached repo | < 3s typical |  |  |
| Issue detail/comments visible | < 2s typical |  |  |

## Functional checks
- Pin/unpin a repo and confirm it appears first after reload.
- Open Settings and clear GitHub cache.
- Confirm cache status changes between cached/refreshing/fresh/unchanged.
- Confirm issue body and comments still load after clearing cache.
