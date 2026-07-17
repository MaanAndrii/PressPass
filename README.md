# PressPass Platform

Вебплатформа для видачі, адміністрування та перевірки електронних журналістських посвідчень.

Перша версія (MVP) працює як **PWA** — без окремих застосунків Android/iOS. Архітектура дозволяє в майбутньому додати Flutter-застосунок, Google Wallet, Apple Wallet і push-повідомлення **без зміни серверної частини**.

## Технологічний стек

| Шар      | Технології                                             |
| -------- | ------------------------------------------------------ |
| Backend  | NestJS, Prisma ORM, PostgreSQL, JWT, REST API          |
| Frontend | Next.js (App Router), React, Tailwind CSS, PWA         |
| Якість   | TypeScript strict, ESLint, Prettier, Husky, commitlint |
| CI       | GitHub Actions (lint, build, unit-тести)               |

## Архітектура

```
PWA (Next.js)  →  REST API (NestJS)  →  Prisma ORM  →  PostgreSQL
```

Фронтенд не містить бізнес-логіки — уся взаємодія виконується через REST API.
Детально: [docs/architecture.md](docs/architecture.md).

## Структура репозиторію

```
presspass/
  apps/
    api/        NestJS REST API
    web/        Next.js PWA (журналіст, /admin, /verify)
  packages/
    shared/     спільні типи та утиліти (контракти API)
    ui/         спільні React-компоненти
    config/     спільні пресети tsconfig
  prisma/       схема БД + seed
  docs/         документація, OpenAPI
  uploads/      файли фотографій (не в git)
```

## Розгортання на VPS одним скриптом

```bash
git clone https://github.com/MaanAndrii/PressPass.git /opt/presspass
cd /opt/presspass
sudo bash deploy/install.sh
```

Візард сам встановить Node.js, PostgreSQL, Nginx, PM2, запитає домен і облікові дані адміністратора, налаштує HTTPS (Let's Encrypt) і запустить платформу. Деталі та ручне встановлення: [docs/deploy.md](docs/deploy.md).

## Швидкий старт (локальна розробка)

Вимоги: Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
# 1. Залежності
npm install

# 2. Конфігурація
cp .env.example .env        # відредагуйте DATABASE_URL, JWT_SECRET тощо

# 3. База даних
npx prisma migrate dev      # створює схему
ADMIN_ENCRYPTION_PASSPHRASE='окрема-довга-фраза' npm run db:seed
# Створює encrypted Admin/System keys; passphrase не записуйте в .env production.

# Два незалежні recovery slots + перевірка відсутності plaintext:
SUPERADMIN_RECOVERY_PASSPHRASE_1='перша-довга-recovery-фраза' \
SUPERADMIN_RECOVERY_PASSPHRASE_2='друга-довга-recovery-фраза' \
ADMIN_ENCRYPTION_PASSPHRASE='окрема-довга-фраза' npm run security:backfill
npm run security:verify

# 4. Запуск (у двох терміналах)
npm run dev:api             # http://localhost:3001  (Swagger: /docs)
npm run dev:web             # http://localhost:3000
```

## Основні скрипти

| Команда                    | Опис                          |
| -------------------------- | ----------------------------- |
| `npm run build`            | збірка всіх пакетів           |
| `npm run lint`             | ESLint по всьому репозиторію  |
| `npm run format`           | перевірка Prettier            |
| `npm test`                 | unit-тести API (Jest)         |
| `npm run prisma:migrate`   | міграції БД (dev)             |
| `npm run db:seed`          | початкові дані                |
| `npm run openapi:generate` | оновлення `docs/openapi.json` |

## REST API v1

Swagger UI: `http://localhost:3001/docs`. Специфікація: [docs/openapi.json](docs/openapi.json).

| Метод  | Шлях                           | Доступ    | Опис                              |
| ------ | ------------------------------ | --------- | --------------------------------- |
| POST   | `/auth/login`                  | публічний | вхід, повертає JWT                |
| POST   | `/auth/logout`                 | JWT       | відкликання JWT та unlock session |
| GET    | `/me`                          | JWT       | профіль користувача               |
| GET    | `/card`                        | JWT       | посвідчення журналіста            |
| GET    | `/verify/:uuid`                | публічний | перевірка посвідчення             |
| GET    | `/admin/journalists`           | ADMIN     | список журналістів                |
| POST   | `/admin/journalists`           | ADMIN     | створення журналіста              |
| PUT    | `/admin/journalists/:id`       | ADMIN     | редагування журналіста            |
| DELETE | `/admin/journalists/:id`       | ADMIN     | видалення журналіста              |
| POST   | `/admin/journalists/:id/photo` | ADMIN     | завантаження фото                 |
| GET    | `/admin/cards`                 | ADMIN     | список посвідчень                 |
| POST   | `/admin/cards`                 | ADMIN     | видача посвідчення                |
| PUT    | `/admin/cards/:id`             | ADMIN     | редагування посвідчення           |
| POST   | `/admin/cards/block`           | ADMIN     | блокування посвідчення            |
| POST   | `/admin/cards/renew`           | ADMIN     | продовження строку дії            |

## QR та перевірка

QR-код містить **лише URL** виду `https://id.domain.ua/verify/{uuid}` (UUIDv7, без персональних даних). Публічна сторінка `/verify/[uuid]` показує фото, ПІБ, редакцію, посаду, номер, статус і дату завершення; для відкликаного посвідчення — **«ПОСВІДЧЕННЯ НЕДІЙСНЕ»**.

## Безпека

HTTPS-only (production), JWT, Argon2, UUIDv7, rate limiting (глобально + жорсткіше для `/auth/login` і `/verify`), CORS, Helmet, валідація вхідних даних (захист від SQLi/XSS), фото шифруються окремими File DEK у `uploads/encrypted/` і віддаються лише через контрольований API.

## Документація

- [docs/architecture.md](docs/architecture.md) — архітектура та рішення
- [docs/database.md](docs/database.md) — структура БД
- [docs/api.md](docs/api.md) — опис API
- [docs/deploy.md](docs/deploy.md) — розгортання на VPS (візард і вручну)
- [docs/development.md](docs/development.md) — процес розробки, конвенції
- [docs/security-roadmap.md](docs/security-roadmap.md) — актуальний стан і дорожня карта безпеки до релізу
- [docs/security-stage-1.md](docs/security-stage-1.md) — owner-key encryption, unlock і recovery
- [docs/adr/0001-owner-key-encryption.md](docs/adr/0001-owner-key-encryption.md) — погоджена криптографічна модель
- [CHANGELOG.md](CHANGELOG.md)

## Ліцензія

[MIT](LICENSE)
