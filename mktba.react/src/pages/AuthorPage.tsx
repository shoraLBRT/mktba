import { useId, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { ArticleListEntry } from '../components/ArticleListEntry';
import { PageLinks } from '../components/PageLinks';
import { NotFoundMeta, PageMeta } from '../components/PageMeta';
import { AuthorStructuredData } from '../components/StructuredData';
import { useLocale } from '../localization/hooks';
import { getAuthor, getAuthorArticles } from '../services/authorService';
import { ApiError } from '../shared/api-client/apiError';
import {
  authorArticlesQueryKey,
  authorHref,
  authorInitial,
  authorMetaDescription,
  authorPageCount,
  authorPageHref,
  authorQueryKey,
  readAuthorPage,
} from '../shared/author';
import type { AuthorArticlesDto, PublicProfileDto } from '../shared/types/ApiTypes';
import NotFoundPage from './NotFoundPage';

/** Side of the avatar square in CSS pixels; the box is reserved whether or not the image loads. */
const AVATAR_SIZE = 96;

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';
const sectionTitleClass = 'm-0 text-lg font-semibold text-[var(--color-ink-strong)]';
const noteClass = 'm-0 text-base leading-7 text-[var(--color-ink-muted)]';
const panelClass = 'rounded-2xl border border-[var(--color-border-soft)] bg-white p-5';

/**
 * The author's picture in a fixed round box. The address is whatever the author typed (no upload
 * yet, #73), so it is loaded lazily and without a referrer; while it is missing, still loading or
 * broken the box shows the first letter of the name instead.
 */
const Avatar = ({ profile }: { profile: PublicProfileDto }) => {
  const t = useLocale().authorPage;
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(profile.avatarUrl) && !failed;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-border-soft)] text-4xl font-semibold text-[var(--color-brand-forest)]"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      data-testid="author-avatar"
    >
      <span aria-hidden="true">{authorInitial(profile.displayName)}</span>
      {showImage && (
        <img
          // An image that failed before hydration never fires `onError` for React: check it once mounted.
          ref={(image) => {
            if (image?.complete && image.naturalWidth === 0) setFailed(true);
          }}
          src={profile.avatarUrl ?? undefined}
          alt={t.avatarAlt.replace('{name}', profile.displayName)}
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
};

/**
 * What a scholar says about their education. Nothing here is confirmed by the site yet
 * (verification: V-01 #117, V-02 #118), and the block says so.
 */
const SelfDeclared = ({ profile }: { profile: PublicProfileDto }) => {
  const t = useLocale().authorPage;
  const titleId = useId();

  if (!profile.degree && !profile.institution) {
    return null;
  }

  return (
    <section aria-labelledby={titleId} className={`${panelClass} flow-root`}>
      <h2 id={titleId} className={sectionTitleClass}>
        {t.selfDeclaredTitle}
      </h2>
      <dl className="m-0 mt-3 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
        {profile.degree && (
          <>
            <dt className="text-[var(--color-ink-muted)]">{t.degree}</dt>
            <dd className="m-0 [overflow-wrap:anywhere] text-[var(--color-ink-default)]">{profile.degree}</dd>
          </>
        )}
        {profile.institution && (
          <>
            <dt className="text-[var(--color-ink-muted)]">{t.institution}</dt>
            <dd className="m-0 [overflow-wrap:anywhere] text-[var(--color-ink-default)]">{profile.institution}</dd>
          </>
        )}
      </dl>
      <p className="mb-0 mt-3 text-sm text-[var(--color-ink-subtle)]">{t.selfDeclaredNote}</p>
    </section>
  );
};

type ArticleListProps = {
  slug: string;
  /** Undefined while the list is loading for the first time. */
  articles: AuthorArticlesDto | undefined;
  failed: boolean;
  onRetry: () => void;
};

const ArticleList = ({ slug, articles, failed, onRetry }: ArticleListProps) => {
  const locale = useLocale();
  const t = locale.authorPage;
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className={sectionTitleClass}>
        {t.articlesTitle}
      </h2>
      {failed && (
        <p className={noteClass} role="alert">
          {t.articlesLoadError}{' '}
          <button type="button" onClick={onRetry} className={`cursor-pointer border-0 bg-transparent p-0 ${linkClass}`}>
            {locale.search.retry}
          </button>
        </p>
      )}
      {!failed && !articles && <p className={noteClass}>{locale.common.loading}</p>}
      {articles && articles.total === 0 && <p className={noteClass}>{t.articlesEmpty}</p>}
      {articles && articles.total > 0 && (
        <>
          <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.articlesCount.replace('{count}', String(articles.total))}</p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {articles.items.map((article) => (
              <ArticleListEntry key={article.id} article={article} />
            ))}
          </ul>
          <PageLinks
            label={t.pagesLabel}
            page={articles.page}
            pageCount={authorPageCount(articles.total, articles.pageSize)}
            hrefFor={(page) => authorPageHref(slug, page)}
          />
        </>
      )}
    </section>
  );
};

