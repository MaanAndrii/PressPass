#!/usr/bin/env bash
#
# PressPass — інсталяційний візард для VPS (Ubuntu 22.04 / 24.04).
#
# Використання (від root):
#   sudo bash deploy/install.sh
#
# Скрипт інтерактивно питає домен та облікові дані адміністратора, після чого:
#   1) встановлює Node.js 22, PostgreSQL, Nginx, PM2 (і certbot, якщо потрібен HTTPS);
#   2) створює базу даних і користувача PostgreSQL;
#   3) генерує .env із випадковими секретами;
#   4) виконує npm ci, міграції, seed і production-збірку;
#   5) запускає API та веб через PM2 з автозапуском;
#   6) налаштовує Nginx і (за бажанням) сертифікат Let's Encrypt.
#
# Неінтерактивний режим (для автоматизації): задайте змінні середовища і --yes:
#   sudo PP_DOMAIN=id.example.ua PP_HTTPS=yes PP_ADMIN_EMAIL=a@b.c bash deploy/install.sh --yes
#
# Скрипт ідемпотентний: повторний запуск оновлює конфігурацію, а не дублює її.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXISTING_INSTALL=0
[[ -f "$APP_DIR/.env" ]] && EXISTING_INSTALL=1
# Значення з наявного .env (для оновлення). На свіжому встановленні файл ще не
# існує: тоді повертаємо порожнє й код 0, інакше sed на відсутньому файлі під
# `set -euo pipefail` мовчки обриває скрипт ще на етапі запитань.
env_value() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  sed -n "s/^$1=//p" "$APP_DIR/.env" | tail -n1
}
ASSUME_YES=0
# --reset-db дозволяє свідомо скинути наявну (несумісну) базу перед встановленням.
RESET_DB=0
for __arg in "$@"; do
  case "$__arg" in
    --yes | -y) ASSUME_YES=1 ;;
    --reset-db) RESET_DB=1 ;;
  esac
done

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
step() { echo; echo "${BOLD}${GREEN}==>${RESET}${BOLD} $*${RESET}"; }
warn() { echo "${YELLOW}!${RESET} $*"; }
die()  { echo "${RED}Помилка:${RESET} $*" >&2; exit 1; }

# Секрети генеруються на етапі запитань — ще ДО встановлення пакетів. Тому тут не
# можна залежати від openssl (він доустановлюється пізніше): якщо він уже є —
# використовуємо його, інакше беремо ентропію з /dev/urandom через coreutils.
# $1 — кількість байтів ентропії.
rand_b64() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 "$1" | tr -d '/+=\n'
  else head -c "$1" /dev/urandom | base64 | tr -d '/+=\n'; fi
}
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

[[ $EUID -eq 0 ]] || die "запустіть від root: sudo bash deploy/install.sh"
[[ -f "$APP_DIR/package.json" ]] || die "не знайдено package.json у $APP_DIR"

# ─── Питання ─────────────────────────────────────────────────────────────────
# prompt <змінна> <текст> <значення за замовчуванням>
# Значення можна передати наперед через змінну середовища з тим самим іменем.
prompt() {
  local __var=$1 __text=$2 __def=${3:-} __ans
  if [[ -n "${!__var:-}" ]]; then return; fi
  if [[ $ASSUME_YES -eq 1 ]]; then printf -v "$__var" '%s' "$__def"; return; fi
  read -rp "$__text [$__def]: " __ans
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

DEFAULT_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo 127.0.0.1)"

echo "${BOLD}PressPass — встановлення на VPS${RESET}"
echo "Каталог застосунку: $APP_DIR"
echo

prompt PP_DOMAIN        "Домен (або IP, якщо домену ще немає)" "$DEFAULT_IP"
# Необовʼязковий окремий домен для адмінки (напр. admin.id.example.ua). Коли
# заданий: адмінка доступна лише на ньому (без PWA), а на основному домені
# (PWA для журналістів) шлях /admin блокується.
PP_ADMIN_DOMAIN="${PP_ADMIN_DOMAIN:-}"

