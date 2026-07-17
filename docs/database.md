# Структура бази даних

СУБД: PostgreSQL. ORM: Prisma (схема — [`prisma/schema.prisma`](../prisma/schema.prisma)).

## Таблиці

### users

Облікові записи (адміністратори та журналісти).

| Колонка             | Тип                | Опис                                                                         |
| ------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `id`                | serial PK          |                                                                              |
| `email`             | text unique        | логін                                                                        |
| `password_hash`     | text nullable      | Argon2id; NULL для Google-акаунтів                                           |
| `role`              | enum `Role`        | `ADMIN` \| `EDITORIAL_ADMIN` \| `JOURNALIST`                                 |
| `email_verified_at` | timestamp nullable | момент підтвердження пошти                                                   |
| `google_id`         | text unique null.  | `sub` з Google OAuth                                                         |
| `editorial_id`      | int FK nullable    | для `EDITORIAL_ADMIN` — редакція, до якої прив'язаний (`ON DELETE SET NULL`) |
| `created_at`        | timestamp          |                                                                              |
| `updated_at`        | timestamp          |                                                                              |

`ADMIN` — системний адміністратор (бачить усю систему, керує адміністраторами). `EDITORIAL_ADMIN` — редакційний адміністратор: прив'язаний до `editorial_id` і може видавати/видаляти посвідчення та керувати профілем лише своєї редакції.

### email_verifications

Одноразові коди підтвердження реєстрації: `user_id` (unique FK), `code` (6 цифр), `expires_at` (15 хв), `attempts` (макс. 5).

### journalists

Профіль журналіста (1:1 з `users`).

| Колонка           | Тип           | Опис                                                                       |
| ----------------- | ------------- | -------------------------------------------------------------------------- |
| `id`              | serial PK     |                                                                            |
| `user_id`         | int unique FK | → `users.id`, `ON DELETE CASCADE`                                          |
| `public_id`       | text unique   | короткий код (`JR-XXXXXX`), який журналіст передає адміну для додавання    |
| `full_name`       | text          | ПІБ                                                                        |
| `full_name_en`    | text          | ПІБ латиницею (для двомовної картки)                                       |
| `position`        | text          | посада                                                                     |
| `position_en`     | text          | посада англійською (для англомовної сторони картки; фолбек на `position`)  |
| `organization`    | text          | редакція                                                                   |
| `organization_en` | text          | редакція англійською (фолбек на `organization`)                            |
| `photo_path`      | text nullable | legacy compatibility shell; production value міститься в encrypted payload |
| `birth_date`      | date nullable | анкета: дата народження                                                    |
| `passport_data`   | text nullable | анкета: паспортні дані                                                     |
| `tax_number`      | text nullable | анкета: ІПН (10 цифр)                                                      |
| `phone`           | text nullable | анкета: телефон                                                            |
| `nszhu_member`    | boolean       | член НСЖУ — вмикає логотип НСЖУ на посвідченні                             |
| `primary_card_id` | int nullable  | основне посвідчення, вибране журналістом (коли їх кілька)                  |
| `self_registered` | boolean       | створений самореєстрацією (анкета обовʼязкова перед видачею)               |
| `created_at`      | timestamp     |                                                                            |
| `updated_at`      | timestamp     |                                                                            |

Анкетні поля заповнює сам користувач після реєстрації (`PUT /profile`). Для `self_registered` посвідчення видається лише з повністю заповненою анкетою (включно з фото). Посаду (`cards.position`) і редакцію задає редакція-емітент під час видачі — journalist-колонки `position`/`organization` більше не використовуються для картки (лишаються для сумісності).

### editorials

Компанії-емітенти («редакції»), від імені яких видаються посвідчення. Адміністратор веде довідник у розділі «Редакції». Логотип редакції потрапляє на картку.

| Колонка                | Тип           | Опис                                                                                                   |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                   | serial PK     |                                                                                                        |
| `name`                 | text          | повна юридична назва (обовʼязкова)                                                                     |
| `display_name_uk`      | text          | назва для відображення в посвідченні (укр.; фолбек на `name`)                                          |
| `display_name_en`      | text          | назва для відображення в посвідченні (англ.; фолбек на `name`)                                         |
| `media_id`             | text          | ідентифікатор медіа, маска `***-*****` (напр. `R40-02551`); показується на посвідченні, коли заповнено |
| `card_number_prefix`   | text          | префікс нумерації посвідчень (унікальний серед редакцій)                                               |
| `card_number_template` | text          | шаблон номера з токенів `{prefix} {year} {YY} {seq} {seq:N} {mediaId}`                                 |
| `edrpou`               | text          | код ЄДРПОУ                                                                                             |
| `website`              | text          | офіційний сайт — сторінка з реєстром посвідчень                                                        |
| `logo_path`            | text nullable | legacy compatibility shell; logo path міститься в encrypted payload                                    |
| `director`             | text          | директор (керівник)                                                                                    |
| `email`                | text          | електронна адреса                                                                                      |
| `address`              | text          | фізична адреса                                                                                         |
| `phone`                | text          | контактний телефон                                                                                     |
| `created_at`           | timestamp     |                                                                                                        |
| `updated_at`           | timestamp     |                                                                                                        |

### editorial_memberships

