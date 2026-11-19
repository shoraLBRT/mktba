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

## Лицензия

Open-source, MIT. См. [LICENSE](LICENSE).
