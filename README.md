# mktba

**mktba** (مكتبة — «библиотека») — open-source исламская wiki-платформа. Статьи организованы в иерархическое дерево, каждая содержит параграфы, а каждый параграф может иметь несколько мнений разных мазхабов (школ исламского права). По умолчанию поддерживаются четыре канонические суннитские школы — Hanafi, Maliki, Shafi'i, Hanbali — плюс произвольные пользовательские школы per-article.

Проект построен как hard fork [WikiWeaver](https://github.com/shoraLBRT/WikiWeaver) с переработанной доменной моделью, брендом и целевой аудиторией.

## Ключевые возможности

* **Иерархия статей** — дерево разделов и подразделов в боковой панели.
* **Мнения мазхабов** — inline-блок в статье показывает альтернативные мнения, помеченные одной или несколькими школами.
* **Floating mazhab widget** — глобальный выбор школы по умолчанию в правом нижнем углу; применяется ко всем статьям.
* **Markdown-редактор** для админов с поддержкой inline-сносок (GFM footnotes).
* **AI-помощник** (опционально) для стилизации markdown.
  Провайдера по умолчанию нет: пока в админке (`/admin?section=aiProvider`) не заданы адрес,
  модель и API-ключ, функции ИИ выключены, а API отвечает `ai_provider_not_configured`.
* **Админ-панель** — управление статьями, системными школами, AI-настройками, приглашениями с ролью (одноразовые, со сроком, отзываемые) и ролями пользователей.

## Стек

* **Backend**: ASP.NET Core 8 Minimal API, Clean DDD.
* **База данных**: PostgreSQL 16 + EF Core 8.
* **Frontend**: React 19 + TypeScript + React Router v7 (framework mode, SSR публичных страниц) + React Query v5 + Tailwind CSS v4 + Vite.
* **Auth**: короткий JWT Bearer в памяти + ротируемый refresh-токен в `httpOnly`-cookie, одноразовые приглашения с ролью (Reader/Author/Scholar/Admin) для регистрации.

## Структура репозитория

```
mktba/
├── Mktba.Domain/          # доменные сущности (Article, Paragraph, Opinion, School, User)
├── Mktba.Application/     # сервисы, DTO, AutoMapper-профили
├── Mktba.Infrastructure/  # EF Core DbContext, миграции, репозитории, сидеры
├── Mktba.Api/      # эндпоинты + app bootstrap
├── mktba.react/           # React-фронтенд
├── docker-compose.yml     # локальный PostgreSQL для разработки
└── docs/                  # планы, чеклисты, инженерные гайдлайны
```

## Локальный запуск

### Backend

```bash
docker compose up -d postgres    # поднять локальный PostgreSQL
dotnet restore Mktba.sln
dotnet build Mktba.sln           # без имени решения MSBuild падает (MSB1011: рядом docker-compose.dcproj)
dotnet run --project Mktba.Api   # :5172, при старте применяются миграции и 4 системные школы
```

Строка подключения из коробки: `dotnet run` стартует в Development, а
`appsettings.Development.json` смотрит в БД `mktba` сервиса `postgres` из `docker-compose.yml`
(пользователь `mktba`, пароль `mktba_dev` — dev-значения из того же файла). Первого админа
создаёт форма входа (`/admin/login` на `:5173`) или `POST /auth/register`, демо-контент — скрипт:

```bash
node scripts/seed-demo-content.mjs --email admin@mktba.local --password '<пароль>'
```

#### Локальные настройки

Свои значения для своей машины (другая БД, пароль, ключ AI) кладите в
`Mktba.Api/appsettings.local.json` — он в `.gitignore` и `.dockerignore`, образец —
`Mktba.Api/appsettings.local.example.json`:

```bash
cp Mktba.Api/appsettings.local.example.json Mktba.Api/appsettings.local.json
```

Порядок источников (последний побеждает): `appsettings.json` → `appsettings.{Environment}.json`
→ `appsettings.local.json` → user-secrets (Development) → переменные окружения
(`ConnectionStrings__DefaultConnection=...`) → аргументы командной строки.

#### Ключ подписи JWT

Ключ (`Auth:JwtSigningKey`) в `appsettings.json` не хранится. В Development (`dotnet run`
с профилем запуска) используется dev-ключ из `appsettings.Development.json`. В любом другом
окружении (Production, Staging, контейнер) API не стартует, если ключ не задан, короче
32 байт (256 бит, минимум для HS256) или совпадает с одним из закоммиченных в репозиторий
плейсхолдеров. Задать ключ:

```bash
# переменная окружения (прод, контейнер: docker run -e Auth__JwtSigningKey=...)
export Auth__JwtSigningKey="$(openssl rand -base64 48)"
# или, для локальной разработки, user-secrets
dotnet user-secrets --project Mktba.Api set "Auth:JwtSigningKey" "$(openssl rand -base64 48)"
```

Окружение `OpenApi` (генерация контракта, `npm run gen:api`) токенов не выпускает и ключ не проверяет.

#### Сессии (U-03)

Вход (`POST /auth/login`, `/auth/register`) возвращает короткий access-токен в теле и ставит
refresh-токен в cookie `mktba_refresh`. Фронтенд держит access-токен **только в памяти**
(не в `localStorage`); после перезагрузки страницы и на любой `401` он один раз вызывает
`POST /auth/refresh` и повторяет запрос. Каждый refresh ротирует токен; повторное предъявление
уже заменённого токена (признак кражи) завершает всю сессию этого устройства. В базе лежит
только SHA-256 токена (таблица `RefreshSessions`).

| Ключ `Auth` | Что | По умолчанию |
| --- | --- | --- |
| `AccessTokenLifetimeMinutes` | срок access-токена | 15 |
| `RefreshTokenLifetimeDays` | срок refresh-токена, скользящий (продлевается каждым refresh) | 30 |
| `RefreshCookiePath` | `Path` cookie: путь `/auth` API так, как его видит браузер | `/auth` |

- **Cookie:** `HttpOnly; SameSite=Strict; Path=/auth; Secure`. `Secure` снимается только в
  Development (локальный http); в любом другом окружении API нужно отдавать по https.
- **CSRF:** `POST /auth/refresh` и `/auth/logout` требуют заголовок `X-Requested-With` (иначе `403`).
  Вместе с `SameSite=Strict` этого достаточно: чужой сайт не отправит cookie, а заголовок со
  стороннего origin пройдёт только через CORS-preflight, который API для него не разрешает.
- **Выход:** `POST /auth/logout` — это устройство; `POST /auth/logout-all` — все устройства;
  `GET /auth/sessions` / `DELETE /auth/sessions/{id}` — список устройств и завершение одного
  (в админке — раздел «Сессии»). Access-токены несут id сессии, и API принимает их, только пока
  сессия жива, поэтому выход действует сразу, а не через 15 минут.
- **Развёртывание:** фронтенд и API должны быть *same-site* (например, `mktba.ru` и
  `api.mktba.ru`, или один хост с прокси `/api` → API — тогда `Auth__RefreshCookiePath=/api/auth`).
  CORS сейчас разрешает с credentials только loopback-origin'ы (локальная разработка: Vite `:5173`
  и API `:5172` — разные origin, но один site); для другого origin политику нужно расширить.
  Токены, выданные до U-03 (без id сессии), больше не принимаются — после обновления всем нужно
  войти заново.

