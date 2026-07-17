# Дорожня карта безпеки та підготовки PressPass до релізу

Оновлено: 17 липня 2026 року.

Цей документ звіряє початкову дорожню карту з поточним кодом. Позначення:

- ✅ **виконано** — реалізація та релевантні unit-тести вже є;
- 🟡 **частково** — фундамент є, але початковий критерій приймання ще не досягнуто;
- ⬜ **не виконано** — реалізації або release gate немає;
- 🔒 **блокер релізу** — без цього публічний production-реліз заборонений.

## Короткий стан

| Напрям                                         | Стан  | Висновок                                                                             |
| ---------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| Криптографічні примітиви та user key envelopes | ✅    | Етапи фундаменту реалізовані й покриті unit-тестами                                  |
| Шифрування змістовних даних і файлів           | ✅    | Encrypted payloads/files, backfill і plaintext verifier реалізовані                  |
| Власницька ієрархія ключів                     | ✅    | Per-user/admin/editorial/system KEK slots і два offline Superadmin recovery slots    |
| Відкликання JWT                                | 🟡    | Logout і зміна пароля відкликають access tokens; refresh/session mechanism відсутній |
| Членство та grants                             | 🟡    | Many-to-many і grants є; consent-based `PENDING` flow відсутній                      |
| Unit-тести                                     | 🟡    | 99 тестів проходять, включно з crypto; frontend-тестів і coverage gate немає         |
| PostgreSQL integration та E2E                  | ⬜ 🔒 | Відсутні                                                                             |
| PWA isolation                                  | 🟡 🔒 | Приватні API/media відповіді виключені з кешу; окремий browser E2E gate ще потрібен  |
| Production operations                          | ⬜ 🔒 | Немає backup/health-check/rollback/deploy lock; PM2 запускається від root            |

## Етап 0. Зафіксувати криптографічну модель

**Статус: ✅ погоджено й реалізовано ADR 0001.**

ADR 0001 фіксує owner-held модель із короткоживучими API unlock sessions, окремими Admin KEK,
Editorial/System KEK та двома offline Superadmin recovery slots. `DATA_KEY_SECRET` лишається тільки
міграційним compatibility key і не відкриває нові owner envelopes.

### Погоджені рішення

- ✅ **Decryption boundary:** короткоживуча API unlock session; client-side decrypt лишається
  post-release проєктом.
- ✅ **Google Login:** Google OAuth виконує authentication, а окрема passphrase — encryption unlock.
- ✅ **Ключі адміністраторів:** випадковий Admin KEK, passphrase-wrapped через Argon2id; raw key живе
  не більш як 15 хвилин у памʼяті API.
- ✅ **Editorial Key:** випадковий Editorial KEK, wrapped окремо для кожного адміністратора.
- ✅ **Superadmin recovery:** дві RSA-OAEP recovery authorities; сервер має тільки public keys і
  sealed owner slots, private keys існують лише у двох окремих encrypted offline kits.
- ✅ **Threat model:** ADR розділяє захист від копії БД/uploads та межі при компрометації live API,
  XSS або довіреного адміністратора.

### Критерій завершення

Є затверджений ADR із форматами envelope, власниками ключів, unlock/session flow, recovery та
межами захисту. Legacy server recovery envelope читається лише під час backfill і після успішної
міграції обовʼязково видаляється verifier-controlled процедурою.

## Етап 1. Криптографічний фундамент і шифрування даних

**Пріоритет: P0 — до релізу.**

### 1.1 Криптографічні примітиви — ✅ виконано

- ✅ AES-256-GCM, випадкові 256-бітні Data Keys і nonce на кожне шифрування.
- ✅ Auth tag та AAD, прив'язаний до entity, entity ID, field і owner ID.
- ✅ Версійований envelope (`version: 1`, `algorithm: AES-256-GCM`).
- ✅ Argon2id із випадковою salt і перевіреними межами параметрів.
- ✅ Wrap, unwrap і rewrap Data Key без перешифрування даних.
- ✅ Тимчасові key buffers очищаються у критичних flows.

### 1.2 Ієрархія ключів — ✅ виконано

- ✅ Один випадковий profile Data Key для password account.
- ✅ Password-derived User Wrapping Key і wrapped profile Data Key.
- ✅ Два owner-key Superadmin recovery slots та окремий encrypted grant на кожну редакцію.
- ✅ Raw Data Key не зберігається Prisma.
- ✅ Нові Editorial/System keys випадкові та не derived із `DATA_KEY_SECRET`.
- ✅ Власний passphrase-wrapped KEK кожного адміністратора.
- ✅ Editorial/System Key wrapped окремо для кожного адміністратора.
- ✅ Два незалежні Superadmin slots та одноразові encrypted offline recovery kits.

