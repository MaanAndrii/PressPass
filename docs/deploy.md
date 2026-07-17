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

### Поверх старої інсталяції на VPS

Не запускайте `deploy/install.sh` поверх робочої інсталяції: для оновлення використовуйте наведений
нижче порядок. Він зберігає поточний `.env` і uploads, робить backup перед міграціями та дозволяє
повернути код до попереднього коміту. Команди розраховані на стандартне розміщення
`/opt/presspass` і PostgreSQL-базу `presspass`.

> Перед оновленням переконайтеся, що маєте вільне місце щонайменше для двох копій БД та uploads.
> Не продовжуйте, якщо `pg_dump` або перевірка архіву завершилися помилкою.

1. Підключіться по SSH, перейдіть у каталог застосунку і зафіксуйте поточну версію:

```bash
sudo -i
cd /opt/presspass
git status --short
git rev-parse HEAD | tee /root/presspass-before-upgrade.txt
pm2 status
```

`git status --short` має бути порожнім. Якщо є локальні зміни, спочатку збережіть і проаналізуйте
їх — `git reset --hard` видалить їх без можливості відновлення.

2. Збережіть конфігурацію, БД і файли:

```bash
BACKUP_DIR="/root/presspass-backup-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$BACKUP_DIR"
cp -a .env "$BACKUP_DIR/.env"
pg_dump --format=custom --file="$BACKUP_DIR/presspass.dump" \
  "$(sed -n 's/^DATABASE_URL=//p' .env)"
tar --create --gzip --file="$BACKUP_DIR/uploads.tar.gz" uploads
pg_restore --list "$BACKUP_DIR/presspass.dump" >/dev/null
tar --test-label --file="$BACKUP_DIR/uploads.tar.gz" >/dev/null
sha256sum "$BACKUP_DIR/presspass.dump" "$BACKUP_DIR/uploads.tar.gz" \
  >"$BACKUP_DIR/SHA256SUMS"
```

Якщо пароль PostgreSQL у `DATABASE_URL` містить символи, які URL-кодуються, використовуйте замість
останнього аргументу `pg_dump` звичні `-h`, `-U`, `-d` та `PGPASSWORD`. Не друкуйте `.env` або URL
бази в shell history чи в чат підтримки.

3. Завантажте новий код без автоматичного merge і перевірте, що потрібна версія доступна:

```bash
git fetch --prune origin
git log --oneline --decorate HEAD..origin/main
git checkout main
git pull --ff-only origin main
```

Якщо інсталяція відстежує іншу production-гілку або tag, підставте її замість `main`.

4. Встановіть залежності, згенеруйте Prisma Client і виконайте перевірки **до** зміни БД:

```bash
npm ci --no-audit --no-fund
npx prisma generate
npm run lint
npm run format
npm test
npm run build
```

5. Додайте незалежний blind-index key. Не використовуйте для нього `JWT_SECRET` або
   `DATA_KEY_SECRET`:

```bash
cd /opt/presspass
grep -q '^LOOKUP_KEY=' .env || {
  umask 077
  printf 'LOOKUP_KEY=%s\n' "$(openssl rand -hex 32)" >>.env
}
```

6. Зупиніть застосунок на maintenance window і введіть owner/recovery passphrases. Вони навмисно
   **не записуються в `.env`**:

```bash
pm2 stop presspass-api presspass-web
read -rsp 'Окрема crypto-фраза Superadmin: ' ADMIN_ENCRYPTION_PASSPHRASE; echo
read -rsp 'Offline recovery passphrase #1: ' SUPERADMIN_RECOVERY_PASSPHRASE_1; echo
read -rsp 'Offline recovery passphrase #2: ' SUPERADMIN_RECOVERY_PASSPHRASE_2; echo
export ADMIN_ENCRYPTION_PASSPHRASE
export SUPERADMIN_RECOVERY_PASSPHRASE_1
export SUPERADMIN_RECOVERY_PASSPHRASE_2
export RECOVERY_KIT_OUTPUT="/root/presspass-recovery-kits-$(date -u +%Y%m%dT%H%M%SZ).json"
```

Crypto-фраза адміністратора має відрізнятися від login password. Дві recovery passphrase також
мають бути незалежними. Не вставляйте їх у shell command line, де їх побачить `ps` або history.