Членство журналіст ↔ редакція (багато-до-багатьох). Редакційний адміністратор бачить лише журналістів, які є членами його редакції; журналіст стає членом, коли адмін додає його за `public_id` або коли редакція видає йому посвідчення.

| Колонка         | Тип       | Опис                                    |
| --------------- | --------- | --------------------------------------- |
| `id`            | serial PK |                                         |
| `editorial_id`  | int FK    | → `editorials.id`, `ON DELETE CASCADE`  |
| `journalist_id` | int FK    | → `journalists.id`, `ON DELETE CASCADE` |
| `created_at`    | timestamp |                                         |

Унікальний ключ `(editorial_id, journalist_id)`.

### cards

Посвідчення (журналіст може мати кілька; актуальне — останнє видане).

| Колонка         | Тип               | Опис                                                                               |
| --------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `id`            | serial PK         |                                                                                    |
| `uuid`          | uuid unique       | **UUIDv7**; єдиний ідентифікатор у QR                                              |
| `journalist_id` | int FK (indexed)  | → `journalists.id`, `ON DELETE CASCADE`                                            |
| `editorial_id`  | int FK nullable   | → `editorials.id`, `ON DELETE SET NULL`; редакція-емітент (обов'язкова при видачі) |
| `position`      | text              | посада на посвідченні (задає редакція при видачі)                                  |
| `position_en`   | text              | посада англійською                                                                 |
| `card_number`   | text unique       | людиночитний номер (за шаблоном редакції, напр. `KV-2026-000042`)                  |
| `number_seq`    | int               | порядковий номер у межах редакції та року (для нумерації)                          |
| `issue_date`    | date              | дата видачі                                                                        |
| `expire_date`   | date              | дата завершення (включно)                                                          |
| `status`        | enum `CardStatus` | `ACTIVE` \| `BLOCKED` \| `EXPIRED`                                                 |
| `created_at`    | timestamp         |                                                                                    |
| `updated_at`    | timestamp         |                                                                                    |

Коли посвідчення повʼязане з редакцією, на картці та сторінці перевірки показуються назва й логотип редакції (замість текстового поля `organization` журналіста).

### positions

Довідник посад (укр./англ.), з якого адміністратор вибирає посаду при видачі посвідчення.

| Колонка   | Тип       | Опис              |
| --------- | --------- | ----------------- |
| `id`      | serial PK |                   |
| `name_uk` | text      | назва українською |
| `name_en` | text      | назва англійською |

### card_templates

Шаблони дизайну картки у форматі JSON (`data`): тема (кольори, логотип, заголовок, розміри/розташування, футер) + поля (`flow`-режим) або вільно розташовані елементи (`absolute`-режим). `editorial_id` (nullable, unique) прив'язує дизайн до конкретної редакції; рядок з `editorial_id = NULL` (`id = 1`) — системний стандарт, який успадковують редакції без власного дизайну. Картка резолвиться так: дизайн своєї редакції → системний стандарт → вбудований стандарт. Вхідні дані завжди санітизуються (білий список ключів, hex-кольори, числові межі, координати в межах полотна).

### app_settings

Singleton-рядок (`id = 1`) з налаштуваннями, які можна змінювати з адмінки: `resend_api_key`, `mail_from`, `nszhu_logo_path` (шлях до завантаженого логотипа НСЖУ). Значення тут мають пріоритет над відповідними змінними середовища; ключ ніколи не повертається клієнту повністю (лише маскований).

## Статуси

У БД записуються `ACTIVE` і `BLOCKED`. `EXPIRED` обчислюється при читанні: якщо поточна дата пізніша за `expire_date` (включно до кінця дня), картка зі статусом `ACTIVE` повертається як `EXPIRED`. `BLOCKED` має пріоритет над датами.

## Міграції та seed

```bash
npx prisma migrate dev    # застосувати/створити міграції (dev)
npx prisma migrate deploy # застосувати міграції (production)
npm run db:seed           # адміністратор (+ демо-журналіст поза production)
```

## Owner-key encryption (schema v1)

Meaningful fields are stored in nullable `encrypted_data` JSON envelopes during the expand/backfill
migration. Legacy typed columns remain only as empty compatibility shells and are checked by
`npm run security:verify`; they must not contain production values.

- `users.email_blind_index` and `users.google_id_blind_index` are versioned HMAC lookup indexes;
  `users.email`/`google_id` contain the same opaque lookup value for transitional unique constraints.
- `admin_key_material` stores a passphrase-wrapped random Admin KEK.
- `system_key_material` + `system_admin_key_slots` wrap the system KEK independently per Superadmin.
- `editorial_key_material` + `editorial_admin_key_slots` do the same per editorial/admin.
- `editorial_data_key_grants` wrap one Profile DEK with the corresponding Editorial KEK.
- `superadmin_key_slots` contains exactly two independently wrapped recovery slots per owner. Offline
  recovery-kit bytes and passphrases are never persisted in PostgreSQL.
- `encrypted_files` stores opaque file metadata and a wrapped random File DEK; ciphertext bytes live
  only in `uploads/encrypted/*.ppenc`.

Relational IDs, opaque public IDs/UUIDs, key versions, lifecycle timestamps, membership relations and
card revocation status remain operational metadata. See `docs/adr/0001-owner-key-encryption.md` for
threat-model and lifecycle decisions.
