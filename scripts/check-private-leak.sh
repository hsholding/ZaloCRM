#!/usr/bin/env bash
#
# scripts/check-private-leak.sh — chạy TRƯỚC mỗi `git push origin main` để chắc
# chắn không có code Privacy hoặc Internal-Notify lọt sang public locpham.
#
# Cách dùng:
#   bash scripts/check-private-leak.sh
#   → exit 0  = an toàn push origin
#   → exit 1  = phát hiện leak, in danh sách file/line vấn đề, KHÔNG push
#
# Lý do: 2 module sau là private-only (anh chốt 2026-05-23):
#   1. Riêng tư (Privacy / PIN / redact)
#   2. Thông báo nội bộ qua Zalo (internal-notify, system-notify)
# Cả 2 chỉ tồn tại trên branch private-hs + push fork hsholding/ZaloCRM, KHÔNG
# push origin locpham/ZaloCRM (public).

set -e

# 1. Path patterns CẤM hiện diện trong commits sắp push.
PRIVATE_PATTERNS=(
  "backend/src/modules/privacy/"
  "backend/src/modules/internal-notify/"
  "frontend/src/components/privacy/"
  "frontend/src/components/internal-notify/"
  "frontend/src/stores/privacy.ts"
  "frontend/src/stores/internal-notify.ts"
  "frontend/src/composables/use-privacy-visibility.ts"
  "frontend/src/views/privacy/"
  "frontend/src/views/internal-notify/"
  "scripts/test-privacy-"
  "scripts/test-internal-notify-"
  "PrivacyNicksTab"
  "20260522010000_privacy_phase_rieng_tu"
)

# 2. Content patterns CẤM xuất hiện trong diff (shared files, vd schema.prisma).
PRIVATE_CONTENT_PATTERNS=(
  "privacyMode"
  "privacy_mode"
  "privacy_pin"
  "internalContactZaloAccountId"
  "internal_contact_zalo_account_id"
  "systemNotifyZaloAccountId"
  "system_notify_zalo_account_id"
  "maxPrivacyNicks"
  "max_privacy_nicks"
)

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

# 3. Lấy diff giữa remote/branch và local HEAD
echo "▶ Check leak: $REMOTE/$BRANCH..HEAD"
if ! git rev-parse "$REMOTE/$BRANCH" >/dev/null 2>&1; then
  echo "⚠ Không tìm thấy $REMOTE/$BRANCH — fetch trước"
  git fetch "$REMOTE" "$BRANCH" >/dev/null 2>&1 || true
fi

CHANGED_FILES=$(git diff --name-only "$REMOTE/$BRANCH"..HEAD 2>/dev/null || git diff --name-only "$REMOTE/$BRANCH...HEAD")
if [[ -z "$CHANGED_FILES" ]]; then
  echo "  (no diff vs $REMOTE/$BRANCH — nothing to push)"
  exit 0
fi

LEAK_COUNT=0

# 4. Check path patterns
echo "▶ Scan path patterns..."
for pattern in "${PRIVATE_PATTERNS[@]}"; do
  MATCHES=$(echo "$CHANGED_FILES" | grep -F "$pattern" || true)
  if [[ -n "$MATCHES" ]]; then
    echo "  ❌ LEAK [path '$pattern']:"
    echo "$MATCHES" | sed 's/^/      /'
    LEAK_COUNT=$((LEAK_COUNT + 1))
  fi
done

# 5. Check content patterns trong shared files
echo "▶ Scan content patterns trong diff..."
for pattern in "${PRIVATE_CONTENT_PATTERNS[@]}"; do
  MATCHES=$(git diff "$REMOTE/$BRANCH"..HEAD 2>/dev/null | grep -E "^[+-].*$pattern" | grep -v "^[+-][+-]" || true)
  if [[ -n "$MATCHES" ]]; then
    echo "  ❌ LEAK [content '$pattern']:"
    echo "$MATCHES" | head -5 | sed 's/^/      /'
    LEAK_COUNT=$((LEAK_COUNT + 1))
  fi
done

if [[ $LEAK_COUNT -gt 0 ]]; then
  echo ""
  echo "🛑 PHÁT HIỆN $LEAK_COUNT LEAK — KHÔNG push origin!"
  echo ""
  echo "Fix gợi ý:"
  echo "  1. Nếu file/pattern đó thuộc private module → revert khỏi main:"
  echo "       git checkout $REMOTE/$BRANCH -- <file>"
  echo "  2. Nếu là shared file có code mix → split commit:"
  echo "       git reset --soft $REMOTE/$BRANCH  # un-commit"
  echo "       git restore --staged <private files>  # unstage private parts"
  echo "       git commit -m 'public parts only'"
  echo "  3. Kiểm tra lại: bash scripts/check-private-leak.sh"
  exit 1
fi

echo ""
echo "✅ Không phát hiện leak — an toàn push $REMOTE/$BRANCH"
exit 0
