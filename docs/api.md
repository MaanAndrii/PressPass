# REST API v1

Базовий URL: `https://api.domain.ua` (dev: `http://localhost:3001`).
Формат: JSON. Автентифікація: `Authorization: Bearer <JWT>`.
Інтерактивна документація: Swagger UI на `/docs`; специфікація — [`openapi.json`](openapi.json) (оновлюється командою `npm run openapi:generate`).

## Авторизація

### POST /auth/login (публічний, ≤5 запитів/хв)

```json
{ "email": "admin@presspass.local", "password": "•••" }
```

→ `200`:

```json
{
  "accessToken": "eyJ…",
  "user": { "id": 1, "email": "…", "role": "ADMIN", "journalist": null }
}
```

`401` — невірні дані (однакова відповідь для невідомого email і невірного пароля).

### POST /auth/logout

Stateless: клієнт видаляє токен. → `200 { "success": true }`.

## Самореєстрація

### GET /auth/config (публічний)

`{ "googleEnabled": true|false }` — чи налаштовано вхід через Google.

### POST /auth/register (публічний, ≤5/хв)

`{ "email": "...", "password": "мін. 8 символів" }` → надсилає 6-значний код на пошту (Resend; без `RESEND_API_KEY` код пишеться в лог API). `409` — email вже зареєстрований і підтверджений; для незавершеної реєстрації повторний виклик оновлює пароль і надсилає новий код.

### POST /auth/verify-email (публічний, ≤10/хв)

`{ "email": "...", "code": "123456" }` → активує акаунт і повертає `LoginResponse` (автовхід). Код діє 15 хвилин, максимум 5 спроб.

### POST /auth/resend-code (публічний, ≤2/хв)

`{ "email": "..." }` → новий код.

### GET /auth/google → редирект на Google; callback повертає користувача на `/auth/callback#token=...`

## Анкета (роль JOURNALIST)

### PUT /profile

Всі поля обовʼязкові: `{ "fullName", "birthDate", "passportData", "taxNumber" (10 цифр), "phone" }` → `UserProfile`. Без повністю заповненої анкети (включно з фото) самозареєстрованому користувачу не можна видати посвідчення.

### POST /profile/photo — multipart, поле `photo` (JPEG/PNG/WebP, ≤5 МБ)

### PUT /me/password — зміна власного пароля

`{ "currentPassword": "…", "newPassword": "мін. 8 символів" }` → `{ "success": true }`. Доступно будь-якому автентифікованому користувачу (адміністратору чи журналісту); `400`, якщо поточний пароль невірний.

## Журналіст

### GET /me

Профіль поточного користувача (`UserProfile`). Для журналіста містить `journalist.publicId` (код для передачі адміну медіа) і `memberships` — редакції, до яких його додано.

### GET /cards

Усі посвідчення журналіста (`CardResponse[]`), впорядковані: основне (`isPrimary: true`) → чинні (ACTIVE) найновіші → решта. Застосунок показує перемикач, якщо їх кілька.

### PUT /card/primary — `{ "cardId": 1 }`

Позначає посвідчення основним (має належати журналісту). Повертає оновлений список.

### GET /card

Основне посвідчення журналіста (або найновіше, якщо основне не вибрано):

```json
{
  "id": 1,
  "uuid": "0190…",
  "cardNumber": "PP-2026-000001",
  "issueDate": "2026-07-09",
  "expireDate": "2027-07-09",
  "status": "ACTIVE",
  "position": "Кореспондент",
  "positionEn": "Correspondent",
  "verifyUrl": "https://id.domain.ua/verify/0190…",
  "journalist": { "id": 1, "fullName": "Іван Петренко", "photoPath": "/media/{opaque-file-uuid}" },
  "editorial": {
    "id": 1,
    "name": "ТОВ «Приклад Медіа»",
    "displayNameUk": "Онлайн-медіа «Приклад»",
    "displayNameEn": "«Pryklad» Media",
    "mediaId": "R40-02551",
    "website": "https://pryklad.media/registry",
    "logoPath": "/media/{opaque-file-uuid}"
  }
}
```

Посада береться з посвідчення, редакція — дисплей-назва компанії-емітента, логотип — з реєстру редакцій. `mediaId` (коли заповнено) показується на посвідченні. `404` — посвідчення ще не видано.

## Перевірка (динамічний QR)

### GET /card/qr?cardId=… (роль JOURNALIST)

Свіжий токенізований URL для QR (оновлювати кожні ~30 с). `cardId` (опційно) — для якого посвідчення журналіста (за замовчуванням найновіше):

```json
{ "verifyUrl": "https://…/verify/{uuid}?t=eyJ…", "expiresInSeconds": 60 }
```