# Режим доступу визначає, хто термінує TLS і як налаштувати Nginx.
#   https-direct — сертифікат Let's Encrypt на цьому сервері (порт 443 назовні);
#   proxy        — зовнішній HTTPS-проксі (KeenDNS «через хмару», Cloudflare):
#                  проксі шифрує, до сервера трафік іде по HTTP, без редиректу;
#   http         — просто HTTP (локальна мережа / IP, без шифрування).
# Сумісність зі старим прапорцем: PP_HTTPS=yes → https-direct, no → http.
if [[ -z "${PP_ACCESS:-}" && -n "${PP_HTTPS:-}" ]]; then
  [[ "$PP_HTTPS" == "yes" ]] && PP_ACCESS=https-direct || PP_ACCESS=http
fi
if [[ -z "${PP_ACCESS:-}" ]]; then
  if [[ "$PP_DOMAIN" =~ ^[0-9.]+$ || "$PP_DOMAIN" == "localhost" ]]; then
    PP_ACCESS=http
    warn "Вказано IP/localhost — режим HTTP (без шифрування, PWA обмежено)."
  elif [[ $ASSUME_YES -eq 1 ]]; then
    PP_ACCESS=https-direct
  else
    echo
    echo "Як користувачі відкриватимуть сайт?"
    echo "  1) https-direct — власний домен, сертифікат Let's Encrypt тут (потрібен порт 443 назовні)"
    echo "  2) proxy        — за зовнішнім HTTPS-проксі (KeenDNS «через хмару», Cloudflare)"
    echo "  3) http         — просто HTTP (локальна мережа / IP, без шифрування)"
    read -rp "Оберіть [1]: " __mode
    case "${__mode:-1}" in
      2) PP_ACCESS=proxy ;;
      3) PP_ACCESS=http ;;
      *) PP_ACCESS=https-direct ;;
    esac
  fi
fi
case "$PP_ACCESS" in
  https-direct | proxy | http) ;;
  *) die "невідомий PP_ACCESS='$PP_ACCESS' (очікується https-direct | proxy | http)" ;;
esac
prompt PP_ADMIN_EMAIL   "Email адміністратора платформи" "admin@${PP_DOMAIN}"
prompt PP_ADMIN_PASSWORD "Пароль адміністратора (Enter — згенерувати)" ""
prompt PP_ADMIN_ENCRYPTION_PASSPHRASE "Окрема криптографічна фраза адміністратора (Enter — згенерувати)" ""
prompt PP_DB_PASSWORD   "Пароль PostgreSQL для presspass (Enter — згенерувати)" ""
prompt PP_RESEND_API_KEY "Resend API key для листів (Enter — коди в лог, dev-режим)" ""
prompt PP_GOOGLE_CLIENT_ID "Google OAuth Client ID (Enter — без входу через Google)" ""
PP_GOOGLE_CLIENT_SECRET="${PP_GOOGLE_CLIENT_SECRET:-}"
if [[ -n "$PP_GOOGLE_CLIENT_ID" && -z "$PP_GOOGLE_CLIENT_SECRET" && $ASSUME_YES -ne 1 ]]; then
  read -rp "Google OAuth Client Secret: " PP_GOOGLE_CLIENT_SECRET
fi

[[ -n "$PP_ADMIN_PASSWORD" ]] || PP_ADMIN_PASSWORD="$(rand_b64 12)"
if [[ -z "$PP_ADMIN_ENCRYPTION_PASSPHRASE" && $EXISTING_INSTALL -eq 1 ]]; then die "для оновлення задайте чинну PP_ADMIN_ENCRYPTION_PASSPHRASE"; fi
[[ -n "$PP_ADMIN_ENCRYPTION_PASSPHRASE" ]] || PP_ADMIN_ENCRYPTION_PASSPHRASE="$(rand_b64 24)"
PP_SUPERADMIN_RECOVERY_PASSPHRASE_1="${PP_SUPERADMIN_RECOVERY_PASSPHRASE_1:-$(rand_b64 32)}"
PP_SUPERADMIN_RECOVERY_PASSPHRASE_2="${PP_SUPERADMIN_RECOVERY_PASSPHRASE_2:-$(rand_b64 32)}"
[[ -n "$PP_DB_PASSWORD"    ]] || PP_DB_PASSWORD="$(rand_hex 16)"
JWT_SECRET="${JWT_SECRET:-$(env_value JWT_SECRET)}"; JWT_SECRET="${JWT_SECRET:-$(rand_hex 32)}"
DATA_KEY_SECRET="${DATA_KEY_SECRET:-$(env_value DATA_KEY_SECRET)}"; DATA_KEY_SECRET="${DATA_KEY_SECRET:-$(rand_hex 32)}"
LOOKUP_KEY="${LOOKUP_KEY:-$(env_value LOOKUP_KEY)}"; LOOKUP_KEY="${LOOKUP_KEY:-$(rand_hex 32)}"

