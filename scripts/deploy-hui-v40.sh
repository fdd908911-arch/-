#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${HUI_V40_TARGET:-/usr/share/caddy/hui-v40}"
COREAD="${HUI_COREAD_PUBLIC:-/home/ubuntu/hui-coread/public}"
BACKUP_ROOT="${HUI_V40_BACKUP_ROOT:-/home/ubuntu/hui-v40-backups/deployments}"
MODE="${1:---check}"

if [[ "$MODE" != "--check" && "$MODE" != "--deploy" ]]; then
  echo "usage: $0 [--check|--deploy]" >&2
  exit 2
fi

case "$TARGET" in
  ""|/|/usr|/usr/share|/usr/share/caddy)
    echo "refusing unsafe deploy target: $TARGET" >&2
    exit 2
    ;;
esac

if [[ ! -d "$COREAD" || ! -f "$COREAD/index.html" ]]; then
  echo "co-reading build is missing: $COREAD" >&2
  exit 1
fi

node "$ROOT/scripts/check-static.js"

while IFS= read -r -d '' javascript; do
  node --check "$javascript"
done < <(find "$ROOT" -maxdepth 2 -type f -name '*.js' -print0)

STAGE="$(mktemp -d /tmp/hui-v40-deploy.XXXXXX)"
trap 'rm -rf -- "$STAGE"' EXIT

while IFS= read -r -d '' public_file; do
  install -m 0644 "$public_file" "$STAGE/$(basename "$public_file")"
done < <(
  find "$ROOT" -maxdepth 1 -type f \
    \( -name '*.html' -o -name '*.css' -o -name '*.js' \
       -o -name '*.webmanifest' -o -name 'THIRD_PARTY_NOTICES.md' \) \
    -print0
)

for public_dir in assets core features; do
  if [[ -d "$ROOT/$public_dir" ]]; then
    install -d -m 0755 "$STAGE/$public_dir"
    cp -a "$ROOT/$public_dir/." "$STAGE/$public_dir/"
  fi
done

install -d -m 0755 "$STAGE/reading-app"
cp -a "$COREAD/." "$STAGE/reading-app/"
find "$STAGE" -type d -exec chmod 0755 {} +
find "$STAGE" -type f -exec chmod 0644 {} +

echo "source: $ROOT"
echo "co-reading: $COREAD"
echo "target: $TARGET"

if [[ "$MODE" == "--check" ]]; then
  echo "planned changes:"
  sudo -n rsync --recursive --links --perms --devices --specials --checksum --itemize-changes --dry-run --delete --no-owner --no-group --omit-dir-times --chmod=D755,F644 "$STAGE/" "$TARGET/"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/hui-v40-$STAMP.tar.gz"
install -d -m 0755 "$BACKUP_ROOT"
sudo -n tar -C "$(dirname "$TARGET")" -czf "$BACKUP" "$(basename "$TARGET")"
sudo -n chown "$(id -u):$(id -g)" "$BACKUP"
echo "backup: $BACKUP"

sudo -n rsync --recursive --links --perms --devices --specials --checksum --delete --no-owner --no-group --omit-dir-times --chmod=D755,F644 "$STAGE/" "$TARGET/"

DRIFT="$(sudo -n rsync --recursive --links --perms --devices --specials --checksum --itemize-changes --dry-run --delete --no-owner --no-group --omit-dir-times --chmod=D755,F644 "$STAGE/" "$TARGET/")"
if [[ -n "$DRIFT" ]]; then
  echo "deployment drift remains:" >&2
  echo "$DRIFT" >&2
  exit 1
fi

for path in index.html chat.html diary.html memory.html dream.html \
  volo-status.html world.html inside.html reading.html router.html \
  reading-app/index.html; do
  curl --noproxy '*' --fail --silent --show-error \
    "https://mcp.canian.top/hui-v40/$path" >/dev/null
done

echo "deployment verified: no filesystem drift and essential pages return HTTP 200"
