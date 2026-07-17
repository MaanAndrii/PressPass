#!/usr/bin/env bash
#
# PressPass — увімкнення HTTPS (Let's Encrypt) для вже встановленої платформи.
#
# Використання:
#   sudo bash deploy/enable-https.sh pass.example.com
#
# Що робить:
#   1) отримує сертифікат через certbot (nginx-плагін, з редиректом 80 → 443);
#   2) оновлює VERIFY_BASE_URL і CORS_ORIGIN у .env на https://<домен>;
#   3) перезапускає API (QR-посилання відразу стають https).
#
# Передумови: домен вказує на цей сервер і порт 80 доступний ззовні.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${1:-}"

[[ $EUID -eq 0 ]] || { echo "Запустіть від root: sudo bash deploy/enable-https.sh <домен>"; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Вкажіть домен: sudo bash deploy/enable-https.sh pass.example.com"; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "Не знайдено $APP_DIR/.env — спершу виконайте deploy/install.sh"; exit 1; }

echo "==> Встановлення certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq certbot python3-certbot-nginx >/dev/null

echo "==> Оновлення server_name у конфігурації Nginx"
sed -i "s/^\(\s*server_name\s\).*/\1${DOMAIN};/" /etc/nginx/sites-available/presspass
nginx -t && (systemctl reload nginx 2>/dev/null || service nginx reload)

echo "==> Отримання сертифіката Let's Encrypt для ${DOMAIN}"
EMAIL="$(grep '^ADMIN_EMAIL=' "$APP_DIR/.env" | cut -d= -f2-)"
certbot --nginx -d "$DOMAIN" -m "${EMAIL:-admin@$DOMAIN}" --agree-tos --redirect -n

# Certbot у HTTP-блоці ставить "return 404" для запитів з іншим Host —
# через це відкриття сайту за IP дає "404 Not Found nginx". Замінюємо на
# редирект на домен, щоб http://<IP> теж вів на робочий сайт.
sed -i "s|return 404; # managed by Certbot|return 301 https://${DOMAIN}\$request_uri; # redirect all hosts|" \
  /etc/nginx/sites-available/presspass || true
nginx -t && (systemctl reload nginx 2>/dev/null || service nginx reload)

echo "==> Оновлення .env (https://${DOMAIN})"
sed -i "s|^VERIFY_BASE_URL=.*|VERIFY_BASE_URL=https://${DOMAIN}|" "$APP_DIR/.env"
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$APP_DIR/.env"

echo "==> Перезапуск API"
pm2 restart presspass-api --update-env >/dev/null

echo
echo "Готово! Сайт доступний за адресою https://${DOMAIN}"
echo "PWA тепер можна встановлювати на телефон, офлайн-режим активний."
echo "Сертифікат подовжується автоматично (systemd-таймер certbot)."
