#!/bin/bash
# Wave 0 pre-flight backup script — /plan-eng-review M57 2026-05-31.
# Snapshot legacy tag tables TRƯỚC Wave 5 drop. Restore path nếu rollback.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./scripts/backup-pre-wave5.sh
#
# Output: backup-pre-wave5-YYYYMMDD-HHMMSS.sql in current dir.
# Upload S3 retention 30 ngày (manual hoặc CI/CD).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT="backup-pre-wave5-${TIMESTAMP}.sql"

echo "[Wave 0 backup] Dumping legacy tag tables to ${OUT}..."

pg_dump "$DATABASE_URL" \
  --table=contacts \
  --table=friends \
  --table=crm_tags \
  --table=crm_tag_groups \
  --table=zalo_labels \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[Wave 0 backup] Done. Size: ${SIZE}"
echo "[Wave 0 backup] Next: upload to S3 with 30-day retention"
echo "[Wave 0 backup] Example: aws s3 cp ${OUT} s3://zalocrm-backup/wave5-pre-drop/${OUT} --expires \"$(date -d '+30 days' --iso-8601)\""
