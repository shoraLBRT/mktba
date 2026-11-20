import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { getTags, mergeTag, renameTag } from '../../services/tagService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { tagHref } from '../../shared/slug';
import type { TagDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

const TAGS_QUERY_KEY = [APP_CONSTANTS.QUERY_KEYS.ADMIN_TAGS] as const;

type TagRowProps = {
  tag: TagDto;
  /** The other tags of the same language: what this one can be merged into. */
  mergeTargets: TagDto[];
  busy: boolean;
  onRename: (tag: TagDto, name: string, slug: string) => void;
  onMerge: (tag: TagDto, into: TagDto) => void;
};

/** One tag: its page, its article count, a rename form and a merge into another tag of its language. */
const TagRow = ({ tag, mergeTargets, busy, onRename, onMerge }: TagRowProps) => {
  const t = useLocale().adminTags;
  const [name, setName] = useState(tag.name);
  const [slug, setSlug] = useState(tag.slug);
  const [intoId, setIntoId] = useState('');
  const into = mergeTargets.find((target) => String(target.id) === intoId);
  const changed = name.trim() !== tag.name || slug.trim() !== tag.slug;

  return (
    <li className="space-y-3 py-4" data-testid={`tag-row-${tag.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link to={tagHref(tag.slug)} className="font-medium text-[var(--color-brand-forest)] hover:underline">
          {tag.name}
        </Link>
        <span className="text-xs text-[var(--color-ink-subtle)]">
          {t.meta.replace('{locale}', tag.locale).replace('{count}', String(tag.articleCount))}
        </span>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(tag, name, slug);
        }}
      >
        <label className="min-w-40 flex-1 text-xs text-[var(--color-ink-muted)]">
          {t.nameLabel}
          <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
        </label>
        <label className="min-w-40 flex-1 text-xs text-[var(--color-ink-muted)]">
          {t.slugLabel}
          <Input value={slug} onChange={(event) => setSlug(event.target.value)} className="mt-1" />
        </label>
        <Button type="submit" disabled={busy || !changed}>
          {t.rename}
        </Button>
      </form>
      {mergeTargets.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-xs text-[var(--color-ink-muted)]">
            {t.mergeLabel}
            <select
              value={intoId}
              onChange={(event) => setIntoId(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
            >
              <option value="">{t.mergePlaceholder}</option>
              {mergeTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="danger"
            disabled={busy || !into}
            onClick={() => {
              if (into && window.confirm(t.mergeConfirm.replaceAll('{from}', tag.name).replace('{into}', into.name))) {
                onMerge(tag, into);
              }
            }}
          >
            {t.merge}
          </Button>
        </div>
      )}
    </li>
  );
};

/**
 * `/admin/tags` (M-06, #70): every tag with its article count, renamed or merged into another tag of
 * its language. Admins only, as in the API; neither action writes a revision.
 */
const AdminTagsPage = () => {
  const locale = useLocale();
  const t = locale.adminTags;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const tagsQuery = useQuery({ queryKey: TAGS_QUERY_KEY, queryFn: getTags });
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  const settle = () => queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
  const renameMutation = useMutation({
    mutationFn: ({ tag, name, slug }: { tag: TagDto; name: string; slug: string }) =>
      renameTag(tag.id, { name, slug: slug.trim() === tag.slug ? null : slug }),
    onSuccess: (renamed) => showNotice('success', t.renamed.replace('{name}', renamed.name)),
    onError: (error) => showNotice('error', extractApiErrorMessage(error)),
    onSettled: settle,
  });
  const mergeMutation = useMutation({
    mutationFn: ({ tag, into }: { tag: TagDto; into: TagDto }) => mergeTag(tag.id, { intoTagId: into.id }),
    onSuccess: (remaining) => showNotice('success', t.merged.replace('{name}', remaining.name)),
    onError: (error) => showNotice('error', extractApiErrorMessage(error)),
    onSettled: settle,
  });
  const busy = renameMutation.isPending || mergeMutation.isPending;

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <Card className="p-6">
        {tagsQuery.isPending && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>}
        {tagsQuery.isError && (
          <p className="m-0 text-sm text-red-600" role="alert">
            {extractApiErrorMessage(tagsQuery.error)}
          </p>
        )}
        {tagsQuery.isSuccess && tags.length === 0 && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>}
        {tags.length > 0 && (
          <ul className="m-0 list-none divide-y divide-[var(--color-border-soft)] p-0">
            {tags.map((tag) => (
              <TagRow
                // A rename or merge reloads the list: the row starts again from the saved values.
                key={`${tag.id} ${tag.name} ${tag.slug}`}
                tag={tag}
                mergeTargets={tags.filter((other) => other.locale === tag.locale && other.id !== tag.id)}
                busy={busy}
                onRename={(target, name, slug) => renameMutation.mutate({ tag: target, name, slug })}
                onMerge={(target, into) => mergeMutation.mutate({ tag: target, into })}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default AdminTagsPage;
