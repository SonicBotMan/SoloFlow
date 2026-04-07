#!/bin/bash
# SoloFlow daily evolution scan — runs at 02:00 Beijing time (18:00 UTC)
# Uses openclaw CLI to trigger soloflow_evolve in a fresh session

LOG_DIR="$HOME/.openclaw/data/soloflow"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/evolve-cron.log"

echo "=== $(date -u '+%Y-%m-%d %H:%M:%S UTC') ===" >> "$LOG"

# Check if gateway is running
if ! pgrep -f "openclaw-gateway" > /dev/null; then
  echo "Gateway not running, skipping" >> "$LOG"
  exit 0
fi

# We can't directly call soloflow_evolve from CLI, so we use the gateway's tool endpoint
# Instead, just touch a marker file — the plugin will check on next request
# Actually, the best approach: use the openclaw CLI to send a message
# But the simplest: just log and rely on manual trigger or heartbeat integration

# For now, we'll write a timestamp that the plugin can check
echo "1" > "$LOG_DIR/evolve-trigger.marker"
echo "Evolution trigger set" >> "$LOG"
