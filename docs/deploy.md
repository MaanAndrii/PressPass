# Розгортання на VPS

Два способи: **візард** (один скрипт, рекомендовано) або [ручне встановлення](#ручне-встановлення).

Вимоги: чистий VPS з Ubuntu 22.04/24.04, root-доступ. Для HTTPS — домен, A-запис якого вказує на IP сервера (PWA-можливості — встановлення на телефон, офлайн-режим — працюють лише з HTTPS).

## Візард (рекомендовано)

```bash
git clone https://github.com/MaanAndrii/PressPass.git /opt/presspass
cd /opt/presspass
sudo bash deploy/install.sh
```

Скрипт поставить кілька запитань:

1. **Домен** (наприклад `id.domain.ua`; можна вказати IP);
2. **Режим доступу** — `https-direct` (Let's Encrypt на сервері), `proxy` (за зовнішнім HTTPS-проксі) або `http` (див. [Режими доступу](#режими-доступу-як-користувачі-відкривають-сайт));
3. **Email адміністратора** — логін для входу в `/admin`;
4. **Пароль адміністратора** — Enter, щоб згенерувати випадковий;
5. **Пароль БД** — Enter, щоб згенерувати випадковий;
6. **Resend API key** і **Google OAuth** — за бажанням (Enter, щоб пропустити).

Далі все автоматично: Node.js 22, PostgreSQL, Nginx, PM2, certbot; база даних; `.env` з випадковим `JWT_SECRET`; міграції та seed; production-збірка; запуск під PM2 з автостартом; конфігурація Nginx; сертифікат Let's Encrypt. Наприкінці скрипт виводить адресу сайту та облікові дані адміністратора — **збережіть пароль**.

Повторний запуск безпечний: скрипт ідемпотентний (оновить конфігурацію, зробить резервну копію `.env`).

### Неінтерактивний режим

Для автоматизації (Ansible, cloud-init):

```bash
sudo PP_DOMAIN=id.domain.ua PP_HTTPS=yes PP_ADMIN_EMAIL=admin@domain.ua \
  bash deploy/install.sh --yes
```

Незадані секрети генеруються автоматично і виводяться наприкінці.

## Увімкнення HTTPS пізніше

Якщо платформу встановлено без HTTPS (по IP), а домен з'явився згодом:

```bash
sudo bash /opt/presspass/deploy/enable-https.sh pass.example.com
```

Скрипт отримає сертифікат Let's Encrypt, оновить Nginx і `.env` (`VERIFY_BASE_URL`, `CORS_ORIGIN`) і перезапустить API. Після цього PWA можна встановлювати на телефон.

## Пошта (Resend) і вхід через Google

- **Resend** — реєстраційні листи з кодом підтвердження. Ключ: https://resend.com → `.env`: `RESEND_API_KEY`. Без ключа коди пишуться в лог (`pm2 logs presspass-api`, рядки `[DEV MAIL]`).
- **Google Sign-In** — https://console.cloud.google.com/apis/credentials → OAuth Client ID (Web), Authorized redirect URI: `https://<домен>/api/auth/google/callback` → `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Без них кнопка Google прихована.

Після зміни `.env`: `pm2 restart presspass-api --update-env`.

## Режими доступу (як користувачі відкривають сайт)

Візард питає режим доступу; його можна задати наперед змінною `PP_ACCESS`:

| Режим          | Коли                                                          | Що робить                                                           |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `https-direct` | власний домен, порт 443 прокинутий на сервер                  | сертифікат Let's Encrypt на сервері, редирект HTTP→HTTPS            |
| `proxy`        | за зовнішнім HTTPS-проксі (KeenDNS «через хмару», Cloudflare) | Nginx віддає сайт по HTTP без редиректу, `X-Forwarded-Proto: https` |
| `http`         | локальна мережа / IP, без шифрування                          | простий HTTP                                                        |

Перемкнути **вже встановлений** сервер у режим `proxy` (без перевстановлення):

```bash
sudo bash /opt/presspass/deploy/set-proxy-mode.sh pass.example.com
```

> У режимі `proxy` TLS термінує зовнішній проксі, тож сертифікат Let's Encrypt на сервері не потрібен; переконайтеся, що проксі передає трафік на цей сервер на порт 80.

## Окремий домен для адмінки (PWA vs адмінпанель)

Мобільний застосунок (PWA) призначений лише для журналістів — реєстрація, вхід і перегляд посвідчень; адмінка `/admin` **не входить** до встановлюваного застосунку (service worker її не кешує й не реєструється на її сторінках).

Щоб винести адмінпанель на **окремий домен для ПК**, задайте `PP_ADMIN_DOMAIN` при встановленні:

```bash
sudo PP_DOMAIN=pass.example.ua PP_ADMIN_DOMAIN=admin.pass.example.ua PP_ACCESS=proxy \
     bash deploy/install.sh --yes
```

Тоді Nginx:

- на основному домені (`PP_DOMAIN`, PWA журналіста) блокує `/admin` (`404`);
- на `PP_ADMIN_DOMAIN` віддає адмінку, але **без PWA** — `/(sw.js|manifest.webmanifest)` повертають `404`, тож цей домен не встановлюється як застосунок.

Обидва домени мають вести на цей сервер (додайте піддомен у DNS/Cloudflare-тунелі). Без `PP_ADMIN_DOMAIN` усе працює як раніше — один домен, адмінка за шляхом `/admin`.

## Оновлення

```bash
sudo bash /opt/presspass/deploy/update.sh
```

(= `git pull` → `npm ci` → `prisma migrate deploy` → `npm run build` → `pm2 restart`.)

## Що де знаходиться після встановлення

| Що            | Де                                            |
| ------------- | --------------------------------------------- |
| Застосунок    | `/opt/presspass`                              |
| Конфігурація  | `/opt/presspass/.env` (права 600)             |
| Фотографії    | `/opt/presspass/uploads/photos/`              |
| Nginx-конфіг  | `/etc/nginx/sites-available/presspass`        |
| Процеси       | `pm2 status`, логи: `pm2 logs presspass-api`  |
| Сайт          | `https://домен/` (адмінка — `/admin`)         |
| API + Swagger | `https://домен/api`, `https://домен/api/docs` |

## Ручне встановлення

Ті самі кроки, що виконує візард, вручну.

### 1. Пакети

```bash
sudo apt update && sudo apt install -y git nginx postgresql curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. База даних

```sql
-- sudo -u postgres psql
CREATE USER presspass WITH PASSWORD 'СИЛЬНИЙ_ПАРОЛЬ';
CREATE DATABASE presspass OWNER presspass;
```

### 3. Код і конфігурація

```bash
git clone https://github.com/MaanAndrii/PressPass.git /opt/presspass
cd /opt/presspass && npm ci
cp .env.example .env && nano .env
```

Ключові значення `.env` для продакшену (домен `id.domain.ua`):

```env
DATABASE_URL=postgresql://presspass:СИЛЬНИЙ_ПАРОЛЬ@localhost:5432/presspass?schema=public
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGIN=https://id.domain.ua
VERIFY_BASE_URL=https://id.domain.ua
UPLOADS_DIR=/opt/presspass/uploads      # абсолютний шлях!
NEXT_PUBLIC_API_URL=/api                # відносний: браузер іде через Nginx того ж хоста
API_INTERNAL_URL=http://127.0.0.1:3001  # SSR-сторінки ходять до API напряму
```

`NEXT_PUBLIC_API_URL` вшивається у фронтенд **під час збірки** — заповніть `.env` до `npm run build`; після зміни — перезберіть web. Відносне значення `/api` — рекомендоване: сайт працюватиме з будь-якого домену чи IP, через який його відкрили.

### 4. Міграції, seed, збірка, запуск

```bash
npx prisma migrate deploy
NODE_ENV=production npm run db:seed
npm run build

cd /opt/presspass/apps/api && pm2 start dist/main.js --name presspass-api
cd /opt/presspass/apps/web && pm2 start npm --name presspass-web -- start
pm2 save && pm2 startup
```

### 5. Nginx + HTTPS

Конфіг — як у `deploy/install.sh` (блок `location /api/` з `proxy_pass http://127.0.0.1:3001/` — слеш у кінці зрізає префікс `/api`; `/uploads/` — `alias` на каталог з фото; решта — на `127.0.0.1:3000`). Потім:

```bash
sudo ln -s /etc/nginx/sites-available/presspass /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d id.domain.ua
```

## Типові проблеми

- **QR веде не туди** — `VERIFY_BASE_URL` у `.env` має бути публічною адресою сайту; змінюється без перезбірки (потрібен лише `pm2 restart presspass-api`).
- **«Не вдалося увійти. Спробуйте ще раз.»** — фронтенд не достукується до API: у збірку потрапив неправильний `NEXT_PUBLIC_API_URL`. Переконайтеся, що в `.env` стоїть `NEXT_PUBLIC_API_URL=/api`, і виконайте `npm run build` + `pm2 restart presspass-web` (або просто перезапустіть `sudo bash deploy/install.sh`).
- **Фото не відображаються** — `UPLOADS_DIR` має бути абсолютним шляхом і збігатися з `alias` у Nginx.
- **502 від Nginx** — процес не запущено: `pm2 status`, `pm2 logs presspass-api`.
- **`ERR_TOO_MANY_REDIRECTS` (нескінченний редирект)** — сайт за зовнішнім HTTPS-проксі (KeenDNS «через хмару»), але Nginx налаштований на редирект HTTP→HTTPS. Виконайте `sudo bash deploy/set-proxy-mode.sh <домен>`.
- **404 від Nginx при відкритті за IP** — наслідок `return 404`, який додає certbot для чужого Host; `deploy/enable-https.sh` замінює його на редирект. Для проксі-режиму використовуйте `set-proxy-mode.sh`.