# Публічна схема: у режимах https-direct і proxy користувач працює по HTTPS.
if [[ "$PP_ACCESS" == "http" ]]; then BASE_URL="http://$PP_DOMAIN"; else BASE_URL="https://$PP_DOMAIN"; fi
# Проксі спілкується з сервером по HTTP, але користувач — на HTTPS, тож
# перевизначаємо X-Forwarded-Proto жорстко, щоб застосунок знав реальну схему.
if [[ "$PP_ACCESS" == "proxy" ]]; then FORWARDED_PROTO="https"; else FORWARDED_PROTO="\$scheme"; fi

echo
echo "${BOLD}План встановлення${RESET}"
echo "  Адреса сайту:      $BASE_URL"
echo "  API:               $BASE_URL/api  (Swagger: $BASE_URL/api/docs)"
echo "  Адміністратор:     $PP_ADMIN_EMAIL"
echo "  Режим доступу:     $PP_ACCESS"
if [[ $ASSUME_YES -ne 1 ]]; then
  read -rp "Продовжити? (yes/no) [yes]: " CONFIRM
  [[ "${CONFIRM:-yes}" == "yes" ]] || die "скасовано користувачем"
fi

# ─── 1. Пакети ───────────────────────────────────────────────────────────────
step "Встановлення системних пакетів"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx postgresql openssl >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  step "Встановлення Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null

if [[ "$PP_ACCESS" == "https-direct" ]]; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
fi

systemctl is-active --quiet postgresql || service postgresql start

# ─── 2. База даних ───────────────────────────────────────────────────────────
step "Налаштування PostgreSQL"
su - postgres -c "psql -v ON_ERROR_STOP=1 -q" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'presspass') THEN
    CREATE ROLE presspass LOGIN PASSWORD '$PP_DB_PASSWORD';
  ELSE
    ALTER ROLE presspass WITH LOGIN PASSWORD '$PP_DB_PASSWORD';
  END IF;
END
\$\$;
SQL
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='presspass'\"" | grep -q 1 \
  || su - postgres -c "createdb -O presspass presspass"

# На вимогу скидаємо наявну базу (свідома відмова від старих даних).
if [[ $RESET_DB -eq 1 ]]; then
  step "Скидання бази presspass (--reset-db)"
  warn "Усі наявні дані presspass буде безповоротно видалено."
  su - postgres -c "psql -q -c 'DROP DATABASE IF EXISTS presspass'"
  su - postgres -c "createdb -O presspass presspass"
fi

# Захист від «несумісного перевстановлення»: якщо .env із секретами відсутній,
# інсталятор генерує НОВІ ключі шифрування. Але якщо база вже містить дані від
# попереднього встановлення, вони зашифровані СТАРИМИ ключами — узгодити їх
# неможливо, і security:backfill впаде глибоко всередині. Зупиняємось завчасно з
# чіткою інструкцією, а не з криптографічною помилкою.
DB_ROWS="$(su - postgres -c "psql -tAq presspass" <<'PSQL' 2>/dev/null | tail -n1
SELECT CASE WHEN to_regclass('public."User"') IS NULL THEN 0
            ELSE (SELECT count(*) FROM "User") END;
PSQL
)"
if [[ $EXISTING_INSTALL -eq 0 && "${DB_ROWS:-0}" -gt 0 ]]; then
  echo
  die "База presspass уже містить дані (${DB_ROWS} користувач(ів)), але файл .env із
       секретами шифрування відсутній — тобто буде згенеровано НОВІ ключі, несумісні
       зі старими даними. Оберіть одне:
         • відновіть попередній $APP_DIR/.env (зі старими ADMIN_ENCRYPTION_PASSPHRASE,
           DATA_KEY_SECRET, LOOKUP_KEY) і запустіть інсталятор знову; АБО
         • свідомо скиньте стару (невідновну) базу: перезапустіть з прапорцем --reset-db
           (bash deploy/install.sh --reset-db)."
fi

