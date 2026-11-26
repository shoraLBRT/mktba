import { useLocale } from '../../localization/hooks';

/**
 * «Проверено учёными» (V-08, #124): the small mark beside an article that counts as verified
 * (`isVerified` from the API: a current confirmation and no current «есть ошибки»). Text and CSS only.
 */
export const VerifiedMark = () => {
  const t = useLocale().articlePage.verification;
  return (
    <span
      title={t.markTitle}
      className="ms-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--color-brand-forest-soft)] px-2 py-0.5 align-middle text-[11px] font-medium text-[var(--color-brand-forest)]"
    >
      <span aria-hidden="true">✓</span>
      {t.mark}
    </span>
  );
};
