import { Tag } from 'lucide-react';
import { Link } from 'react-router';
import { useLocalizedPath } from '../../localization/hooks';
import { tagHref } from '../../shared/slug';
import type { ArticleTagDto } from '../../shared/types/ApiTypes';

type ArticleTagListProps = {
  tags: ArticleTagDto[];
  /** Accessible name of the list (the caption above it is not a heading). */
  label: string;
};

/**
 * An article's tags as links to their pages (M-06, #70), for the right sidebar and the mobile overview,
 * in the page's language: a tag belongs to the article's language (I-06, #110).
 */
export const ArticleTagList = ({ tags, label }: ArticleTagListProps) => {
  const localize = useLocalizedPath();
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-1 p-0">
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            to={localize(tagHref(tag.slug))}
            className="flex items-center gap-1 rounded-full bg-[var(--color-brand-forest-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-forest)] no-underline hover:underline"
          >
            <Tag size={8} aria-hidden="true" />
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
};