# ─── 3. Конфігурація .env ────────────────────────────────────────────────────
step "Генерація $APP_DIR/.env"
if [[ -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env" "$APP_DIR/.env.backup.$(date +%s)"
  warn "Наявний .env збережено як .env.backup.*"
fi
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL=postgresql://presspass:${PP_DB_PASSWORD}@localhost:5432/presspass?schema=public
PORT=3001
JWT_SECRET=${JWT_SECRET}
DATA_KEY_SECRET=${DATA_KEY_SECRET}
LOOKUP_KEY=${LOOKUP_KEY}
# Short-lived access token; the client rotates it via the refresh cookie.
JWT_EXPIRES_IN=15m
# How long a device stays signed in without re-entering the password (sliding).
REFRESH_TOKEN_DAYS=7
CORS_ORIGIN=${BASE_URL}
VERIFY_BASE_URL=${BASE_URL}
UPLOADS_DIR=${APP_DIR}/uploads
ADMIN_EMAIL=${PP_ADMIN_EMAIL}
ADMIN_PASSWORD=${PP_ADMIN_PASSWORD}
# Resend: без ключа коди підтвердження пишуться в лог API (pm2 logs presspass-api)
RESEND_API_KEY=${PP_RESEND_API_KEY}
MAIL_FROM=PressPass <onboarding@resend.dev>
# Google OAuth (порожньо — кнопка входу через Google прихована)
GOOGLE_CLIENT_ID=${PP_GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${PP_GOOGLE_CLIENT_SECRET}
# Контактна адреса на сторінках «Політика конфіденційності» та «Умови
# використання» (за замовчуванням — email адміністратора платформи).
NEXT_PUBLIC_CONTACT_EMAIL=${PP_CONTACT_EMAIL:-$PP_ADMIN_EMAIL}
# Відносний шлях: фронтенд звертається до API через той самий хост, з якого
# відкрито сайт, — працює і за доменом, і за будь-яким IP.
NEXT_PUBLIC_API_URL=/api
# SSR-сторінки (перевірка /verify) ходять до API напряму, повз Nginx.
API_INTERNAL_URL=http://127.0.0.1:3001
ENV
chmod 600 "$APP_DIR/.env"

# ─── 4. Збірка та база ───────────────────────────────────────────────────────
step "Встановлення залежностей (npm ci)"
cd "$APP_DIR"
npm ci --no-audit --no-fund >/dev/null

step "Міграції бази даних та початкові дані"
npx prisma migrate deploy
NODE_ENV=production ADMIN_ENCRYPTION_PASSPHRASE="$PP_ADMIN_ENCRYPTION_PASSPHRASE" npm run db:seed
RECOVERY_KIT_OUTPUT="/root/presspass-recovery-kits-$(date -u +%Y%m%dT%H%M%SZ).json"
RECOVERY_KIT_OUTPUT="$RECOVERY_KIT_OUTPUT" \
  ADMIN_ENCRYPTION_PASSPHRASE="$PP_ADMIN_ENCRYPTION_PASSPHRASE" \
  SUPERADMIN_RECOVERY_PASSPHRASE_1="$PP_SUPERADMIN_RECOVERY_PASSPHRASE_1" \
  SUPERADMIN_RECOVERY_PASSPHRASE_2="$PP_SUPERADMIN_RECOVERY_PASSPHRASE_2" \
  npm run security:backfill
npm run security:verify

step "Production-збірка (API + Web)"
npm run build

# ─── 5. PM2 ──────────────────────────────────────────────────────────────────
step "Запуск процесів через PM2"
mkdir -p "$APP_DIR/uploads/encrypted"
chmod 700 "$APP_DIR/uploads/encrypted"
cd "$APP_DIR/apps/api"
pm2 delete presspass-api >/dev/null 2>&1 || true
pm2 start dist/main.js --name presspass-api --time >/dev/null
cd "$APP_DIR/apps/web"
pm2 delete presspass-web >/dev/null 2>&1 || true
pm2 start npm --name presspass-web --time -- start >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || warn "pm2 startup не налаштовано (немає systemd?)"

# ─── 6. Nginx ────────────────────────────────────────────────────────────────
step "Налаштування Nginx"
# У режимах proxy/http приймаємо будь-який Host (домен + `_`), щоб працювали і
# запити від хмарного проксі, і відкриття за IP. У https-direct лишаємо домен —
# certbot прив'яже сертифікат саме до нього.
if [[ "$PP_ACCESS" == "https-direct" ]]; then SERVER_NAME="$PP_DOMAIN"; else SERVER_NAME="$PP_DOMAIN _"; fi

# Спільні блоки проксі (авторизований API та Next.js) — використовуються в обох server-блоках.
read -r -d '' PROXY_LOCATIONS <<NGINX || true
    # REST API: /api/... -> NestJS (префікс /api зрізається слешем у proxy_pass)
    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${FORWARDED_PROTO};
    }

    # Усе інше -> Next.js (PWA)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto ${FORWARDED_PROTO};
    }
NGINX

# Коли заданий окремий домен адмінки — на основному (журналістському) домені
# ховаємо /admin, а адмінку віддаємо лише на PP_ADMIN_DOMAIN (без PWA).
ADMIN_DENY=""
ADMIN_SERVER=""
if [[ -n "$PP_ADMIN_DOMAIN" ]]; then
  ADMIN_DENY=$'\n    # Адмінка живе на окремому домені — на основному її ховаємо.\n    location /admin { return 404; }\n'
  ADMIN_SERVER=$(cat <<NGINX

# Адмінка (для ПК) — окремий домен, без PWA (service worker/manifest вимкнено).
server {
    listen 80;
    server_name ${PP_ADMIN_DOMAIN};

    client_max_body_size 6m;

    location = /sw.js { return 404; }
    location = /manifest.webmanifest { return 404; }

${PROXY_LOCATIONS}
}
NGINX
)
fi

cat > /etc/nginx/sites-available/presspass <<NGINX
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 6m;
${ADMIN_DENY}
${PROXY_LOCATIONS}
}
${ADMIN_SERVER}
NGINX
ln -sf /etc/nginx/sites-available/presspass /etc/nginx/sites-enabled/presspass
rm -f /etc/nginx/sites-enabled/default
nginx -t
# reload лише якщо nginx уже працює; інакше — старт (reload на зупиненому nginx
# у деяких init-скриптах повертає успіх, нічого не запустивши)
if pgrep -x nginx >/dev/null; then
  systemctl reload nginx 2>/dev/null || service nginx reload