7. Застосуйте additive schema, ініціалізуйте owner keys, виконайте resumable backfill і обов'язкову
   перевірку відсутності plaintext:

```bash
npx prisma migrate status
npx prisma migrate deploy
NODE_ENV=production npm run db:seed
npm run security:backfill
npm run security:verify
test -s "$RECOVERY_KIT_OUTPUT" && chmod 600 "$RECOVERY_KIT_OUTPUT"
sudo bash deploy/disable-static-uploads.sh
unset ADMIN_ENCRYPTION_PASSPHRASE
unset SUPERADMIN_RECOVERY_PASSPHRASE_1
unset SUPERADMIN_RECOVERY_PASSPHRASE_2
```

`security:backfill` можна безпечно продовжити після виправлення помилки. Не запускайте стару версію
застосунку після початку backfill: частина legacy columns уже може бути очищена. Якщо verifier не
пройшов, production залишається в maintenance mode.

Bundle містить одноразові recovery kits, список `recoveryOnlyUsers` для legacy Google-only accounts
та `adminEnrollmentPassphrases` для наявних адміністраторів, які ще не мали окремого Admin KEK.
Передайте кожному такому адміністратору його тимчасову фразу захищеним каналом і вимагайте негайний
`change-passphrase`. Скопіюйте bundle з VPS, перевірте recovery на staging, збережіть дві recovery
копії офлайн окремо від passphrases, а серверну копію безпечно видаліть.
`disable-static-uploads.sh` прибирає старий Nginx `location /uploads/`, перевіряє конфігурацію та
перезавантажує Nginx. Не пропускайте цей крок: інакше старий alias продовжить обходити API.

8. Зберіть новий код, перезапустіть процеси:

```bash
npm run build
pm2 restart presspass-api presspass-web --update-env
pm2 save
```

Не запускайте `prisma migrate dev`, `prisma db push` або повторний seed на production.

9. Перевірте процеси та HTTP-відповіді:

```bash
pm2 status
pm2 logs presspass-api --lines 100 --nostream
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3001/docs-json >/dev/null
nginx -t
```

Після цього вручну перевірте через публічний HTTPS-домен: login, `/card`, адмінку, відкриття фото,
створення свіжого QR та `/verify/...`. Старі активні сесії можуть вимагати повторного входу після
security-оновлень.

#### Відкат

Якщо міграції **ще не застосовувалися**, поверніть код і процеси:

```bash
cd /opt/presspass
git checkout "$(cat /root/presspass-before-upgrade.txt)"
npm ci --no-audit --no-fund
npx prisma generate
npm run build
pm2 restart presspass-api presspass-web --update-env
```

Після застосування міграцій не використовуйте довільний `prisma migrate resolve` і не відкочуйте
лише код: новий schema contract може бути несумісним зі старим застосунком. Зупиніть процеси,
відновіть **узгоджену пару** старого коду, database dump та uploads у maintenance window. Перед
відновленням збережіть окрему копію невдало оновленого стану для аналізу.

```bash
pm2 stop presspass-api presspass-web
# Команди нижче руйнівні: перевірте BACKUP_DIR і назву БД перед виконанням.
dropdb --if-exists presspass
createdb --owner=presspass presspass
pg_restore --clean --if-exists --no-owner --dbname=presspass \
  "$BACKUP_DIR/presspass.dump"
rm -rf /opt/presspass/uploads
tar --extract --gzip --file="$BACKUP_DIR/uploads.tar.gz" --directory=/opt/presspass
git checkout "$(cat /root/presspass-before-upgrade.txt)"
npm ci --no-audit --no-fund
npx prisma generate
npm run build
pm2 restart presspass-api presspass-web --update-env
```

Якщо production використовує нестандартну назву/власника БД, адаптуйте `dropdb`, `createdb` і
`pg_restore` до `DATABASE_URL`. Спершу відрепетируйте restore на окремій тестовій БД.

### Швидке оновлення без ручного backup

Для dev/demo-сервера, де втрата даних прийнятна:

```bash
sudo bash /opt/presspass/deploy/update.sh
```

