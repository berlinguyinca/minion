#!/usr/bin/env bash
# Fake claude CLI binary for integration tests.
# Outputs deterministic JSONL in claude's event stream format.
set -euo pipefail

cat <<'EOF'
{"type":"system","subtype":"init","cwd":"/tmp/test-repo","session_id":"fake-session-001","tools":[],"mcp_servers":[],"model":"claude-opus-4-5","permissionMode":"default","apiKeySource":"env"}
{"type":"assistant","message":{"id":"msg_fake001","type":"message","role":"assistant","content":[{"type":"text","text":"I'll implement the requested changes now."}],"model":"claude-opus-4-5","stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":50}},"session_id":"fake-session-001"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":1500,"duration_api_ms":1200,"num_turns":1,"result":"Task completed successfully. Created src/feature.ts with the implementation.","session_id":"fake-session-001","total_cost_usd":0.005}
EOF