Аналог для адміністратора: `GET /admin/cards/:id/qr`.

### GET /verify/:uuid?t=… (публічний, ≤30 запитів/хв)

Дані повертаються **лише за дійсного токена** `t` (підписаний, строк дії `QR_TOKEN_TTL`):

```json
{
  "valid": true,
  "qrStatus": "VALID",
  "status": "ACTIVE",
  "cardNumber": "PP-2026-000001",
  "expireDate": "2027-07-09",
  "fullName": "Іван Петренко",
  "position": "Кореспондент",
  "organization": "Онлайн-медіа «Приклад»",
  "photoPath": "/media/{opaque-file-uuid}",
  "editorial": {
    "id": 1,
    "name": "ТОВ «Приклад Медіа»",
    "displayNameUk": "Онлайн-медіа «Приклад»",
    "displayNameEn": "«Pryklad» Media",
    "mediaId": "R40-02551",
    "website": "https://pryklad.media/registry",
    "logoPath": "/media/{opaque-file-uuid}"
  },
  "nszhuMember": true,
  "nszhuLogoPath": "/media/{opaque-file-uuid}"
}
```

`nszhuMember` — член НСЖУ; `nszhuLogoPath` присутній лише для членів. Прострочений/відсутній/чужий токен → без персональних даних:

```json
{ "valid": false, "qrStatus": "EXPIRED" }
```

`qrStatus`: `VALID` | `EXPIRED` | `MISSING` | `INVALID`. `valid: false` також для `BLOCKED`/`EXPIRED` картки; `404` — невідомий UUID (лише за дійсного токена); `400` — не UUID.

## Адміністратор

Два рівні: **системний адміністратор** (`ADMIN`) бачить усю систему; **редакційний адміністратор** (`EDITORIAL_ADMIN`) прив'язаний до однієї редакції та обмежений нею. Нижче в дужках зазначено, хто має доступ.

### GET /admin/journalists — список (`AdminJournalist[]`) (ADMIN, EDITORIAL_ADMIN)

Системний адміністратор бачить усіх; **редакційний адміністратор — лише журналістів своєї редакції** (членів). Кожен запис містить `publicId` та `memberships` (медіа, до яких належить журналіст).

### POST /admin/journalists/attach — додати журналіста за публічним ID (ADMIN, EDITORIAL_ADMIN)

```json
{ "publicId": "JR-7K3F9Q", "editorialId": 1 }
```

Редакційний адмін додає до **своєї** редакції (поле `editorialId` ігнорується); системний — до вказаної. Ввід нормалізується (регістр/префікс), повторне додавання ідемпотентне, невідомий ID → `404`.

### DELETE /admin/journalists/:id/membership — прибрати журналіста зі своєї редакції (EDITORIAL_ADMIN)

Видаляє лише членство (акаунт журналіста лишається).

### POST /admin/journalists — створення журналіста + облікового запису (ADMIN, EDITORIAL_ADMIN)

```json
{
  "email": "j@example.com",
  "password": "мін. 8 символів",
  "fullName": "…",
  "fullNameEn": "…",
  "nszhuMember": false
}
```

Посаду й редакцію тут не вказують — їх задає редакція при видачі посвідчення. `nszhuMember` (опційно) — член НСЖУ (вмикає логотип НСЖУ на посвідченні). Журналіст, створений **редакційним** адміністратором, автоматично стає членом його редакції. `409` — email вже зайнятий.

### PUT /admin/journalists/:id — часткове оновлення (ADMIN, EDITORIAL_ADMIN)

### DELETE /admin/journalists/:id — видаляє профіль, обліковий запис і посвідчення (**лише ADMIN**)

### POST /admin/journalists/:id/photo — multipart, поле `photo` (ADMIN, EDITORIAL_ADMIN)

### GET /admin/cards — список (`CardResponse[]`); редакційний адмін бачить лише свої (ADMIN, EDITORIAL_ADMIN)

### POST /admin/cards — видача (ADMIN, EDITORIAL_ADMIN)

```json
{
  "journalistId": 1,
  "editorialId": 1,
  "position": "Кореспондент",
  "positionEn": "Correspondent",
  "expireDate": "2027-07-09"
}
```

`editorialId` обов'язковий (посвідчення видається лише від доданої редакції); для редакційного адміна він примусово підставляється з його редакції. `position` (посада на посвідченні) — обов'язковий. `cardNumber`/`issueDate` опційні; UUID (v7) завжди генерується сервером.

### PUT /admin/cards/:id — оновлення полів (`cardNumber`, `issueDate`, `expireDate`, `status`)

