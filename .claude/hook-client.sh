#!/bin/bash

# Debug mode - set by --debug flag or DEBUG environment variable
DEBUG_MODE="${DEBUG:-false}"

# Helper function for debug logging
debug_log() {
    if [[ "$DEBUG_MODE" == "true" ]]; then
        echo "[DEBUG] $*" >&2
    fi
}

# Parse arguments
ARGS=()
for arg in "$@"; do
    case $arg in
        --debug)
            DEBUG_MODE="true"
            ;;
        *)
            ARGS+=("$arg")
            ;;
    esac
done

# Parse remaining arguments: [event] [URL]
if [[ ${#ARGS[@]} -eq 0 ]]; then
    echo "Error: Missing command argument" >&2
    echo "" >&2
    echo "Usage: ./hook-client.sh {stop|test} [--debug]" >&2
    echo "" >&2
    echo "  stop    Send stop event (requires JSON input)" >&2
    echo "  test    Send test message" >&2
    echo "" >&2
    echo "For Claude Code hooks, use: ./hook-client.sh stop" >&2
    exit 1
fi
EVENT="${ARGS[0]}"

# Docker detection
IS_DOCKER=false
if [[ -f /.dockerenv ]] || grep -q 'docker\|kubepods' /proc/self/cgroup 2>/dev/null; then
    IS_DOCKER=true
fi

# Determine base URL
if [[ -n "${HOOK_SERVER_URL}" ]]; then
    # Use environment variable if set
    BASE_URL="${HOOK_SERVER_URL}"
elif [[ "$IS_DOCKER" == "true" ]]; then
    # Use host.docker.internal in Docker
    BASE_URL="http://host.docker.internal:8191"
else
    # Default to localhost
    BASE_URL="${ARGS[1]:-http://localhost:8191}"
fi

debug_log "Docker environment: $IS_DOCKER"
debug_log "Using base URL: $BASE_URL"

# Handle supported events
if [[ "$EVENT" != "stop" && "$EVENT" != "test" ]]; then
    debug_log "Unknown event: $EVENT. Supported events: stop, test"
    exit 1
fi

# Set endpoint based on event
if [[ "$EVENT" == "test" ]]; then
    ENDPOINT="$BASE_URL/stop"
    DEBUG_MODE="true"  # Always enable debug mode for test
else
    ENDPOINT="$BASE_URL/$EVENT"
fi
debug_log "Endpoint: $ENDPOINT"

# Create temp file for JSON
TMPFILE=$(mktemp)

# Ensure cleanup on exit
trap 'rm -f "$TMPFILE" 2>/dev/null' EXIT INT TERM

# Build JSON payload based on event type
if [[ "$EVENT" == "test" ]]; then
    debug_log "Building test JSON payload"
    # Generate current timestamp in ISO 8601 format
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$TMPFILE" <<EOF
{
  "hostname": "$(hostname)",
  "session_id": "test-session-$TIMESTAMP",
  "transcript_path": "",
  "transcript": [
    {
      "type": "assistant",
      "message": {
        "content": [
          {
            "text": "テスト - $TIMESTAMP"
          }
        ]
      }
    }
  ],
  "stop_hook_active": false,
  "test_mode": true
}
EOF
    
    if [[ "$DEBUG_MODE" == "true" ]]; then
        debug_log "Test JSON payload:"
        cat "$TMPFILE" >&2
    fi
else
    # Handle stop event (existing logic)
    # Read JSON from stdin
    INFILE=$(mktemp)
    cat > $INFILE
    trap 'rm -f "$INFILE" "$TMPFILE" 2>/dev/null' EXIT INT TERM

    # Extract transcript_path
    if [[ "$DEBUG_MODE" == "true" ]]; then
        TRANSCRIPT_PATH=$(cat "$INFILE" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    else
        TRANSCRIPT_PATH=$(cat "$INFILE" 2>/dev/null | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    fi
    debug_log "Transcript path: $TRANSCRIPT_PATH"

    # Expand ~ to home directory
    TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

    # Build output
    if [[ -f "$TRANSCRIPT_PATH" ]]; then
        debug_log "Building JSON with transcript"
        # Build JSON with escaped newlines
        cat > "$TMPFILE" <<EOF
{
  "hostname": "$(hostname)",
  "session_id": "$(if [[ "$DEBUG_MODE" == "true" ]]; then cat "$INFILE" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' || true; else cat "$INFILE" 2>/dev/null | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true; fi)",
  "transcript_path": "$TRANSCRIPT_PATH",
  "transcript": [
$(if [[ "$DEBUG_MODE" == "true" ]]; then tail -n 5 "$TRANSCRIPT_PATH" | awk '{ if (NR > 1) printf ",\n    "; printf "%s", $0 } END { print "" }' || true; else tail -n 5 "$TRANSCRIPT_PATH" 2>/dev/null | awk '{ if (NR > 1) printf ",\n    "; printf "%s", $0 } END { print "" }' 2>/dev/null || true; fi)
  ],
  "stop_hook_active": $(if [[ "$DEBUG_MODE" == "true" ]]; then cat "$INFILE" | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*[^,}]*' | sed 's/.*:[[:space:]]*//' || echo "false"; else cat "$INFILE" 2>/dev/null | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*[^,}]*' 2>/dev/null | sed 's/.*:[[:space:]]*//' 2>/dev/null || echo "false"; fi)
}
EOF
    else
        debug_log "Transcript path not found, using original input"
        cp "$INFILE" "$TMPFILE"
    fi
fi

# Send request
if [[ "$DEBUG_MODE" == "true" ]]; then
    debug_log "Sending request to $ENDPOINT"
    RESPONSE=$(curl -sS -X POST "$ENDPOINT" -H 'Content-Type: application/json' --data @"$TMPFILE" 2>&1) || {
        debug_log "curl failed with exit code $?"
        debug_log "Response/Error: $RESPONSE"
        true
    }
    if [[ -n "$RESPONSE" ]]; then
        debug_log "Server response: $RESPONSE"
    fi
else
    curl -sS -X POST "$ENDPOINT" -H 'Content-Type: application/json' --data @"$TMPFILE" 2>/dev/null || true
fi