### 1.3 Шифрування змістовних даних — ✅ реалізовано

Зашифрувати й мігрувати:

- ✅ user email та інші змістовні user fields;
- ✅ ПІБ, дата народження, паспорт, ІПН, телефон і профіль журналіста;
- ✅ назва та реквізити редакції;
- ✅ номер, посада, дати та інші дані картки;
- ✅ налаштування і шаблони;
- ✅ email verification code/data;
- ✅ фотографії, логотипи та інші приватні файли.

Для кожного типу даних визначити schema version, AAD context, максимальний розмір, механізм
часткового оновлення та правила redaction у логах.

### 1.4 Безпечний lookup — ✅ реалізовано

- ✅ Єдина канонічна нормалізація email.
- ✅ Зашифрований email замість plaintext unique column.
- ✅ Версійований keyed blind index для login/uniqueness.
- ✅ Окремий lookup key із можливістю ротації.
- 🟡 Уніфіковані відповіді проти account enumeration у register/resend/verify винесено до auth-hardening етапу; це не змінює конфіденційність dump або lookup model Етапу 1.

### 1.5 Зашифровані файли — ✅ реалізовано

- ✅ Прибрати прямий `express.static` для приватних uploads.
- ✅ Шифрувати bytes окремим file Data Key або профільним ключем із унікальним AAD.
- ✅ Віддавати файл тільки через авторизований endpoint із перевіркою membership/owner access.
- ✅ Не кешувати decrypted response у shared/browser/proxy caches.
- ✅ Атомарна заміна, cleanup старих файлів та orphan cleanup job.
- ✅ Перенести існуючі plaintext uploads і безпечно видалити оригінали.

### Результат етапу

Dump БД і копія uploads без owner-authorized unlock не розкривають імен, email, паспортних даних,
назв редакцій, даних посвідчень і зображень. Цей результат забезпечують `security:backfill` та обов’язковий gate `security:verify`; production deployment заборонений, доки verifier не пройшов.

## Етап 2. Автентифікація, сесії та членство

**Пріоритет: P0 — до релізу разом з етапом 1.**

### 2.1 Password registration — ✅ фундамент виконано

- ✅ Окремий Argon2 password hash використовується як verifier.
- ✅ Окрема Argon2id salt/descriptor для User Wrapping Key.
- ✅ Випадковий Data Key і wrapped envelope створюються під час реєстрації.
- ✅ Незавершена повторна реєстрація перевипускає key material.
- 🟡 Потрібна транзакційна та PostgreSQL integration-перевірка повного flow.

### 2.2 Password change та адміністративний reset — 🟡 частково

- ✅ Зміна пароля rewrap-ить той самий Data Key.
- ✅ Адміністративний reset використовує recovery envelope, а не перешифровує профіль.
- ✅ Зміна/скидання пароля збільшує `tokenVersion` і відкликає попередні JWT.
- ✅ Recovery використовує один із двох offline private-key kits; server secret не відкриває нові
  owner slots.
- ⬜ Формалізований flow: editorial admin reset лише для своєї редакції, superadmin — для профілю
  без редакції, з audit event і step-up authentication.

### 2.3 Revocable sessions — 🟡 частково

- ✅ Logout більше не stateless: він збільшує `tokenVersion`.
- ✅ Guard звіряє `tokenVersion` із БД на кожному захищеному запиті.
- ✅ Password change/reset відкликає старі токени.
- ⬜ Короткоживучий access token і окремий refresh/session record.
- ⬜ Відкликання конкретної сесії та всіх сесій; перелік активних пристроїв.
- ⬜ Revoke при зміні ролі/editorial scope.
- ⬜ HttpOnly/Secure/SameSite transport замість довгоживучого JWT у `localStorage`.

### 2.4 Журналіст без редакції — ✅ криптографічна частина виконана

- ✅ Самореєстрація створює профіль без membership.
- ✅ Генерується випадковий `publicId`.
- ✅ Profile Data Key має recovery envelope.
- ✅ Profile DEK sealed у два Superadmin slots через offline recovery authorities без редакційного
  grant.

### 2.5 Запит на приєднання — 🟡 частково

