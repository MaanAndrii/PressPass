#!/usr/bin/env bash
#
# PressPass — відновлення з повного бекапу (backup.tar.age).
#
# Бекап створюється кнопкою в адмінці (суперадмін) і містить: дамп БД,
# зашифровані файли (uploads/encrypted) та серверний .env. Файл зашифровано
# через age паролем — цей самий пароль потрібен тут.
#
# УВАГА: відновлення ПЕРЕЗАПИСУЄ поточну базу даних і uploads. Робіть його на
# новому або зупиненому сервері.
#
# Використання:
#   DATABASE_URL=... UPLOADS_DIR=... bash deploy/restore.sh backup.tar.age
#   (за замовчуванням DATABASE_URL/UPLOADS_DIR читаються з ./.env)
#
# Щоб також відновити .env із бекапу (перенесення на новий сервер):
#   RESTORE_ENV=yes bash deploy/restore.sh backup.tar.age
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Вкажіть файл бекапу: bash deploy/restore.sh <backup.tar.age>" >&2
  exit 1
fi

for tool in age tar pg_restore; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Потрібен '$tool', але його не знайдено у PATH." >&2
    exit 1
  }
done

# Підхопити DATABASE_URL / UPLOADS_DIR з .env, якщо не задано в оточенні.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . <(grep -E '^(DATABASE_URL|UPLOADS_DIR)=' .env || true)
  set +a
fi
: "${DATABASE_URL:?DATABASE_URL не задано (в оточенні або .env)}"
UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"

# pg_restore/libpq не розуміє Prisma-специфічних параметрів (schema, ...).
if command -v node >/dev/null 2>&1; then
  DB_LIBPQ="$(node -e 'const u=new URL(process.argv[1]);["schema","connection_limit","pool_timeout","pgbouncer","socket_timeout","statement_cache_size"].forEach(p=>u.searchParams.delete(p));process.stdout.write(u.toString())' "$DATABASE_URL")"
else
  DB_LIBPQ="${DATABASE_URL%%\?*}"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Розшифрування (age запитає пароль бекапу)"
age -d -o "$WORK/backup.tar" "$FILE"

echo "==> Розпакування"
tar xf "$WORK/backup.tar" -C "$WORK"

if [ -f "$WORK/manifest.json" ]; then
  echo "==> Manifest:"
  cat "$WORK/manifest.json"
  echo
fi

read -r -p 'Відновити цей бекап? Це ПЕРЕЗАПИШЕ базу даних і uploads. Введіть YES: ' CONFIRM
[ "$CONFIRM" = "YES" ] || {
  echo "Скасовано."
  exit 1
}

echo "==> Відновлення бази даних (pg_restore)"
pg_restore --clean --if-exists --no-owner --dbname="$DB_LIBPQ" "$WORK/db.dump"

if [ -d "$WORK/encrypted" ]; then
  echo "==> Відновлення файлів у $UPLOADS_DIR/encrypted"
  mkdir -p "$UPLOADS_DIR/encrypted"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$WORK/encrypted/" "$UPLOADS_DIR/encrypted/"
  else
    rm -rf "$UPLOADS_DIR/encrypted"
    mkdir -p "$UPLOADS_DIR/encrypted"
    cp -a "$WORK/encrypted/." "$UPLOADS_DIR/encrypted/"
  fi
fi

if [ "${RESTORE_ENV:-no}" = "yes" ] && [ -f "$WORK/env" ]; then
  if [ -f .env ]; then cp .env ".env.before-restore.$(date +%s)"; fi
  cp "$WORK/env" .env
  echo "==> .env відновлено з бекапу (попередній збережено як .env.before-restore.*)"
fi

echo
echo "Готово. Далі: застосуйте міграції за потреби й запустіть застосунок:"
echo "  npx prisma migrate deploy && bash deploy/update.sh   # або pm2 restart"
