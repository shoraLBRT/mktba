#!/usr/bin/env node
// Заливает демо-контент из scripts/demo-content.json в локальный API.
//
//   node scripts/seed-demo-content.mjs --email admin@mktba.local --password 'secret'
//   node scripts/seed-demo-content.mjs --token <jwt>
//
// Флаги: --api <url> (по умолчанию http://localhost:5172), --wait <секунд>.
// Требует Node 18+ (глобальный fetch).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? (i += 1, next) : 'true';
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const API = (args.api ?? 'http://localhost:5172').replace(/\/$/, '');
const WAIT_SECONDS = Number(args.wait ?? 60);

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let token = null;

const call = async (method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = payload?.title ?? payload?.message ?? text.slice(0, 300);
    throw new Error(`${method} ${path} → ${response.status}: ${detail}`);
  }

  return payload;
};

// Готовность API: /navigationTree/tree, а не /navigationTree — последнего не существует.
const waitForApi = async () => {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  process.stdout.write('Жду API');

  for (;;) {
    try {
      await call('GET', '/navigationTree/tree');
      process.stdout.write(` ${c.ok('готов')}\n`);
      return;
    } catch {
      if (Date.now() > deadline) {
        process.stdout.write(` ${c.err('нет ответа')}\n`);
        throw new Error(`API на ${API} не отвечает ${WAIT_SECONDS} с.`);
      }
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

// POST /articles/content закрыт политикой AdminOnly — без токена будет 401.
const authenticate = async () => {
  if (args.token) {
    token = args.token;
    return;
  }

  if (!args.email || !args.password) {
    throw new Error('Нужен --token либо пара --email и --password.');
  }

  const auth = await call('POST', '/auth/login', {
    email: args.email,
    password: args.password,
  });
  token = auth.accessToken;
  console.log(`Вошли как ${c.dim(auth.email)}`);
};

const loadSchoolMap = async () => {
  const systemSchools = await call('GET', '/schools/system');
  return new Map(systemSchools.map((school) => [school.slug, school.id]));
};

const toOpinions = (opinions, schoolMap) =>
  opinions.map((opinion) => ({
    content: opinion.content,
    isDefault: opinion.isDefault,
    schoolIds: (opinion.schoolSlugs ?? [])
      .map((slug) => schoolMap.get(slug))
      .filter((id) => id !== undefined),
  }));

const createArticle = async (article, schoolMap, titleToId) => {
  const created = await call('POST', '/articles/content', {
    title: article.title,
    parentArticleId: article.parentTitle ? titleToId.get(article.parentTitle) ?? null : null,
    summary: article.summary ?? null,
    tags: article.tags ?? [],
    infobox: article.infobox ?? null,
    relatedLinks: [],
    // order идёт непрерывно 1..N, и ровно одно мнение в слоте помечено isDefault —
    // оба условия проверяет ArticleContentService.ValidateOrder.
    paragraphs: article.paragraphs.map((paragraph) => ({
      articleId: 0,
      order: paragraph.order,
      opinions: toOpinions(paragraph.opinions, schoolMap),
    })),
  });

  titleToId.set(article.title, created.id);
  return created;
};

// Кастомная школа привязана к статье, поэтому создаётся только после неё,
// а связи с мнениями проставляются повторным PUT.
const attachCustomSchools = async (article, articleId, schoolMap) => {
  for (const school of article.customSchools) {
    const created = await call('POST', '/schools', { ...school, articleScopeId: articleId });
    schoolMap.set(created.slug, created.id);
  }

  const current = await call('GET', `/articles/${articleId}/content`);
  const bySlot = new Map(article.paragraphs.map((paragraph) => [paragraph.order, paragraph]));

  await call('PUT', `/articles/${articleId}/content`, {
    id: articleId,
    title: current.title,
    summary: current.summary,
    tags: current.tags ?? [],
    infobox: current.infobox,
    relatedLinks: [],
    paragraphs: current.paragraphs.map((paragraph) => {
      const source = bySlot.get(paragraph.order);
      return {
        id: paragraph.id,
        order: paragraph.order,
        opinions: paragraph.opinions.map((opinion, index) => ({
          id: opinion.id,
          content: opinion.content,
          isDefault: opinion.isDefault,
          schoolIds: (source?.opinions[index]?.schoolSlugs ?? [])
            .map((slug) => schoolMap.get(slug))
            .filter((id) => id !== undefined),
        })),
      };
    }),
  });
};

const main = async () => {
  const raw = await readFile(join(HERE, 'demo-content.json'), 'utf-8');
  const { articles, placeholders = [] } = JSON.parse(raw);

  await waitForApi();
  await authenticate();

  const schoolMap = await loadSchoolMap();
  const titleToId = new Map();
  let created = 0;
  let failed = 0;

  // Родитель должен существовать раньше ребёнка.
  const ordered = [
    ...articles.filter((article) => !article.parentTitle),
    ...articles.filter((article) => article.parentTitle),
  ];

  for (const article of ordered) {
    process.stdout.write(`${article.title}… `);
    try {
      const result = await createArticle(article, schoolMap, titleToId);

      if (article.customSchools?.length) {
        await attachCustomSchools(article, result.id, schoolMap);
      }

      const opinions = article.paragraphs.reduce((sum, p) => sum + p.opinions.length, 0);
      console.log(c.ok(`✓ id ${result.id}, ${article.paragraphs.length} слотов, ${opinions} мнений`));
      created += 1;
    } catch (error) {
      console.log(c.err(`✗ ${error.message}`));
      failed += 1;
    }
  }

  for (const placeholder of placeholders) {
    process.stdout.write(`${placeholder.title} (заглушка)… `);
    try {
      const result = await call('POST', '/articles', {
        title: placeholder.title,
        parentArticleId: placeholder.parentTitle ? titleToId.get(placeholder.parentTitle) ?? null : null,
      });
      console.log(c.ok(`✓ id ${result.id}`));
      created += 1;
    } catch (error) {
      console.log(c.err(`✗ ${error.message}`));
      failed += 1;
    }
  }

  console.log(`\nСоздано ${created}, ошибок ${failed}.`);
  if (failed > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(c.err(`\n${error.message}`));
  process.exitCode = 1;
});
