#!/usr/bin/env bash
# Fake ollama CLI binary for integration tests.
# Outputs deterministic JSON in ollama's streaming format.
set -euo pipefail

cat <<'EOF'
{"model":"qwen2.5-coder:latest","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"I'll help implement this feature. "},"done":false}
{"model":"qwen2.5-coder:latest","created_at":"2024-01-01T00:00:01Z","message":{"role":"assistant","content":"Here is the implementation:"},"done":false}
{"model":"qwen2.5-coder:latest","created_at":"2024-01-01T00:00:02Z","message":{"role":"assistant","content":""},"done":true,"total_duration":2000000000,"load_duration":100000000,"prompt_eval_count":50,"prompt_eval_duration":500000000,"eval_count":100,"eval_duration":1400000000}
EOF