else
  systemctl start nginx 2>/dev/null || service nginx start
fi
pgrep -x nginx >/dev/null || die "nginx не запустився — перегляньте: nginx -t && service nginx status"

# ─── 7. HTTPS ────────────────────────────────────────────────────────────────
if [[ "$PP_ACCESS" == "https-direct" ]]; then
  step "Отримання сертифіката Let's Encrypt"
  certbot --nginx -d "$PP_DOMAIN" -m "$PP_ADMIN_EMAIL" --agree-tos --redirect -n \
    || warn "certbot не впорався — перевірте, що DNS домену вказує на цей сервер, і запустіть: certbot --nginx -d $PP_DOMAIN"
elif [[ "$PP_ACCESS" == "proxy" ]]; then
  echo
  warn "Режим proxy: TLS термінує зовнішній проксі. Переконайтеся, що він"
  warn "передає запити на цей сервер, порт 80 (HTTP). Сертифікат тут не потрібен."
fi

# ─── Готово ──────────────────────────────────────────────────────────────────
echo
echo "${BOLD}${GREEN}Встановлення завершено!${RESET}"
echo
echo "  Сайт:        $BASE_URL/login"
echo "  Swagger:     $BASE_URL/api/docs"
echo "  Логін:       $PP_ADMIN_EMAIL"
echo "  Пароль:      $PP_ADMIN_PASSWORD"
echo "  Crypto-фраза: $PP_ADMIN_ENCRYPTION_PASSPHRASE"
echo "  Recovery #1:  $PP_SUPERADMIN_RECOVERY_PASSPHRASE_1"
echo "  Recovery #2:  $PP_SUPERADMIN_RECOVERY_PASSPHRASE_2"
echo "  Recovery kits: $RECOVERY_KIT_OUTPUT"
echo
echo "  ${YELLOW}Збережіть пароль і криптографічну фразу окремо. Crypto-фраза не відновлюється сервером.${RESET}"
echo "  Конфігурація: $APP_DIR/.env (права 600)"
echo "  Оновлення:    sudo bash $APP_DIR/deploy/update.sh"
echo "  Процеси:      pm2 status | pm2 logs presspass-api"
