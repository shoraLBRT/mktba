# mktba

**mktba** (مكتبة — «библиотека») — open-source исламская wiki-платформа. Статьи организованы в иерархическое дерево, каждая содержит параграфы, а каждый параграф может иметь несколько мнений разных мазхабов (школ исламского права). По умолчанию поддерживаются четыре канонические суннитские школы — Hanafi, Maliki, Shafi'i, Hanbali — плюс произвольные пользовательские школы per-article.

Проект построен как hard fork [WikiWeaver](https://github.com/shoraLBRT/WikiWeaver) с переработанной доменной моделью, брендом и целевой аудиторией.

## Ключевые возможности

* **Иерархия статей** — дерево разделов и подразделов в боковой панели.
* **Мнения мазхабов** — inline-блок в статье показывает альтернативные мнения, помеченные одной или несколькими школами.
* **Floating mazhab widget** — глобальный выбор школы по умолчанию в правом нижнем углу; применяется ко всем статьям.
* **Markdown-редактор** для админов с поддержкой inline-сносок (GFM footnotes).
* **AI-помощник** (опционально) для стилизации markdown.
* **Админ-панель** — управление статьями, системными школами, AI-настройками, invite-токенами.

## Стек

* **Backend**: ASP.NET Core 8 Minimal API, Clean DDD.
* **База данных**: PostgreSQL 16 + EF Core 8.
* **Frontend**: React 19 + TypeScript + React Router v7 + React Query v5 + Tailwind CSS v4 + Vite.
* **Auth**: JWT Bearer + invite-токены для регистрации админов.

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
dotnet restore
dotnet build
dotnet run --project Mktba.Api
```

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

#### Ограничение частоты запросов

Секция `RateLimiting` в `appsettings.json` (фиксированное окно; превышение — `429` с `Retry-After`):

| Лимит | Эндпоинты | Раздел | По умолчанию |
| --- | --- | --- | --- |
| `Auth` | `POST /auth/login`, `POST /auth/register` | IP клиента | 10 запросов / 60 с |
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

Dev-сервер Vite слушает `:5173`, API — `:5172`.

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
случайный JWT-ключ на прогон) и Vite (`:5173`). Порт `:5172` должен быть свободен: уже запущенный
API не переиспользуется, чтобы тест не попал в базу с нужными данными; Vite переиспользуется. Проект `setup` (`e2e/setup.mjs`) регистрирует первого админа
(`E2E_ADMIN_EMAIL`, по умолчанию `e2e@mktba.local`, пароль `E2E_ADMIN_PASSWORD`) или входит им,
если он уже есть, и заливает `scripts/demo-content.json`, если дерево статей пустое, поэтому
повторный прогон по той же БД работает с тем же паролем. Другая БД — `E2E_DB_CONNECTION`
(строка подключения Npgsql). В CI это джоб `e2e`; при падении HTML-отчёт лежит в артефакте
`playwright-report`.

## Лицензия

Open-source, MIT. См. [LICENSE](LICENSE).
