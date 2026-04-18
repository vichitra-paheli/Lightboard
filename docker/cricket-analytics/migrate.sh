#!/usr/bin/env bash
# Cricket analytics DB migration orchestrator.
# Pulls data from source cricket DB (default localhost:5434) into a fresh
# dockerized postgres on localhost:5436 with a minimal analytics.* schema.
#
# Usage:
#   ./migrate.sh              # apply schema + transform + verify (idempotent)
#   ./migrate.sh --reset      # drop volume + recreate container from scratch
#   ./migrate.sh --skip-verify   # skip the verify step

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONTAINER=cricket_analytics
TARGET_DB=cricket_analytics
TARGET_USER=cricket_user
RESET=0
SKIP_VERIFY=0

for arg in "$@"; do
    case "$arg" in
        --reset)       RESET=1 ;;
        --skip-verify) SKIP_VERIFY=1 ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

log() { echo -e "\033[1;34m[migrate]\033[0m $*"; }
run_sql_file() { docker exec -i "$CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 < "$1"; }

# --- 1. Verify source reachable from host before starting anything -------
log "Verifying source cricket DB is running on localhost:5434"
if ! docker ps --format '{{.Names}}\t{{.Ports}}' | grep -q '0.0.0.0:5434'; then
    echo "No container exposes port 5434 — is the source cricket DB running?" >&2
    exit 1
fi

# --- 2. Start (or reset) the target container ----------------------------
if [ "$RESET" -eq 1 ]; then
    log "Reset requested — tearing down container and volume"
    docker compose down -v
fi

log "Starting target container"
docker compose up -d

log "Waiting for target database to be healthy"
for i in {1..30}; do
    if docker exec "$CONTAINER" pg_isready -U "$TARGET_USER" -d "$TARGET_DB" >/dev/null 2>&1; then
        log "Target database ready"
        break
    fi
    sleep 1
    if [ "$i" -eq 30 ]; then
        echo "Timed out waiting for target database" >&2
        exit 1
    fi
done

# --- 3. Apply schema -----------------------------------------------------
log "Applying schema.sql"
run_sql_file schema.sql

# --- 4. Run transform (pulls data via postgres_fdw) ----------------------
log "Running transform.sql — pulls data from source through postgres_fdw"
log "This may take 1-3 minutes for ~1M deliveries rows"
time run_sql_file transform.sql

# --- 5. Verify -----------------------------------------------------------
if [ "$SKIP_VERIFY" -eq 0 ]; then
    log "Running verify.sql"
    run_sql_file verify.sql
else
    log "Skipping verify (--skip-verify)"
fi

log "Migration complete."
log "Connection string: postgres://${TARGET_USER}:cricket_pass@localhost:5436/${TARGET_DB}"
log "Tables live in the 'analytics' schema — qualify as analytics.<table> or SET search_path=analytics."