### DELETE /admin/cards/:id — видалення посвідчення (редакційний адмін — лише свої)

### POST /admin/cards/block — `{ "cardId": 1 }` → статус `BLOCKED` (лише своя редакція для EDITORIAL_ADMIN)

### POST /admin/cards/renew — `{ "cardId": 1, "expireDate": "2028-07-09" }` → новий строк + статус `ACTIVE`

## Адміністратори (role = ADMIN)

### GET /admin/admins — список облікових записів адміністраторів (`AdminAccount[]`)

### POST /admin/admins — створити редакційного адміністратора

```json
{ "email": "editor@pryklad.media", "password": "мін. 8 символів", "editorialId": 1 }
```

### DELETE /admin/admins/:id — видалити редакційного адміністратора

## Посади (довідник, для випадаючого списку)

### GET /admin/positions — список (`Position[]`) (ADMIN, EDITORIAL_ADMIN)

### POST /admin/positions — `{ "nameUk": "Кореспондент", "nameEn": "Correspondent" }` (**лише ADMIN**)

### PUT /admin/positions/:id — оновлення (**лише ADMIN**)

### DELETE /admin/positions/:id — видалення (**лише ADMIN**)

`409`, якщо посаду вже використовує хоча б одне видане посвідчення.

## Редакції (компанії-емітенти)

### GET /admin/editorials — список (`Editorial[]`); редакційний адмін бачить лише свою (ADMIN, EDITORIAL_ADMIN)

### POST /admin/editorials — створення (**лише ADMIN**)

```json
{
  "name": "ТОВ «Приклад Медіа»",
  "displayNameUk": "Онлайн-медіа «Приклад»",
  "displayNameEn": "«Pryklad» Media",
  "mediaId": "R40-02551",
  "edrpou": "12345678",
  "website": "https://pryklad.media/registry",
  "director": "Іваненко Іван Іванович",
  "email": "office@pryklad.media",
  "address": "м. Київ, вул. Хрещатик, 1",
  "phone": "+380441234567",
  "cardNumberPrefix": "KV",
  "cardNumberTemplate": "{prefix}-{year}-{seq:6}"
}
```

Обовʼязкова лише `name`; решта опційні. `displayNameUk`/`displayNameEn` — назви для відображення в посвідченні (фолбек на `name`). `mediaId` — ідентифікатор медіа за маскою `***-*****` (напр. `R40-02551`); зберігається у верхньому регістрі й показується на посвідченні, коли заповнено. `edrpou` — 8–10 цифр; `website`/`email` валідуються. `cardNumberPrefix` — унікальний серед редакцій префікс нумерації; `cardNumberTemplate` — шаблон номера з токенів `{prefix} {year} {YY} {seq} {seq:N} {mediaId}` (лічильник скидається щороку, окремий для редакції). `409` при повторі префікса.

### PUT /admin/editorials/:id — часткове оновлення (редакційний адмін — лише свою) (ADMIN, EDITORIAL_ADMIN)

### DELETE /admin/editorials/:id — видалення (**лише ADMIN**; видані посвідчення зберігаються, `editorial_id` → NULL)

`409`, якщо в редакції є журналісти (членство) — спершу приберіть їх.

### POST /admin/editorials/:id/logo — multipart, поле `logo` (редакційний адмін — лише свою) (ADMIN, EDITORIAL_ADMIN)

## Дизайн посвідчення (шаблон)

Вигляд картки зберігається як дані (тема + поля/елементи), тож дизайн можна змінювати без перевидання. **Дизайн може бути власним для кожної редакції**: картка резолвиться як дизайн своєї редакції → системний стандарт → вбудований стандарт.

### GET /branding (публічний)

Брендинг, потрібний для рендерингу картки (без секретів): `{ "nszhuLogoPath": "/media/{opaque-file-uuid}" | null }`. Логотип НСЖУ показується на картці лише для журналістів-членів НСЖУ.

### GET /card-template?editorialId=… (публічний)

Активний шаблон для редакції (лише брендинг, без секретів). Без `editorialId` повертається системний стандарт:

```json
{
  "theme": {
    "titleText": "ПОСВІДЧЕННЯ ЖУРНАЛІСТА",
    "subtitleText": "PressPass Platform",
    "titleBgColor": "#1d4ed8",
    "titleColor": "#ffffff",
    "accentColor": "#1d4ed8",
    "backgroundColor": "#ffffff",
    "textColor": "#0f172a",
    "logoSrc": "/icons/logo.svg"
  },
  "fields": [
    { "key": "fullName", "label": "ПІБ", "visible": true },
    { "key": "position", "label": "Посада", "visible": true },
    { "key": "organization", "label": "Редакція", "visible": true },
    { "key": "cardNumber", "label": "Номер", "visible": true },
    { "key": "issueDate", "label": "Видано", "visible": true },
    { "key": "expireDate", "label": "Дійсне до", "visible": true }
  ],
  "qrCaption": "Скануйте QR-код для перевірки дійсності посвідчення"
}
```

