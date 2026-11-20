# mktba — бэклог

Составлен 2026-11-19 по результатам полного ревью проекта против продуктового ТЗ.
Заменяет бэклог аудита от 2026-09-01 (его незакрытые пункты перенесены сюда,
соответствие старых ID — в конце файла).

Как проводилось ревью: прочитан код всех слоёв, поднято окружение на чистой БД
`mktba_demo` (Postgres 16, API :5172, Vite :5173), залит демо-контент из
`scripts/demo-content.json`, интерфейс просмотрен на 1440 px, 800 px и 375 px:
главная, статья, заглушка, вход, админка, редактор.

**Задачи ведутся в [GitHub Issues](https://github.com/shoraLBRT/mktba/issues).** Этот файл — обзор ревью и порядок работ;
статус задач смотреть и менять в GitHub. Метки: `type:*`, `epic:*`, `size:S|M|L`
(S — до дня, M — 2–4 дня, L — неделя и больше), `decision` — нужно решение владельца.
Вехи соответствуют этапам из раздела 6.

---

## 1. Продукт по ТЗ

Тематическая Википедия по исламу. Отличительная фича — альтернативные параграфы:
у одного места в статье несколько текстов, привязанных к мазхабам или к кастомным
мнениям учёных. Для читателя — удобное чтение и навигация по дереву статей.
Для автора — богатый редактор и профиль с дашбордом. Для владельца — аналитика
в админке, сильное SEO в Google и Яндексе, готовность к локализации. Дальше —
верификация статей учёными и комментарии.

## 2. Соответствие ТЗ сейчас

| Требование ТЗ | Состояние | Чего не хватает |
|---|---|---|
| Альтернативные параграфы (мазхабы + кастомные школы) | Работает сквозь весь стек | Подача читателю слабая (раздел 3.1); кастомная школа — не «мнение учёного», у неё нет автора-учёного и источника |
| Боковая навигация по дереву | Базово работает | Нет сворачивания с памятью, перестановки, поиска по контенту; на мобильном беднее |
| Блок метаданных в начале статьи (инфобокс) | Реализован | Дефекты вёрстки: перекрывает блок мнений, рвёт слова |
| Богатый редактор статей | Блочный редактор на `textarea` с Markdown | Нет автосохранения, защиты от потери правок, перетаскивания блоков, изображений, сносок и источников, истории версий |
| Авторы | **Нет** | Единственная роль `Admin`; у статьи нет автора, статуса, дат |
| Профиль автора с графиками | **Нет** | Всё целиком |
| Аналитика и дашборды в админке | **Почти нет** | Есть только подключение Метрики; в админке три счётчика. Своего сбора событий нет |
| SEO под Google и Яндекс | **Нет** | Чистый SPA без серверного рендера, URL вида `/article/1`, один `<title>` на весь сайт, нет sitemap, robots, микроразметки |
| Локализация | Зачаток | Типизированные словари с fallback есть, но язык один, переключения нет, контент и ошибки API не локализуются |
| Верификация учёными | **Нет** | Всё целиком |
| Комментарии | **Нет** | Всё целиком |

Вывод: ядро («параграф → мнение → школа») сделано и проверено тестами, но вокруг него
пока прототип для одного администратора. Три вещи блокируют почти всё остальное
и должны идти первыми, потому что меняют схему данных и URL:

1. **Модель статьи** — slug, статус, даты, автор, ревизии. Без этого нет ни SEO,
   ни авторов, ни верификации (верифицируют конкретную ревизию).
2. **Роли и аккаунты** — читатель, автор, учёный, админ.
3. **Серверный рендер публичной части** — иначе SEO-задачи не дают результата.

## 3. Критика реализованного

### 3.1. Чтение статьи

- **Блок мнений не объясняет сам себя.** Заголовок «Мнения мазхабов: блок 2» — это
  внутренний номер слота, читателю он ничего не говорит. Переключатель «‹ Хан ›»
  листает стрелками: не видно, какие школы есть в этом блоке и сколько их, нельзя
  перейти сразу к нужной и нельзя сравнить две. Это главная фича продукта, а подана
  как вторичный элемент управления.
- **Непонятно, чьё мнение показано и почему.** Если у выбранного мазхаба нет своего
  текста, показывается мнение по умолчанию без пометки, что это подстановка.
- **Инфобокс перекрывает первый блок мнений** на 800 px и на 1440 px: блок уходит
  под плавающую карточку. В подписях рвутся слова («ОБЯЗАТЕЛЬНО / СТИ»).
- **Главная — пустая карточка** «выберите статью слева». Нет входа в контент:
  разделов, новых и популярных статей, поиска по центру.
- **Мобильная версия урезана, а не адаптирована.** В шапке нет бренда и поиска,
  пропадают оглавление, краткое описание и теги. Плавающая кнопка «Мазхаб»
  закрывает текст.
- **В шапке мёртвые вкладки** «Blog soon», «Q&A soon» — на английском и никуда не ведут.
- **Нет базовых вещей вики:** дата обновления, автор, время чтения, ссылка на абзац,
  «предыдущая / следующая», источники, печать.
- Тёмной темы нет, `prefers-reduced-motion` не учитывается. Шрифты тянутся с
  Google Fonts через `@import` в CSS — блокирует отрисовку и нестабильно из РФ.

### 3.2. Редактор

Визуально это лучшая часть проекта: спокойная типографика, рельсы структуры и
сводки, нижняя панель форматирования. Проблемы — в надёжности и глубине:

- Нет автосохранения и предупреждения при уходе со страницы — длинный текст
  теряется одним случайным кликом по дереву слева.
- Варианты мнения переключаются вкладками «1 2 3 4 +», а школы назначаются
  отдельными чипами ниже. Связь «вкладка ↔ школа» приходится держать в голове.
- Блоки нельзя перетаскивать; нет изображений, таблиц через UI, сносок, блоков
  цитаты из Корана и хадиса со ссылкой на источник — для этой тематики они основные.
- `AddArticlePage` (629 строк) и `EditArticlePage` (770 строк) дублируют друг друга — объединены в `ArticleEditorPage` (E-01, #74).
- `SimpleMarkdownEditor.tsx` нигде не используется, а его кнопки вставляют текст
  в конец, игнорируя выделение.
- Публичное дерево навигации остаётся слева от редактора и отнимает ширину.

### 3.3. Админка

- Это одна страница на 666 строк с четырьмя вкладками, без своего layout.
- Нет списка статей — попасть в редактор можно только через публичное дерево.
- Половина текстов на английском: «Top Articles by Paragraph Count», «Published»,
  «Danger zone» — мимо слоя локализации.
- «Published» — выдумка интерфейса: статуса публикации в модели нет.
- Нет управления пользователями, школами, деревом.

### 3.4. Архитектура и безопасность

- `GET /navigationTree/tree` загружает **все параграфы всех статей**, чтобы
  вычислить флаг `hasContent`. `GET /paragraph` отдаёт весь контент без авторизации
  и пагинации, и админка дёргает его ради счётчика.
- ~~JWT живёт 12 часов в `localStorage`, refresh-токена нет. Ограничения частоты
  запросов на `/auth/*` нет.~~ Исправлено в S-10 (#12, лимиты) и U-03 (#31): access-токен
  на 15 минут только в памяти, ротируемый refresh-токен в `httpOnly`-cookie, отзыв сессий.
- ~~В `appsettings.json` закоммичен рабочий ключ подписи JWT; приложение стартует
  с ним в любом окружении.~~ Исправлено в S-09 (#11):
  ключ убран из `appsettings.json`, вне Development старт с пустым, коротким (< 32 байт)
  или закоммиченным ключом запрещён.
- CORS разрешает только loopback — схема продакшена не описана. Фронтенд не
  контейнеризован, `docker-compose.yml` поднимает только Postgres.
- CI нет вообще: в репозитории отсутствует `.github/`. Тестов фронтенда нет.
- Метрика инициализируется, но при переходах внутри SPA хиты не отправляются —
  в статистике будет только первая страница визита.

### 3.5. Что сделано хорошо — не переделывать

- Доменная модель «параграф → мнение → школа» и строгая валидация контента
  (непрерывность `order`, ровно одно мнение по умолчанию, транзакции).
- Слой локализации фронтенда: типизированные неймспейсы, проверка владения ключами,
  слияние с fallback. Его нужно достроить, а не заменять.
- Дизайн-токены в `theme.css`, общий визуальный язык редактора.
- Бутстрап первого админа, invite-токены, «опасная зона» с фразой-подтверждением.
- Баннер согласия на аналитику, `rehype-sanitize` в рендере Markdown.

---

## 4. Принятые решения

Развилки, от которых зависел объём работ. Все решены владельцем 2026-11-19.

| № | Решение |
|---|---|
| D1 [#36](https://github.com/shoraLBRT/mktba/issues/36) | SSR на React Router v7 в framework-режиме: публичная часть рендерится на сервере, админка остаётся клиентской. |
| D2 [#69](https://github.com/shoraLBRT/mktba/issues/69) | TipTap внутри блоков: блочная модель и блок мнений остаются, `textarea` заменяется на TipTap, хранится Markdown. |
| D3 [#19](https://github.com/shoraLBRT/mktba/issues/19) | Авторы — только по приглашению админа. Открытая регистрация появится вместе с комментариями. |
| D4 [#20](https://github.com/shoraLBRT/mktba/issues/20) | Публикация после одобрения админом — и новой статьи, и правки опубликованной. Опубликованная версия остаётся на сайте, пока новая не одобрена. |
| D5 [#115](https://github.com/shoraLBRT/mktba/issues/115) | Отметка учёного привязана к ревизии. После существенной правки она остаётся в истории, в виджете помечается «для предыдущей версии», учёному уходит запрос на повторное ревью. |
| D6 [#21](https://github.com/shoraLBRT/mktba/issues/21) | Перевод — отдельная статья на язык со своим slug и статусом, связана с оригиналом общей группой. Адреса: `/` для русского, `/en/` для английского. |
| D7 [#88](https://github.com/shoraLBRT/mktba/issues/88) | Метрика и собственные события: Метрика — для трафика и поисковых фраз, своя таблица событий — для дашбордов автора и админки. |
| D8 [#2](https://github.com/shoraLBRT/mktba/issues/2) | Дефолтного ИИ-провайдера нет: требуется явная настройка в админке. |
| D9 [#37](https://github.com/shoraLBRT/mktba/issues/37) | Обратная связь сразу создаёт issue в основном публичном репозитории. Контакт и технические данные посетителя в issue не попадают и хранятся только в БД. |

---

## 5. Задачи по эпикам

### Эпик 0 — Стабилизация и страховка

- [#3](https://github.com/shoraLBRT/mktba/issues/3) — S-01. Долить ветку `worktree-agent-ad2f9712e3b895d60`
- [#4](https://github.com/shoraLBRT/mktba/issues/4) — S-02. Долить ветку `worktree-agent-a577c323a3a77e07e`
- [#5](https://github.com/shoraLBRT/mktba/issues/5) — S-03. CI по стандарту habze
- [#6](https://github.com/shoraLBRT/mktba/issues/6) — S-04. Контрактный тест FE↔BE
- [#7](https://github.com/shoraLBRT/mktba/issues/7) — S-05. Тест-раннер фронтенда
- [#8](https://github.com/shoraLBRT/mktba/issues/8) — S-06. E2E-дым
- [#9](https://github.com/shoraLBRT/mktba/issues/9) — S-07. Закрыть `GET /paragraph` и `GET /paragraph/{id}`
- [#10](https://github.com/shoraLBRT/mktba/issues/10) — S-08. Дерево навигации без загрузки параграфов
- [#11](https://github.com/shoraLBRT/mktba/issues/11) — S-09. Ключ JWT
- [#12](https://github.com/shoraLBRT/mktba/issues/12) — S-10. Ограничение частоты запросов
- [#13](https://github.com/shoraLBRT/mktba/issues/13) — S-11. Настройки React Query
- [#14](https://github.com/shoraLBRT/mktba/issues/14) — S-12. `ErrorBoundary` и маршрут 404
- [#15](https://github.com/shoraLBRT/mktba/issues/15) — S-13. Ошибки API — кодами, а не английским текстом
- [#16](https://github.com/shoraLBRT/mktba/issues/16) — S-14. Определить поведение школ у обычного абзаца
- [#17](https://github.com/shoraLBRT/mktba/issues/17) — S-15. Гигиена
- [#18](https://github.com/shoraLBRT/mktba/issues/18) — S-16. Локальный запуск по README работает
- [#165](https://github.com/shoraLBRT/mktba/issues/165) — S-17. Убрать дефолтного ИИ-провайдера

### Эпик 1 — Модель статьи

- [#22](https://github.com/shoraLBRT/mktba/issues/22) — M-01. Slug статьи
- [#23](https://github.com/shoraLBRT/mktba/issues/23) — M-02. Статус
- [#24](https://github.com/shoraLBRT/mktba/issues/24) — M-03. Даты и авторство
- [#25](https://github.com/shoraLBRT/mktba/issues/25) — M-04. Ревизии
- [#26](https://github.com/shoraLBRT/mktba/issues/26) — M-05. Порядок статей в дереве
- [#70](https://github.com/shoraLBRT/mktba/issues/70) — M-06. Теги как сущность
- [#71](https://github.com/shoraLBRT/mktba/issues/71) — M-07. Источники
- [#116](https://github.com/shoraLBRT/mktba/issues/116) — M-08. Мнение учёного как полноценная альтернатива
- [#27](https://github.com/shoraLBRT/mktba/issues/27) — M-09. Поля локализации
- [#28](https://github.com/shoraLBRT/mktba/issues/28) — M-10. SEO-поля статьи
- [#133](https://github.com/shoraLBRT/mktba/issues/133) — M-11. Мягкое удаление статьи

### Эпик 2 — Аккаунты и роли

- [#29](https://github.com/shoraLBRT/mktba/issues/29) — U-01. Роли `Reader`, `Author`, `Scholar`, `Admin`
- [#30](https://github.com/shoraLBRT/mktba/issues/30) — U-02. Права на объект
- [#31](https://github.com/shoraLBRT/mktba/issues/31) — U-03. Сессия
- [#32](https://github.com/shoraLBRT/mktba/issues/32) — U-04. Приглашение автора с ролью
- [#126](https://github.com/shoraLBRT/mktba/issues/126) — U-05. Регистрация и вход читателя
- [#134](https://github.com/shoraLBRT/mktba/issues/134) — U-06. Требования к паролю
- [#72](https://github.com/shoraLBRT/mktba/issues/72) — U-07. Профиль пользователя
- [#73](https://github.com/shoraLBRT/mktba/issues/73) — U-08. Загрузка файлов
- [#135](https://github.com/shoraLBRT/mktba/issues/135) — U-09. Журнал действий
- [#136](https://github.com/shoraLBRT/mktba/issues/136) — U-10. Управление пользователями в админке

### Эпик 3 — Чтение: UI и UX

- [#38](https://github.com/shoraLBRT/mktba/issues/38) — R-01. Перепроектировать блок мнений
- [#137](https://github.com/shoraLBRT/mktba/issues/137) — R-02. Режим сравнения
- [#39](https://github.com/shoraLBRT/mktba/issues/39) — R-03. Выбор мазхаба
- [#40](https://github.com/shoraLBRT/mktba/issues/40) — R-04. Инфобокс
- [#41](https://github.com/shoraLBRT/mktba/issues/41) — R-05. Главная страница
- [#42](https://github.com/shoraLBRT/mktba/issues/42) — R-06. Шапка статьи
- [#43](https://github.com/shoraLBRT/mktba/issues/43) — R-07. Оглавление
- [#44](https://github.com/shoraLBRT/mktba/issues/44) — R-08. Низ статьи
- [#45](https://github.com/shoraLBRT/mktba/issues/45) — R-09. Дерево навигации
- [#46](https://github.com/shoraLBRT/mktba/issues/46) — R-10. Поиск
- [#47](https://github.com/shoraLBRT/mktba/issues/47) — R-11. Мобильная версия
- [#138](https://github.com/shoraLBRT/mktba/issues/138) — R-12. Страницы тега и раздела
- [#48](https://github.com/shoraLBRT/mktba/issues/48) — R-13. Убрать из шапки вкладки «Blog soon» и «Q&A soon»
- [#49](https://github.com/shoraLBRT/mktba/issues/49) — R-14. Пустые состояния и загрузка
- [#139](https://github.com/shoraLBRT/mktba/issues/139) — R-15. Типографика арабского
- [#140](https://github.com/shoraLBRT/mktba/issues/140) — R-16. Тёмная тема
- [#141](https://github.com/shoraLBRT/mktba/issues/141) — R-17. Доступность (WCAG 2.1 AA)
- [#50](https://github.com/shoraLBRT/mktba/issues/50) — R-18. Шрифты локально
- [#142](https://github.com/shoraLBRT/mktba/issues/142) — R-19. Версия для печати

### Эпик 4 — Редактор

- [#74](https://github.com/shoraLBRT/mktba/issues/74) — E-01. Единый `ArticleEditorPage`
- [#75](https://github.com/shoraLBRT/mktba/issues/75) — E-02. Автосохранение черновика
- [#76](https://github.com/shoraLBRT/mktba/issues/76) — E-03. Защита от потери правок
- [#77](https://github.com/shoraLBRT/mktba/issues/77) — E-04. Rich-text внутри блока
- [#78](https://github.com/shoraLBRT/mktba/issues/78) — E-05. Перетаскивание блоков
- [#79](https://github.com/shoraLBRT/mktba/issues/79) — E-06. Вкладки вариантов по названию школы
- [#143](https://github.com/shoraLBRT/mktba/issues/143) — E-07. Изображения и подписи к ним
- [#144](https://github.com/shoraLBRT/mktba/issues/144) — E-08. Блоки аята и хадиса
- [#145](https://github.com/shoraLBRT/mktba/issues/145) — E-09. Сноски и источники
- [#80](https://github.com/shoraLBRT/mktba/issues/80) — E-10. Внутренние ссылки
- [#81](https://github.com/shoraLBRT/mktba/issues/81) — E-11. Предпросмотр как у читателя
- [#82](https://github.com/shoraLBRT/mktba/issues/82) — E-12. Публикация
- [#83](https://github.com/shoraLBRT/mktba/issues/83) — E-13. История версий в редакторе
- [#84](https://github.com/shoraLBRT/mktba/issues/84) — E-14. Проверка перед публикацией
- [#85](https://github.com/shoraLBRT/mktba/issues/85) — E-15. Редактор на всю ширину
- [#146](https://github.com/shoraLBRT/mktba/issues/146) — E-16. Блокировка одновременной правки
- [#147](https://github.com/shoraLBRT/mktba/issues/147) — E-17. ИИ-помощник

### Эпик 5 — Профиль автора

- [#89](https://github.com/shoraLBRT/mktba/issues/89) — P-01. Публичная страница автора
- [#90](https://github.com/shoraLBRT/mktba/issues/90) — P-02. Кабинет автора
- [#91](https://github.com/shoraLBRT/mktba/issues/91) — P-03. Дашборд автора
- [#92](https://github.com/shoraLBRT/mktba/issues/92) — P-04. График активности
- [#93](https://github.com/shoraLBRT/mktba/issues/93) — P-05. Редактирование профиля
- [#94](https://github.com/shoraLBRT/mktba/issues/94) — P-06. Автор на странице статьи

### Эпик 6 — Админка

- [#33](https://github.com/shoraLBRT/mktba/issues/33) — A-01. Свой layout админки
- [#34](https://github.com/shoraLBRT/mktba/issues/34) — A-02. Список статей
- [#86](https://github.com/shoraLBRT/mktba/issues/86) — A-03. Управление деревом
- [#87](https://github.com/shoraLBRT/mktba/issues/87) — A-04. Очередь модерации
- [#148](https://github.com/shoraLBRT/mktba/issues/148) — A-05. Справочники
- [#35](https://github.com/shoraLBRT/mktba/issues/35) — A-06. Вся админка на русском через словари
- [#95](https://github.com/shoraLBRT/mktba/issues/95) — A-07. Сводка на эндпоинте статистики
- [#149](https://github.com/shoraLBRT/mktba/issues/149) — A-08. Настройки сайта
- [#150](https://github.com/shoraLBRT/mktba/issues/150) — A-09. Импорт и экспорт контента
- [#151](https://github.com/shoraLBRT/mktba/issues/151) — A-10. Исправить подсветку активной вкладки

### Эпик 7 — Аналитика

- [#51](https://github.com/shoraLBRT/mktba/issues/51) — N-01. Хиты Метрики при переходах в SPA
- [#96](https://github.com/shoraLBRT/mktba/issues/96) — N-02. Собственный сбор событий
- [#97](https://github.com/shoraLBRT/mktba/issues/97) — N-03. Фильтрация ботов и дедупликация
- [#98](https://github.com/shoraLBRT/mktba/issues/98) — N-04. Агрегаты
- [#99](https://github.com/shoraLBRT/mktba/issues/99) — N-05. Дашборд админки
- [#100](https://github.com/shoraLBRT/mktba/issues/100) — N-06. Аналитика поиска
- [#101](https://github.com/shoraLBRT/mktba/issues/101) — N-07. Аналитика контента
- [#102](https://github.com/shoraLBRT/mktba/issues/102) — N-08. Инструменты работы с данными
- [#103](https://github.com/shoraLBRT/mktba/issues/103) — N-09. Аналитика статьи
- [#152](https://github.com/shoraLBRT/mktba/issues/152) — N-10. Поисковая видимость
- [#153](https://github.com/shoraLBRT/mktba/issues/153) — N-11. Web Vitals
- [#154](https://github.com/shoraLBRT/mktba/issues/154) — N-12. Страница политики конфиденциальности

### Эпик 8 — SEO

- [#52](https://github.com/shoraLBRT/mktba/issues/52) — O-01. Серверный рендер публичных страниц
- [#53](https://github.com/shoraLBRT/mktba/issues/53) — O-02. Человекочитаемые URL
- [#54](https://github.com/shoraLBRT/mktba/issues/54) — O-03. Все мнения блока — в HTML страницы
- [#55](https://github.com/shoraLBRT/mktba/issues/55) — O-04. Метаданные на каждой странице
- [#56](https://github.com/shoraLBRT/mktba/issues/56) — O-05. Микроразметка JSON-LD
- [#57](https://github.com/shoraLBRT/mktba/issues/57) — O-06. `sitemap.xml`
- [#58](https://github.com/shoraLBRT/mktba/issues/58) — O-07. Правильные коды ответа
- [#104](https://github.com/shoraLBRT/mktba/issues/104) — O-08. `hreflang`
- [#59](https://github.com/shoraLBRT/mktba/issues/59) — O-09. Core Web Vitals
- [#60](https://github.com/shoraLBRT/mktba/issues/60) — O-10. Семантика страницы
- [#155](https://github.com/shoraLBRT/mktba/issues/155) — O-11. Внутренняя перелинковка
- [#61](https://github.com/shoraLBRT/mktba/issues/61) — O-12. Подключить Яндекс Вебмастер и Google Search Console
- [#62](https://github.com/shoraLBRT/mktba/issues/62) — O-13. Фавикон, иконки, манифест
- [#156](https://github.com/shoraLBRT/mktba/issues/156) — O-14. RSS / Atom
- [#157](https://github.com/shoraLBRT/mktba/issues/157) — O-15. HTTP-кеширование

### Эпик 9 — Локализация

- [#105](https://github.com/shoraLBRT/mktba/issues/105) — I-01. Язык в URL и контексте
- [#106](https://github.com/shoraLBRT/mktba/issues/106) — I-02. Ленивая загрузка словарей
- [#107](https://github.com/shoraLBRT/mktba/issues/107) — I-03. Убрать хардкод строк
- [#108](https://github.com/shoraLBRT/mktba/issues/108) — I-04. Плюрализация и форматирование
- [#109](https://github.com/shoraLBRT/mktba/issues/109) — I-05. Словарь `en`
- [#110](https://github.com/shoraLBRT/mktba/issues/110) — I-06. Перевод статьи
- [#111](https://github.com/shoraLBRT/mktba/issues/111) — I-07. Локализуемые справочники
- [#112](https://github.com/shoraLBRT/mktba/issues/112) — I-08. Поведение при отсутствии перевода
- [#113](https://github.com/shoraLBRT/mktba/issues/113) — I-09. Готовность к RTL
- [#114](https://github.com/shoraLBRT/mktba/issues/114) — I-10. Локализация серверной части

### Эпик 10 — Верификация учёными

- [#117](https://github.com/shoraLBRT/mktba/issues/117) — V-01. Заявка на статус учёного
- [#118](https://github.com/shoraLBRT/mktba/issues/118) — V-02. Проверка заявки админом
- [#119](https://github.com/shoraLBRT/mktba/issues/119) — V-03. Ревью статьи
- [#120](https://github.com/shoraLBRT/mktba/issues/120) — V-04. Виджет на странице статьи
- [#121](https://github.com/shoraLBRT/mktba/issues/121) — V-05. Устаревание отметки
- [#122](https://github.com/shoraLBRT/mktba/issues/122) — V-06. Замечания к абзацу
- [#123](https://github.com/shoraLBRT/mktba/issues/123) — V-07. Кабинет учёного
- [#124](https://github.com/shoraLBRT/mktba/issues/124) — V-08. Отметка в поиске и списках
- [#125](https://github.com/shoraLBRT/mktba/issues/125) — V-09. Уведомления

### Эпик 11 — Комментарии

- [#127](https://github.com/shoraLBRT/mktba/issues/127) — C-01. Комментарии к статье
- [#128](https://github.com/shoraLBRT/mktba/issues/128) — C-02. Модерация
- [#129](https://github.com/shoraLBRT/mktba/issues/129) — C-03. Комментарий к конкретному абзацу
- [#130](https://github.com/shoraLBRT/mktba/issues/130) — C-04. Отметки автора и учёного
- [#131](https://github.com/shoraLBRT/mktba/issues/131) — C-05. Уведомления об ответах
- [#132](https://github.com/shoraLBRT/mktba/issues/132) — C-06. Комментарии не мешают SEO

### Эпик 12 — Инфраструктура

- [#63](https://github.com/shoraLBRT/mktba/issues/63) — X-01. Продакшен-схема
- [#64](https://github.com/shoraLBRT/mktba/issues/64) — X-02. Деплой из CI
- [#65](https://github.com/shoraLBRT/mktba/issues/65) — X-03. Демо-сидер только в Development
- [#158](https://github.com/shoraLBRT/mktba/issues/158) — X-04. Резервные копии БД
- [#159](https://github.com/shoraLBRT/mktba/issues/159) — X-05. Наблюдаемость
- [#160](https://github.com/shoraLBRT/mktba/issues/160) — X-06. Заголовки безопасности
- [#161](https://github.com/shoraLBRT/mktba/issues/161) — X-07. Интеграционные тесты API
- [#162](https://github.com/shoraLBRT/mktba/issues/162) — X-08. Фоновые задачи

### Эпик 13 — Анонимная обратная связь

- [#66](https://github.com/shoraLBRT/mktba/issues/66) — F-01. Форма обратной связи без регистрации
- [#67](https://github.com/shoraLBRT/mktba/issues/67) — F-02. Приём обращения и создание issue в GitHub
- [#68](https://github.com/shoraLBRT/mktba/issues/68) — F-03. Защита и приватность обратной связи
- [#163](https://github.com/shoraLBRT/mktba/issues/163) — F-04. Обращения в админке
- [#164](https://github.com/shoraLBRT/mktba/issues/164) — F-05. Замечание к конкретному абзацу

---

## 6. Порядок работ

| Этап | Цель | Задач | Веха |
|---|---|---|---|
| 0 | Стабильная база, CI, ничего не теряется | 17 | [Этап 0 — Стабилизация](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+0+—+Стабилизация%22) |
| 1 | Схема данных и роли, которые не придётся ломать | 17 | [Этап 1 — Модель статьи и роли](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+1+—+Модель+статьи+и+роли%22) |
| 2 | Сайт, который можно показать читателю и поисковику | 33 | [Этап 2 — Читатель и SEO](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+2+—+Читатель+и+SEO%22) |
| 3 | Авторам удобно писать | 19 | [Этап 3 — Редактор](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+3+—+Редактор%22) |
| 4 | Профиль автора и аналитика | 16 | [Этап 4 — Профиль автора и аналитика](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+4+—+Профиль+автора+и+аналитика%22) |
| 5 | Английская версия | 11 | [Этап 5 — Английская версия](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+5+—+Английская+версия%22) |
| 6 | Верификация учёными | 11 | [Этап 6 — Верификация учёными](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+6+—+Верификация+учёными%22) |
| 7 | Сообщество | 7 | [Этап 7 — Сообщество](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Этап+7+—+Сообщество%22) |
| Фоном | Качество и рост | 32 | [Фоном — качество и рост](https://github.com/shoraLBRT/mktba/issues?q=is%3Aissue+milestone%3A%22Фоном+—+качество+и+рост%22) |

Почему так. Этап 1 идёт до интерфейса, потому что slug, статус и автор меняют и URL,
и API — делать SEO и редактор поверх `/article/1` значит переделывать их дважды.
Этап 2 раньше редактора, потому что индексация занимает недели: чем раньше сайт
отдаёт поисковику готовый HTML, тем раньше появится трафик. M-09 (поля локализации)
стоит в этапе 1, хотя перевод — этап 5: добавить колонку сейчас дёшево, а менять
уникальность slug на живых данных потом дорого.

---

## 7. Перенос из бэклога от 2026-09-01

| Старый ID | Куда |
|---|---|
| A1 | S-01 (готово в незалитой ветке) |
| A2 | A-02 |
| A5 | A-03, M-05 |
| A6 | R-09 |
| A7 | R-10 |
| A8, A9 | S-12 |
| L1 | A-06, I-03 |
| L3 | S-13 |
| L4 | M-02 |
| N1 | S-14 |
| U1, U3 | R-04 |
| U2 | A-10 |
| U4 | R-11 |
| U5 | A-01, E-15 |
| U6, U7 | R-14 |
| U8 | R-06 |
| U9, U10 | U-06 |
| T1 | S-15, O-13 |
| T2 | E-01 |
| T3 | A-07 |
| T4 | S-07 |
| T5 | S-11 |
| T6 | S-04, S-05 |
| T9, T10 | S-16 |
| T11, T13 | S-15 |
| T12 | D8 |
| T14 | O-09 |

---

## 8. Как воспроизвести окружение ревью

```bash
docker compose up -d postgres
```

Ключ JWT в Development берётся из `appsettings.Development.json`; вне Development его
нужно задать (`Auth__JwtSigningKey`, ≥ 32 байт, не плейсхолдер из репозитория) — см. README,
раздел «Ключ подписи JWT».

API против отдельной демо-БД (основная `mktba` не трогается):

```bash
dotnet run --project Mktba.Api --no-launch-profile -- --urls http://localhost:5172 --environment Development --ConnectionStrings:DefaultConnection "Host=localhost;Port=5432;Database=mktba_demo;Username=mktba;Password=mktba_dev"
```

Фронтенд:

```bash
npm --prefix mktba.react run dev
```

Демо-контент (нужен админ; первого создаёт форма входа или `POST /auth/register`):

```bash
node scripts/seed-demo-content.mjs --email admin@mktba.local --password '<пароль>'
```