#### Ограничение частоты запросов

Секция `RateLimiting` в `appsettings.json` (фиксированное окно; превышение — `429` с `Retry-After`):

| Лимит | Эндпоинты | Раздел | По умолчанию |
| --- | --- | --- | --- |
| `Auth` | `POST /auth/login`, `POST /auth/register` | IP клиента | 10 запросов / 60 с |
| `Session` | `POST /auth/refresh`, `POST /auth/logout` | IP клиента | 60 запросов / 60 с |
| `Ai` | `POST /admin/ai-style`, `POST /admin/ai-check` | id пользователя | 20 запросов / 3600 с |

Переопределение: `RateLimiting__Auth__PermitLimit=...`, `RateLimiting__Ai__WindowSeconds=...`.
IP берётся из адреса соединения: `X-Forwarded-For` не учитывается, пока не настроен
`ForwardedHeaders`. За обратным прокси все клиенты делят один лимит `Auth` — при развёртывании
за прокси middleware нужно включить.

### Frontend

```bash
cd mktba.react
npm install
npm run dev
```

Dev-сервер (`react-router dev`, Vite с серверным рендером) слушает `:5173`, API — `:5172`.

Публичные страницы (главная, статья, 404) рендерятся на сервере: HTML уже содержит дерево статей,
заголовок, все параграфы статьи и её метаданные; старый slug и ссылка `/article/{id}` отвечают
`301` на текущий адрес, неизвестная статья — `404`. Сервер читает API анонимно, поэтому видит только
опубликованное; сессия, выбранный мазхаб и прочие настройки из `localStorage` применяются в
браузере сразу после гидратации. Админка (`/admin/*`) рендерится только в браузере.