Дозволені ключі полів: `fullName`, `position`, `organization`, `cardNumber`, `issueDate`, `expireDate`. Адмін може змінювати підписи (`label`), порядок і видимість (`visible`), але не додавати довільні поля.

#### Режими макета (`layoutMode`)

- `flow` (стандартний) — адаптивний макет із трьох зон (хедер / тіло / футер з QR). Довгі значення не переповнюють картку.
- `absolute` — вільне полотно drag-and-drop конструктора: кожен елемент має позицію `x`, `y` та розмір `width`, `height` (у пікселях полотна `cardWidth × cardHeight`). Хедер/футер не малюються — уся картка є полотном.

Додаткові поля шаблону:

```json
{
  "layoutMode": "absolute",
  "gridSize": 10,
  "elements": [
    {
      "id": "title",
      "type": "text",
      "binding": "title",
      "x": 0,
      "y": 0,
      "width": 360,
      "height": 52,
      "fontSize": 18,
      "bold": true,
      "color": "#ffffff",
      "bg": "#1d4ed8",
      "align": "center"
    },
    {
      "id": "photo",
      "type": "image",
      "binding": "photo",
      "x": 20,
      "y": 92,
      "width": 92,
      "height": 123
    },
    { "id": "qr", "type": "qr", "binding": "qr", "x": 130, "y": 424, "width": 100, "height": 100 }
  ]
}
```

- `type`: `text` | `image` | `qr` | `date`.
- `binding` для тексту: `title`, `subtitle`, `fullName`, `position`, `organization`, `mediaId`, `cardNumber`, `expireDate`, `qrCaption`, `custom` (літеральний `content`). Для зображення: `photo`, `logo`, `custom` (`src` — відносний шлях). `date` завжди показує дату дійсності.
- Стиль (опційно): `content`, `src`, `fontSize` (6–60), `bold`, `italic`, `uppercase`, `color`/`bg` (hex), `align` (`left`/`center`/`right`), `opacity` (0.2–1), `rotation` (0/90/180/270 — поворот кроком 90°). `gridSize` — крок сітки 2–50 px. Максимум 40 елементів.

Для зображення `binding` може бути `photo`, `logo` (логотип редакції), `nszhuLogo` (лише членам НСЖУ) або `custom`.

### PUT /admin/card-template?editorialId=… — оновлення дизайну (ADMIN, EDITORIAL_ADMIN)

Зберігає дизайн для редакції (`editorialId`) або системний стандарт (без параметра — лише ADMIN). Редакційний адмін може редагувати лише дизайн власної редакції. Вхідні дані завжди санітизуються: лише білий список ключів, кольори — тільки hex, тексти обмежені за довжиною, логотип/шлях зображення — лише відносний шлях (`/media/...`) або `null`, координати/розміри елементів обрізаються в межах полотна, невідомі типи/джерела відкидаються. Значення підставляються **як дані** (React екранує) — HTML/JS у шаблоні ніколи не виконується.

### POST /admin/card-template/reset?editorialId=… — скидання дизайну (ADMIN, EDITORIAL_ADMIN)

Для редакції видаляє її власний дизайн (успадковується системний стандарт); без параметра відновлює вбудований стандарт.

## Налаштування (role = ADMIN)

### GET /admin/settings

```json
{
  "resendConfigured": true,
  "resendKeyPreview": "re_…7766",
  "mailFrom": "PressPass <no-reply@domain.ua>",
  "nszhuLogoPath": "/media/{opaque-file-uuid}"
}
```

Ключ Resend ніколи не повертається повністю — лише замаскований прев'ю.

### PUT /admin/settings — `{ "resendApiKey"?: "re_...", "mailFrom"?: "..." }`

Порожній `resendApiKey` очищає збережений ключ (повернення до env). Значення з БД мають пріоритет над змінними середовища.

### POST /admin/settings/nszhu-logo — multipart, поле `logo` (PNG/WebP/JPEG, ≤2 МБ)

Завантажує логотип НСЖУ. `DELETE /admin/settings/nszhu-logo` — видаляє його. Обидва повертають оновлені `AppSettings`.

## Помилки

Стандартний формат NestJS:

```json
{ "statusCode": 400, "message": ["опис помилки"], "error": "Bad Request" }
```

`401` — немає/невалідний токен; `403` — недостатньо прав; `429` — перевищено ліміт запитів.
