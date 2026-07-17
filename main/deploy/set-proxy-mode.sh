#!/usr/bin/env bash
#
# PressPass — перемкнути вже встановлений сервер у режим «за реверс-проксі».
#
# Для випадку, коли TLS термінує зовнішній проксі (KeenDNS «через хмару»,
# Cloudflare тощо), а до цього сервера трафік іде по HTTP. Nginx віддає сайт
# по HTTP без редиректу на HTTPS, приймає будь-який Host, і повідомляє
# застосунку реальну схему (X-Forwarded-Proto: https).
#
# Використання:
#   sudo bash deploy/set-proxy-mode.sh pass.example.com
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${1:-}"

[[ $EUID -eq 0 ]] || { echo "Запустіть від root: sudo bash deploy/set-proxy-mode.sh <домен>"; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Вкажіть публічний домен: sudo bash deploy/set-proxy-mode.sh pass.example.com"; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "Не знайдено $APP_DIR/.env — спершу виконайте deploy/install.sh"; exit 1; }

echo "==> Запис конфігурації Nginx (proxy-режим)"
cat > /etc/nginx/sites-available/presspass <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} _;

    client_max_body_size 6m;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /uploads/ {
        alias ${APP_DIR}/uploads/;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/presspass /etc/nginx/sites-enabled/presspass
rm -f /etc/nginx/sites-enabled/default

echo "==> Оновлення .env (https://${DOMAIN})"
sed -i "s|^VERIFY_BASE_URL=.*|VERIFY_BASE_URL=https://${DOMAIN}|" "$APP_DIR/.env"
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$APP_DIR/.env"

echo "==> Перезавантаження Nginx"
nginx -t
if pgrep -x nginx >/dev/null; then
  systemctl reload nginx 2>/dev/null || service nginx reload
else
  systemctl start nginx 2>/dev/null || service nginx start
fi

echo "==> Перезапуск API (щоб підхопити нові CORS/VERIFY_BASE_URL)"
pm2 restart presspass-api --update-env >/dev/null 2>&1 || true

echo
echo "Готово. Сайт має відкриватися і за https://${DOMAIN} (через проксі), і за http://<IP> у LAN."
echo "QR-посилання формуються як https://${DOMAIN}/verify/..."
