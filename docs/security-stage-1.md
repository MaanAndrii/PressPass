# Етап 1: owner-key шифрування

## Реалізована модель

PressPass використовує версійовані AES-256-GCM envelopes, випадкові 256-бітні DEK, 96-бітні
nonce, 128-бітні authentication tags та AAD, прив'язаний до entity, record, field і owner. Парольні
wrapping keys виводяться Argon2id з окремою випадковою salt. Зміна passphrase rewrap-ить DEK і не
перешифровує payload.

Ключі утворюють таку ієрархію:

- профіль журналіста має один випадковий Profile DEK;
- Profile DEK wrapped окремою encryption passphrase журналіста;
- кожен адміністратор має випадковий Admin KEK, wrapped його окремою admin passphrase;
- система і кожна редакція мають випадкові KEK;
- System/Editorial KEK wrapped окремо для кожного адміністратора;
- Profile DEK wrapped Editorial KEK для кожної підтвердженої membership;
- кожен owner key sealed через RSA-OAEP-SHA256 у два незалежні Superadmin recovery slots;
- сервер зберігає лише recovery public keys, sealed slots і fingerprints; два encrypted private-key
  kits видаються один раз для роздільного офлайн-зберігання.

`DATA_KEY_SECRET` використовується лише для одноразового читання старих recovery envelopes під час
міграції. Нові owner envelopes від нього не залежать, а verifier `security:verify` вимагає видалення
legacy recovery envelopes.

## Системний ключ читання (суперадмін бачить усіх)

Суперадмін повинен мати онлайн-доступ до всіх журналістів, зокрема самозареєстрованих
без членства в редакції. Для цього є окрема RSA-пара «системного ключа читання»:

- **публічний** ключ зберігається у відкритому вигляді й «запечатує» (RSA-OAEP-256)
  профільний DEK кожного користувача — це не потребує живої сесії, тож працює і при
  самореєстрації;
- **приватний** ключ зберігається лише AES-256-GCM-зашифрованим під System-KEK, тож
  дамп БД без System-KEK його не розкриває;
- розблокований суперадмін (тримає System-KEK у сесії) розшифровує приватний ключ і
  через нього — профільний DEK будь-якого користувача.

Печатка створюється при створенні журналіста/адміністратора та при самореєстрації, а
для акаунтів, що існували до впровадження, — ліниво при їхньому наступному вході.
Це **свідомо обрана модель загроз (Рівень 1)**: гарантія — «копія БД/бекапу/диска без
ключів марна»; захист від активної компрометації живого сервера з привілейованою
сесією досягається операційно (не-root, ізоляція, короткі сесії, аудит), а не крипто.

## Unlock sessions

Authentication не розблоковує всі дані назавжди. API створює випадковий opaque unlock token, а raw
keys тримає лише в RAM протягом не більш як 15 хвилин. Restart, logout, password/key change і явний
`POST /encryption/lock` знищують сесію та обнуляють key buffers. Unlock token можна зберігати в
`sessionStorage`; він не містить key material. Protected responses мають `Cache-Control: private,
no-store`, а service worker не кешує authorization/media/encryption requests.

Google OAuth використовується лише для authentication. Google-only користувач після callback
створює або вводить окрему encryption passphrase. Google subject і email шукаються через незалежні
HMAC blind indexes, а не plaintext.

## Дані в БД

У versioned encrypted payloads переносяться:

- email користувача;
- ПІБ, дата народження, паспорт, ІПН, телефон, членство НСЖУ та інші поля профілю;
- назви й реквізити редакцій;
- номер, посада, дати й snapshot емітента посвідчення;
- runtime settings і secrets;
- глобальні та редакційні card templates.

У plaintext залишаються тільки relational IDs, opaque UUID/public ID, blind indexes, key versions,
lifecycle timestamps і мінімальний revocation status. Email verification code зберігається як
versioned keyed HMAC.

## Файли

Multer приймає файли в memory storage; magic bytes JPEG/PNG/WebP перевіряються до запису. SVG не
приймається. Кожен файл має випадковий File DEK; bytes шифруються до durable storage, а File DEK
wrapped owner key. `/uploads` більше не віддається Nest або Nginx статично. Приватне читання проходить
через authorization-aware `/media/:id`; UI і QR отримують короткоживучі випадкові in-memory media
capabilities. Replacement атомарний, попередні й orphan owner files очищаються сервісом.

## Міграційні команди

```bash
npx prisma migrate deploy
npm run db:seed
npm run security:backfill
npm run security:verify
```

`security:backfill` є idempotent expand/backfill operation: шифрує legacy rows/files, створює blind
indexes, owner grants і recovery slots, очищає legacy columns та записує одноразовий recovery-kit
bundle з правами `0600`. `security:verify` є release gate і падає, якщо знаходить plaintext row,
server recovery envelope, raw verification code або файл у старих `uploads/photos|branding`.

Legacy Google-only accounts без owner envelope отримують recovery-only DEK. Їх IDs записуються в
`recoveryOnlyUsers` recovery bundle; Superadmin має виконати `/encryption/recover-user`, після чого
користувач розблоковує дані окремою passphrase після Google OAuth.

Наявні адміністратори без Admin KEK отримують власний випадковий KEK і одноразову тимчасову фразу в
`adminEnrollmentPassphrases` того самого bundle. Фразу передають захищеним каналом; адміністратор
одразу замінює її через `change-passphrase`.

## Обов'язкове поводження з recovery kits

1. Завантажити bundle з VPS через захищений канал.
2. Зберігати дві passphrase та відповідні kits окремо в офлайн password manager/носіях.
3. Перевірити recovery на staging-копії.
4. Безпечно видалити bundle з VPS.
5. Не надсилати kits або passphrases email і не додавати їх у `.env`, Git, logs чи backup разом із БД.
