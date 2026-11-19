import React from 'react';
import { Check, Database, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getArticles } from '../../services/adminService';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import type { ArticleStatus } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';

const ARTICLE_STATUSES: ArticleStatus[] = ['Draft', 'InReview', 'Published', 'Archived'];

const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

/** `/admin`: article counts by content and by status. */
const AdminDashboardPage: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminPage;
  const articlesQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES], queryFn: getArticles });

  const articles = articlesQuery.data ?? [];
  const articleCount = articles.length;
  const articlesWithContent = articles.filter((a) => a.hasContent).length;
  const emptyArticles = articleCount - articlesWithContent;
  const countByStatus = (status: ArticleStatus) => articles.filter((a) => a.status === status).length;
  const shown = (value: number | string) => (articlesQuery.isLoading ? '...' : value);

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
          {ARTICLE_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <ArticleStatusBadge status={status} />
              <span className="text-lg font-semibold text-[var(--color-ink-strong)]">{shown(countByStatus(status))}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AdminDashboardPage;
