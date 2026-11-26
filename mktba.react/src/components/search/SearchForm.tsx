import { useId, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { trackEvent } from '../../analytics/events';
import { METRIKA_GOALS, trackGoal } from '../../analytics/metrika';
import { useLocale, useLocalizedPath } from '../../localization/hooks';
import {
  normalizeSearchQuery,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PATH,
  SEARCH_QUERY_PARAM,
  SEARCH_VERIFIED_PARAM,
  SEARCH_VERIFIED_VALUE,
  searchHref,
} from '../../shared/search';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';

type SearchFormProps = {
  /** The query the field starts with. */
  initialQuery?: string;
  /** Focus the field when the form appears (the Ctrl+K dialog). */
  autoFocus?: boolean;
  /**
   * Show the «только проверенные» checkbox (V-08, #124) with this state: the results page has it,
   * the dialog and the home page do not. A change submits the form at once.
   */
  verifiedFilter?: boolean;
  className?: string;
};

/**
 * The site search field (R-10, #46). A plain GET form to the results page, so it works before the
 * scripts load; with them it navigates without a page load.
 */
export const SearchForm = ({ initialQuery = '', autoFocus = false, verifiedFilter, className }: SearchFormProps) => {
  const t = useLocale().search.form;
  const localize = useLocalizedPath();
  const navigate = useNavigate();
  const inputId = useId();
  const verifiedId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = normalizeSearchQuery(data.get(SEARCH_QUERY_PARAM)?.toString());
    trackGoal(METRIKA_GOALS.search);
    trackEvent({ type: 'Search', query });
    navigate(localize(searchHref(query, 1, data.get(SEARCH_VERIFIED_PARAM) === SEARCH_VERIFIED_VALUE)));
  };

  return (
    <form role="search" action={localize(SEARCH_PATH)} method="get" onSubmit={handleSubmit} className={className}>
      <label htmlFor={inputId} className="sr-only">
        {t.label}
      </label>
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute inset-s-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]" aria-hidden="true" />
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
            className="h-full rounded-2xl py-3 ps-11 pe-4 text-base"
          />
        </div>
        <Button type="submit" variant="primary" className="rounded-2xl px-5">
          {t.submit}
        </Button>
      </div>
      {verifiedFilter !== undefined && (
        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-ink-default)]">
          <input
            id={verifiedId}
            type="checkbox"
            name={SEARCH_VERIFIED_PARAM}
            value={SEARCH_VERIFIED_VALUE}
            defaultChecked={verifiedFilter}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="h-4 w-4 accent-[var(--color-brand-forest)]"
          />
          <label htmlFor={verifiedId}>{t.verifiedOnly}</label>
        </div>
      )}
    </form>
  );
};