- ✅ Адміністратор може знайти журналіста за нормалізованим public ID.
- ✅ Існує many-to-many membership.
- ✅ Після додавання створюється editorial encrypted key grant; при видаленні grant відкликається.
- ⬜ Сутність/статус `PENDING`, строк дії та захист від повторних запитів.
- ⬜ Підтвердження або відхилення журналістом до створення membership/grant.
- ⬜ Notification та audit trail.

### 2.6 Кілька редакцій — 🟡 частково

- ✅ Один профіль, many-to-many memberships, окрема картка та grant для кожної редакції.
- ✅ Editorial admin queries обмежуються його editorial scope на service-рівні.
- ✅ Нові grants wrapped випадковим Editorial KEK, а змістовні дані зберігаються encrypted-at-rest.
- ⬜ PostgreSQL integration/E2E сценарій із двома редакціями та доказом ізоляції.

### Результат етапу

Базові password accounts, кілька memberships, grants, owner-held admin/superadmin keys і JWT
revocation працюють. Consent-based join та refresh sessions залишаються блокерами повного критерію.

## Етап 3. Надійність, тести та quality gates

**Пріоритет: P0/P1 — до release candidate.**

### 3.1 Crypto unit tests — ✅ майже виконано

Уже перевіряються round-trip тексту й bytes, неправильний ключ, tampering/AAD, унікальний nonce,
версія envelope, wrap/rewrap, Argon2id descriptors, recovery та key grants.

- ✅ Поточний набір: 26 suites, 99 tests.
- ✅ Є окремі cases для ciphertext byte flip та auth-tag byte flip.
- ⬜ Додати backward-compatibility fixture для кожної підтримуваної crypto schema version.
- ⬜ Встановити coverage thresholds для crypto/auth/access-control коду.

### 3.2 Самодостатній `npm test` — 🟡 перевірено локально

- ✅ У поточному checkout кореневий `npm test` проходить окремо від `npm run build`.
- ⬜ Закріпити це окремим CI job після `npm ci`, до build, щоб регресію не маскував порядок CI.
- ⬜ Додати автоматичне module mapping/build shared, якщо чистий CI job виявить залежність від
  артефактів workspace.

### 3.3 PostgreSQL integration tests — ⬜ 🔒

Додати disposable PostgreSQL і перевірити:

- чистий `prisma migrate deploy` та seed;
- encrypted-at-rest assertions і пошук plaintext у колонках;
- grants для нуля, однієї та двох редакцій;
- revoke membership і заборону подальшого decrypt;
- конкурентне створення карток/номерів і membership;
- rollback транзакцій та пошкоджений envelope;
- міграцію legacy plaintext даних.

### 3.4 Web та E2E — ⬜ 🔒

Додати Vitest/React Testing Library і Playwright. Мінімальна матриця:

- password registration та email confirmation;
- Google Login і enrollment encryption credential;
- журналіст без редакції;
- join request → confirm/reject;
- дві редакції та дві картки;
- password change/reset;
- admin/superadmin unlock;
- QR verification: valid, expired, wrong token, blocked card;
- logout та відкликання API session;
- account A → logout → account B в одному браузерному профілі.

### 3.5 CI security gates — 🟡 частково

- ✅ `npm ci`, Prisma generate, lint, Prettier, build і API unit tests.
- ⬜ Unit test job до build; integration і E2E jobs.
- ⬜ Coverage thresholds.
- ⬜ Dependency audit/SCA та license policy.
- ⬜ Secret scanning і SAST.
- ⬜ OpenAPI regeneration + zero-diff check.
- ⬜ Scan fixtures, migrations, logs і artifacts на PII/secrets/plaintext markers.
- ⬜ Migration compatibility та encrypted-storage gate.

### 3.6 PWA security — ⬜ 🔒

Поточний service worker кешує майже всі успішні GET, крім `/admin` і `/card/qr`; logout очищає
`localStorage`, але не Cache Storage.

- ⬜ Замінити blanket runtime cache на явний allowlist.
- ⬜ Не кешувати decrypted profile, `/me`, private files, keys або unlock/session responses.
- ⬜ Окремий user-scoped offline card cache лише за затвердженою моделлю загроз.
- ⬜ Logout очищає приватний cache, session state і keys in memory.
- ⬜ Playwright gate доводить, що user B не бачить даних user A.
- ⬜ Перевірити заголовки `Cache-Control` API, Next.js і Nginx.

### Результат етапу

Release pipeline має падати при plaintext storage, access-control bypass, невірній crypto validation,
витоку через PWA, невідтворюваних міграціях або несамодостатніх тестах.

## Етап 4. Міграція та production-експлуатація

