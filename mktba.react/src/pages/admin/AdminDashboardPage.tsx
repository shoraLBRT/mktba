import React from 'react';
import { Check, Database, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getArticleSummary } from '../../services/adminService';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import type { ArticleStatus, ArticleSummaryDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { AuthorAnalyticsSection } from './AuthorAnalyticsSection';
import { SiteAnalyticsSection } from './SiteAnalyticsSection';

/** Each status, with its field in the summary's `byStatus`. */
const ARTICLE_STATUSES: [ArticleStatus, keyof ArticleSummaryDto['byStatus']][] = [
  ['Draft', 'draft'],
  ['InReview', 'inReview'],
  ['Published', 'published'],
  ['Archived', 'archived'],
];

const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

/**
 * `/admin`: article counts by content and by status, counted by the API (A-07), for admins the site's
 * own statistics (N-05), and for everyone who writes the statistics of their own articles (P-03).
 */
const AdminDashboardPage: React.FC = () => {
  const locale = useLocale();
  const { can } = useCurrentUser();
  const t = locale.adminPage;
  const summaryQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, 'summary'], queryFn: getArticleSummary });

  const summary = summaryQuery.data;
  const articleCount = summary?.total ?? 0;
  const articlesWithContent = summary?.withContent ?? 0;
  const emptyArticles = summary?.empty ?? 0;
  const shown = (value: number | string) => (summaryQuery.isLoading ? '...' : value);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{locale.adminLayout.dashboardTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.dashboardDescription}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.totalArticles}
              </p>
              <p className="mt-2 text-3xl font-bold text-[var(--color-ink-strong)]">{shown(articleCount)}</p>
            </div>
            <Database size={32} className="text-[var(--color-brand-forest)] opacity-30" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.articlesWithContent}
              </p>
              <p className="mt-2 text-3xl font-bold text-[var(--color-brand-forest)]">{shown(articlesWithContent)}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{share(articlesWithContent, articleCount)}</p>
            </div>
            <Check size={32} className="text-[var(--color-brand-forest)] opacity-30" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.emptyArticles}
              </p>
              <p className="mt-2 text-3xl font-bold text-[var(--color-ink-muted)]">{shown(emptyArticles)}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{share(emptyArticles, articleCount)}</p>
            </div>
            <FileText size={32} className="text-[var(--color-ink-muted)] opacity-30" />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
          {t.statusBreakdownTitle}
        </p>
        <div className="mt-3 flex flex-wrap gap-4" data-testid="article-status-breakdown">
          {ARTICLE_STATUSES.map(([status, field]) => (
            <div key={status} className="flex items-center gap-2">
              <ArticleStatusBadge status={status} />
              <span className="text-lg font-semibold text-[var(--color-ink-strong)]">{shown(summary?.byStatus[field] ?? 0)}</span>
            </div>
          ))}
        </div>
      </Card>

      {can('canViewSiteAnalytics') ? <SiteAnalyticsSection /> : null}
      {can('canEditArticles') ? <AuthorAnalyticsSection /> : null}
    </div>
  );
};

export default AdminDashboardPage;