Продакшен-сборка и Node-сервер:

```bash
npm run build      # tsc + react-router build → build/client (статика), build/server (SSR)
npm start          # react-router-serve, порт из PORT (по умолчанию 3000)
```

| Переменная | Когда | Назначение |
| --- | --- | --- |
| `VITE_API_BASE_URL` | при сборке | адрес API для браузера (по умолчанию `http://localhost:5172`) |
| `API_INTERNAL_URL` | при запуске сервера | адрес API для серверного рендера (например, внутри сети деплоя); по умолчанию — `VITE_API_BASE_URL` |
| `PORT` | при запуске сервера | порт `react-router-serve` |

Тесты фронтенда — Vitest и Testing Library (jsdom), файлы `src/**/*.test.{ts,tsx}`:

```bash
cd mktba.react
npm test             # однократный прогон, как в CI
npm run test:watch   # режим наблюдения
```

### Контракт FE↔BE

Типы DTO во фронтенде генерируются из OpenAPI-документа бэкенда, руками их не пишут.
После изменения эндпоинтов или DTO перегенерируйте контракт и закоммитьте результат:

```bash
cd mktba.react
npm run gen:api    # нужен .NET 8 SDK; база данных не нужна
```

Скрипт собирает `Mktba.Api`, пишет `src/shared/api/openapi.json` (Swashbuckle CLI в окружении
`OpenApi`, без миграций и сидов) и генерирует из него `src/shared/api/schema.d.ts`
(`openapi-typescript`). `src/shared/types/ApiTypes.ts` содержит только псевдонимы этих типов.
CI-джоб `api-contract` падает, если закоммиченный контракт расходится с API, а `tsc` во
фронтенд-джобе — если фронтенд не учитывает изменение контракта.

### E2E-дым (Playwright)

Сценарии в `mktba.react/e2e`: открыть статью, сменить мазхаб, войти, создать и отредактировать
статью. Тесты гоняются против настоящего API и **отдельной одноразовой БД** — не направляйте их на
базу, данные которой нужны: тест создаёт админа и статьи.

```bash
docker compose up -d postgres
cd mktba.react
npx playwright install chromium          # один раз
export E2E_ADMIN_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
npm run test:e2e
docker exec mktba_postgres psql -U mktba -d postgres -c "DROP DATABASE mktba_e2e WITH (FORCE);"
```

Playwright сам поднимает API (`dotnet run`, `:5172`, БД `mktba_e2e`, миграции при старте,
случайный JWT-ключ на прогон) и SSR dev-сервер (`:5173`). Порт `:5172` должен быть свободен: уже запущенный
API не переиспользуется, чтобы тест не попал в базу с нужными данными; dev-сервер переиспользуется. Проект `setup` (`e2e/setup.mjs`) регистрирует первого админа
(`E2E_ADMIN_EMAIL`, по умолчанию `e2e@mktba.local`, пароль `E2E_ADMIN_PASSWORD`) или входит им,
если он уже есть, и заливает `scripts/demo-content.json`, если дерево статей пустое, поэтому
повторный прогон по той же БД работает с тем же паролем. Другая БД — `E2E_DB_CONNECTION`
(строка подключения Npgsql). В CI это джоб `e2e`; при падении HTML-отчёт лежит в артефакте
`playwright-report`.

## Лицензия

Open-source, MIT. См. [LICENSE](LICENSE).
