#!/usr/bin/env bash
# Fake codex CLI binary for integration tests.
# Outputs deterministic JSONL in codex event stream format.
set -euo pipefail

cat <<'EOF'
{"type":"session","id":"fake-codex-session-001","model":"o3"}
{"type":"message","role":"assistant","id":"msg_codex_001","content":[{"type":"output_text","text":"Analyzing the issue and implementing the solution..."}]}
{"type":"message","role":"assistant","id":"msg_codex_002","content":[{"type":"output_text","text":"Implementation complete. Files written: src/feature.ts"}]}
{"type":"session_complete","id":"fake-codex-session-001","usage":{"input_tokens":200,"output_tokens":75},"cost_usd":0.003}
EOF
