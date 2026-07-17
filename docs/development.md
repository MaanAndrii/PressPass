# Процес розробки

## Принцип

Кожен модуль проходить цикл: **проєктування → реалізація → тестування → документування**. Код не створюється фрагментами — модулі завершені та готові до розвитку.

## Якість коду

- **TypeScript strict** (`tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`).
- **ESLint + Prettier** — єдина конфігурація в корені (`eslint.config.mjs`, `.prettierrc`).
- **Husky + lint-staged** — перед комітом: `eslint --fix` + `prettier --write` для змінених файлів.
- **Conventional Commits** — перевіряється commitlint у хуку `commit-msg`:
  `feat: …`, `fix: …`, `docs: …`, `chore: …`, `test: …`, `refactor: …`, `ci: …`.
- **GitHub Actions** (`.github/workflows/ci.yml`) — на кожен PR: install → prisma generate → lint → format check → build → unit-тести.

## Тестування

Unit-тести (Jest) покривають критичні модулі API: авторизацію (`auth.service.spec.ts`), видачу/блокування/продовження посвідчень і генерацію UUIDv7 + QR-URL (`cards.service.spec.ts`), публічну перевірку (`verify.service.spec.ts`), обчислення статусів (`card-status.spec.ts`).

```bash
npm test            # всі тести
npm run test:cov -w @presspass/api   # з покриттям
```

Prisma в тестах мокається — БД не потрібна.

## Робота з БД

Схема — єдине джерело правди (`prisma/schema.prisma`). Після зміни схеми:

```bash
npx prisma migrate dev --name <опис-зміни>
npx prisma generate
```

## Оновлення OpenAPI

Після зміни контролерів/DTO: `npm run openapi:generate` (оновлює `docs/openapi.json`) — закомітьте разом зі зміною.

## Змінні середовища

Усі змінні описані в [`.env.example`](../.env.example). Секрети не комітяться; `.env` у `.gitignore`.

## Етапи (SRS §18)

| Фаза | Зміст                                   | Стан                                       |
| ---- | --------------------------------------- | ------------------------------------------ |
| 0    | Проєктування (архітектура, БД, OpenAPI) | ✅                                         |
| 1    | Репозиторій, NestJS, Next.js, Prisma    | ✅                                         |
| 2    | Авторизація                             | ✅                                         |
| 3    | CRUD журналістів                        | ✅                                         |
| 4    | CRUD посвідчень                         | ✅                                         |
| 5    | Генерація QR                            | ✅                                         |
| 6    | PWA, екран посвідчення                  | ✅                                         |
| 7    | Сторінка перевірки                      | ✅                                         |
| 8    | Тестування                              | ✅                                         |
| 9    | Підготовка до деплою                    | ✅ (docs/architecture.md, розділ «Деплой») |