/**
 * The public page of an author (P-01, #89), `/authors/{slug}`: the avatar, the name, the role, the
 * author's own text and links, for a scholar the self-declared degree and institution, and the
 * articles a reader can open with their dates. An author readers may not see (no name, or nothing
 * published) is a 404. The first page of the list is indexable; further pages are `noindex`.
 */
const AuthorPage = () => {
  const locale = useLocale();
  const t = locale.authorPage;
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const page = readAuthorPage(searchParams);
  const profileQuery = useQuery({ queryKey: authorQueryKey(slug), queryFn: () => getAuthor(slug) });
  const articlesQuery = useQuery({
    queryKey: authorArticlesQueryKey(slug, page),
    queryFn: () => getAuthorArticles(slug, page),
    placeholderData: keepPreviousData,
  });
  const profile = profileQuery.data;

  if (profileQuery.error instanceof ApiError && profileQuery.error.status === 404) {
    return (
      <>
        <NotFoundMeta />
        <NotFoundPage />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <PageMeta description={null} image={null} noIndex />
        {profileQuery.isError ? (
          <p className={noteClass} role="alert">
            {t.loadError}{' '}
            <button
              type="button"
              onClick={() => profileQuery.refetch()}
              className={`cursor-pointer border-0 bg-transparent p-0 ${linkClass}`}
            >
              {locale.search.retry}
            </button>
          </p>
        ) : (
          <p className={noteClass}>{locale.common.loading}</p>
        )}
      </div>
    );
  }

  const path = authorHref(profile.slug);
  const description = authorMetaDescription(profile.bio, t.metaDescription.replace('{name}', profile.displayName));

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <PageMeta
        title={profile.displayName}
        description={description}
        path={page === 1 ? path : undefined}
        noIndex={page > 1}
      />
      <AuthorStructuredData
        author={{
          path,
          name: profile.displayName,
          description: profile.bio,
          image: profile.avatarUrl,
          links: profile.links.map((link) => link.url),
        }}
      />

      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar key={profile.avatarUrl ?? ''} profile={profile} />
        <div className="min-w-0">
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] [overflow-wrap:anywhere] text-[var(--color-ink-strong)]">
            {profile.displayName}
          </h1>
          <p className="mb-0 mt-2 text-base text-[var(--color-ink-muted)]" data-testid="author-role">
            {locale.userRole[profile.role]}
          </p>
        </div>
      </header>

      {profile.bio && (
        <p className="m-0 whitespace-pre-line text-base leading-7 [overflow-wrap:anywhere] text-[var(--color-ink-default)]">
          {profile.bio}
        </p>
      )}

      <SelfDeclared profile={profile} />

      {profile.links.length > 0 && (
        <ul aria-label={t.linksLabel} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-base">
          {profile.links.map((link) => (
            <li key={`${link.label} ${link.url}`}>
              <a href={link.url} rel="nofollow noopener" className={`[overflow-wrap:anywhere] ${linkClass}`}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      <ArticleList
        slug={profile.slug}
        articles={articlesQuery.data}
        failed={articlesQuery.isError && !articlesQuery.data}
        onRetry={() => articlesQuery.refetch()}
      />
    </article>
  );
};

export default AuthorPage;
