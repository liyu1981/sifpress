#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAR="$ROOT/var"
PID_FILE="$VAR/dev.pid"
PORT_FILE="$VAR/dev.port"
LOG_FILE="$VAR/dev.log"
ERR_LOG_FILE="$VAR/dev.err.log"

LOG_BACKUPS="${DEV_LOG_BACKUPS:-3}"
STOP_TIMEOUT="${DEV_STOP_TIMEOUT:-10}"

mkdir -p "$VAR"

pid_alive() {
  [ -n "${1:-}" ] && [ -d "/proc/$1" ]
}

get_pid() {
  [ -f "$PID_FILE" ] && cat "$PID_FILE" || true
}

rotate_logs() {
  for f in "$LOG_FILE" "$ERR_LOG_FILE"; do
    for i in $(seq "$LOG_BACKUPS" -1 1); do
      if [ -f "$f.$((i - 1))" ]; then
        mv "$f.$((i - 1))" "$f.$i"
      fi
    done
    if [ -f "$f" ]; then
      mv "$f" "$f.1"
    fi
  done
}

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; exec 3<&-; return 0; } || return 1
}

cmd_start() {
  local pid port
  port="${PORT:-5000}"
  pid="$(get_pid)"

  if [ -n "$pid" ] && pid_alive "$pid"; then
    echo "serve-dev: already running (pid $pid) — stop it first." >&2
    return 1
  fi

  if port_in_use "$port"; then
    echo "serve-dev: port $port is already in use by another process." >&2
    echo "serve-dev: stop that server first, or run with PORT=<other>." >&2
    return 1
  fi

  rotate_logs

  setsid bash -c 'echo $$ > "$1"; exec bash "$2"' _ "$PID_FILE" "$ROOT/dev.sh" \
    >>"$LOG_FILE" 2>>"$ERR_LOG_FILE" < /dev/null &

  echo "$port" > "$PORT_FILE"

  for _ in $(seq 1 30); do
    pid="$(get_pid)"
    [ -n "$pid" ] && pid_alive "$pid" && break
    sleep 0.1
  done

  pid="$(get_pid)"
  if [ -z "$pid" ] || ! pid_alive "$pid"; then
    echo "serve-dev: dev.sh exited immediately — check the logs:" >&2
    [ -f "$ERR_LOG_FILE" ] && tail -n 20 "$ERR_LOG_FILE" >&2 || true
    [ -f "$LOG_FILE" ] && tail -n 20 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE" "$PORT_FILE"
    return 1
  fi

  echo "serve-dev: started (pid $pid) — http://localhost:$port"
  echo "serve-dev: logs → $LOG_FILE, $ERR_LOG_FILE (rotated in $VAR)"
}

cmd_stop() {
  local pid
  pid="$(get_pid)"

  if [ -z "$pid" ]; then
    echo "serve-dev: not running (no pid file)."
    rm -f "$PID_FILE" "$PORT_FILE"
    return 0
  fi

  if ! pid_alive "$pid"; then
    echo "serve-dev: not running (stale pid $pid)."
    rm -f "$PID_FILE" "$PORT_FILE"
    return 0
  fi

  echo "serve-dev: stopping (pid $pid)..."
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true

  local waited=0
  while pid_alive "$pid" && [ "$waited" -lt "$STOP_TIMEOUT" ]; do
    sleep 0.5
    waited=$((waited + 1))
  done

  if pid_alive "$pid"; then
    echo "serve-dev: still alive after ${STOP_TIMEOUT}s — sending SIGKILL."
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi

  rm -f "$PID_FILE" "$PORT_FILE"

  if pid_alive "$pid"; then
    echo "serve-dev: failed to stop pid $pid." >&2
    return 1
  fi

  echo "serve-dev: stopped."
}

cmd_status() {
  local pid
  pid="$(get_pid)"

  if [ -z "$pid" ]; then
    echo "serve-dev: stopped"
    return 0
  fi

  if pid_alive "$pid"; then
    local port
    port="$(cat "$PORT_FILE" 2>/dev/null || echo "${PORT:-5000}")"
    echo "serve-dev: running (pid $pid)"
    echo "  port:     $port"
    echo "  url:      http://localhost:$port"
    echo "  started:  $(ps -o lstart= -p "$pid" 2>/dev/null || echo 'unknown')"
    echo "  uptime:   $(ps -o etime= -p "$pid" 2>/dev/null || echo 'unknown')"
    echo "  pid file: $PID_FILE"
    echo "  logs:     $LOG_FILE"
    echo "            $ERR_LOG_FILE"
  else
    echo "serve-dev: stopped (stale pid $pid)"
  fi
}

cmd_usage() {
  cat <<'EOF'
Usage: serve-dev.sh <start|stop|status>

Commands:
  start    Start dev.sh in the background as a service.
           Output/errors are redirected to var/dev.log and var/dev.err.log
           (rotated into dev.log.1, dev.log.2, ... on each start).
           The pid is stored in var/dev.pid.
  stop     Stop the running dev.sh instance (graceful TERM, then KILL).
  status   Show whether the service is running.

Environment:
  PORT              Port for the dev server (default 5000).
  DEV_LOG_BACKUPS   Number of rotated log generations to keep (default 3).
  DEV_STOP_TIMEOUT  Seconds to wait for graceful stop (default 10).
EOF
}

case "${1:-}" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  status)
    cmd_status
    ;;
  *)
    cmd_usage
    exit 1
    ;;
esac