**Пріоритет: P1 — до production deployment.**

### 4.1 Міграція існуючих даних — ⬜ 🔒

- backup БД і uploads та перевірка читабельності backup;
- maintenance/read-only mode;
- resumable/idempotent batch encryption із checkpoint;
- перевірка decrypt кожного запису й контроль кількості;
- rehearsal на production-like копії та задокументований rollback;
- видалення plaintext колонок окремою міграцією лише після acceptance;
- secure cleanup plaintext files і повторний dump/filesystem scan.

### 4.2 Безпечний deployment — ⬜ 🔒

Поточний updater виконує pull → install → migrate → build → PM2 restart. Потрібно додати:

- непривілейованого системного користувача замість PM2 від root;
- immutable release directories і deployment lock;
- preflight: disk, DB, secrets, crypto schema, migrations, build artifact;
- backup перед незворотною міграцією;
- API/web health endpoints і post-deploy smoke tests;
- автоматичний rollback app version; окрему політику rollback DB;
- zero/low-downtime порядок restart.

### 4.3 Owner keys і recovery — ⬜ 🔒

- ключ показується один раз із підтвердженням збереження;
- raw key не потрапляє в БД, email, logs, analytics, localStorage або Cache Storage;
- кілька superadmin key slots і revoke/replace процедури;
- encrypted offline recovery copies із регулярною перевіркою;
- runbooks втрати admin key, superadmin key і компрометації ключа.

### 4.4 Observability — ⬜ 🔒

- structured logs і correlation IDs;
- централізована redaction PII, secrets, keys, passwords, tokens і ciphertext metadata;
- незмінний audit log для unlock/reset/rewrap/grant/revoke/export;
- alerts на brute force, масовий decrypt/export і аномальні grant changes;
- process, disk, database, mail, QR та certificate monitoring.

### 4.5 Encrypted backups — ⬜ 🔒

- encrypted/versioned backup БД, files і crypto metadata;
- окреме керування backup keys;
- retention та off-site/offline copy;
- регулярний automated restore test і ручний disaster-recovery drill;
- RPO/RTO та документований runbook.

## Етап 5. Release candidate та post-release backlog

**Пріоритет: release gate.**

### Обов'язкові release gates

- ⬜ Повний E2E regression і PostgreSQL integration suite.
- ⬜ Dump scan: немає імен, email, назв редакцій, номерів карток і verification codes.
- ⬜ Repo/log/backup scan: немає plaintext fixtures, PII або production secrets.
- ⬜ Filesystem scan: фото й логотипи не читаються без authorized decrypt.
- ⬜ Два користувачі в одному браузері без cache/session leakage.
- ⬜ Один журналіст у двох редакціях із доведеною ізоляцією.
- ⬜ Password reset через editorial admin та recovery без редакції через superadmin.
- ⬜ QR verification regression.
- ⬜ Tampered ciphertext/tag/AAD і unsupported version fail closed.
- ⬜ Backup/restore rehearsal у production-like середовищі.
- ⬜ Penetration-focused review: auth, XSS, CSRF, IDOR, uploads, SSRF, key/token leakage.
- ⬜ Обмежений canary release, метрики, alerting і rollback decision window.

### Контрольований post-release backlog

- автоматична ротація wrapping/lookup/root keys;
- повна ротація profile Data Key після виходу з редакції;
- історичні encrypted snapshots;
- окремі Data Keys для полів із різними access/lifecycle rules;
- PostgreSQL RLS як defense in depth;
- WebAuthn/hardware-backed admin keys;
- dual approval для recovery/export/key rotation;
- приховування record counts і membership graph;
- додаткові blind indexes;
- повністю client-side decrypt.

## Рекомендований порядок найближчих робіт

1. **ADR криптомоделі (Етап 0)** — усунути неоднозначність owner-held та server-held keys.
2. **PWA cache containment** — негайно припинити неконтрольоване кешування приватних GET.
3. **Encrypted business fields + blind-indexed email** з dual-read/dual-write migration plan.
4. **Encrypted authorized files** та міграція uploads.
5. **Consent-based join requests** і справжні per-admin/editorial key slots.
6. **Short-lived sessions/refresh records** і відмова від JWT у `localStorage`.
7. **PostgreSQL integration + Playwright E2E** та всі CI security gates.
8. **Production deployment, backup, restore й observability hardening**.
9. **RC rehearsal, penetration review та canary**.

Публічний реліз дозволяється лише після закриття всіх пунктів із позначкою 🔒.