(= `git pull` → `npm ci` → `prisma migrate deploy` → `npm run build` → `pm2 restart`.)

Поточний `update.sh` не створює backup, не виконує health check і не забезпечує rollback, тому для
production використовуйте повну процедуру вище.

## Що де знаходиться після встановлення

| Що               | Де                                            |
| ---------------- | --------------------------------------------- |
| Застосунок       | `/opt/presspass`                              |
| Конфігурація     | `/opt/presspass/.env` (права 600)             |
| Ciphertext-файли | `/opt/presspass/uploads/encrypted/`           |
| Nginx-конфіг     | `/etc/nginx/sites-available/presspass`        |
| Процеси          | `pm2 status`, логи: `pm2 logs presspass-api`  |
| Сайт             | `https://домен/` (адмінка — `/admin`)         |
| API + Swagger    | `https://домен/api`, `https://домен/api/docs` |

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
DATA_KEY_SECRET=<чинне legacy-значення або openssl rand -hex 32 для нової БД>
LOOKUP_KEY=<openssl rand -hex 32>
ADMIN_ENCRYPTION_PASSPHRASE=<окрема довга crypto-фраза адміністратора>
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
read -rsp 'Offline recovery passphrase #1: ' SUPERADMIN_RECOVERY_PASSPHRASE_1; echo
read -rsp 'Offline recovery passphrase #2: ' SUPERADMIN_RECOVERY_PASSPHRASE_2; echo
export SUPERADMIN_RECOVERY_PASSPHRASE_1 SUPERADMIN_RECOVERY_PASSPHRASE_2
export RECOVERY_KIT_OUTPUT="/root/presspass-recovery-kits-$(date -u +%Y%m%dT%H%M%SZ).json"
npm run security:backfill
npm run security:verify
chmod 600 "$RECOVERY_KIT_OUTPUT"
unset SUPERADMIN_RECOVERY_PASSPHRASE_1 SUPERADMIN_RECOVERY_PASSPHRASE_2
npm run build

cd /opt/presspass/apps/api && pm2 start dist/main.js --name presspass-api
cd /opt/presspass/apps/web && pm2 start npm --name presspass-web -- start
pm2 save && pm2 startup
```

До запуску API винесіть `$RECOVERY_KIT_OUTPUT` із VPS, роздільно збережіть обидві passphrase,
перевірте recovery на staging-копії та видаліть серверну копію kit bundle.

### 5. Nginx + HTTPS

Конфіг — як у `deploy/install.sh` (блок `location /api/` з `proxy_pass http://127.0.0.1:3001/` — слеш у кінці зрізає префікс `/api`; direct `/uploads/` відсутній; решта — на `127.0.0.1:3000`). Потім:

```bash
sudo ln -s /etc/nginx/sites-available/presspass /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d id.domain.ua
```

## Типові проблеми

- **QR веде не туди** — `VERIFY_BASE_URL` у `.env` має бути публічною адресою сайту; змінюється без перезбірки (потрібен лише `pm2 restart presspass-api`).
- **«Не вдалося увійти. Спробуйте ще раз.»** — фронтенд не достукується до API: у збірку потрапив неправильний `NEXT_PUBLIC_API_URL`. Переконайтеся, що в `.env` стоїть `NEXT_PUBLIC_API_URL=/api`, і виконайте `npm run build` + `pm2 restart presspass-web` (або просто перезапустіть `sudo bash deploy/install.sh`).
- **Фото не відображаються** — перевірте unlock session, `UPLOADS_DIR`, права `0700` каталогу `uploads/encrypted` і відсутність старого Nginx alias `/uploads/`.
- **502 від Nginx** — процес не запущено: `pm2 status`, `pm2 logs presspass-api`.
- **`ERR_TOO_MANY_REDIRECTS` (нескінченний редирект)** — сайт за зовнішнім HTTPS-проксі (KeenDNS «через хмару»), але Nginx налаштований на редирект HTTP→HTTPS. Виконайте `sudo bash deploy/set-proxy-mode.sh <домен>`.
- **404 від Nginx при відкритті за IP** — наслідок `return 404`, який додає certbot для чужого Host; `deploy/enable-https.sh` замінює його на редирект. Для проксі-режиму використовуйте `set-proxy-mode.sh`.
