#!/usr/bin/env bash
#
# PressPass — оновлення до останньої версії з git.
# Використання: sudo bash deploy/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci --no-audit --no-fund >/dev/null

echo "==> Міграції бази даних"
npx prisma migrate deploy

echo "==> Збірка"
npm run build

echo "==> Перезапуск процесів"
pm2 restart presspass-api presspass-web --update-env

echo "Готово. Стан: pm2 status"
