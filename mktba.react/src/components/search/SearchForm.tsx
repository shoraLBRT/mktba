import { useId, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLocale } from '../../localization/hooks';
import {
  normalizeSearchQuery,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PATH,
  SEARCH_QUERY_PARAM,
  searchHref,
} from '../../shared/search';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';

type SearchFormProps = {
  /** The query the field starts with. */
  initialQuery?: string;
  /** Focus the field when the form appears (the Ctrl+K dialog). */
  autoFocus?: boolean;
  className?: string;
};

/**
 * The site search field (R-10, #46). A plain GET form to the results page, so it works before the
 * scripts load; with them it navigates without a page load.
 */
export const SearchForm = ({ initialQuery = '', autoFocus = false, className }: SearchFormProps) => {
  const t = useLocale().search.form;
  const navigate = useNavigate();
  const inputId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = normalizeSearchQuery(new FormData(event.currentTarget).get(SEARCH_QUERY_PARAM)?.toString());
    navigate(searchHref(query));
  };

  return (
    <form role="search" action={SEARCH_PATH} method="get" onSubmit={handleSubmit} className={className}>
      <label htmlFor={inputId} className="sr-only">
        {t.label}
      </label>
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]" aria-hidden="true" />
          <Input
            id={inputId}
            type="search"
            name={SEARCH_QUERY_PARAM}
            defaultValue={initialQuery}
            placeholder={t.placeholder}
            autoComplete="off"
            autoFocus={autoFocus}
            required
            minLength={SEARCH_MIN_QUERY_LENGTH}
            maxLength={SEARCH_MAX_QUERY_LENGTH}
            className="h-full rounded-2xl py-3 pl-11 pr-4 text-base"
          />
        </div>
        <Button type="submit" variant="primary" className="rounded-2xl px-5">
          {t.submit}
        </Button>
      </div>
    </form>
  );
};
