import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useSiteUrl } from '../app/siteUrl';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useMazhab } from '../context/mazhabContext';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { formatMessage } from '../localization';
import { useLocale } from '../localization/hooks';
import { sendFeedback } from '../services/feedbackService';
import { getSystemSchools } from '../services/schoolService';
import { toApiError, translateApiError } from '../shared/api-client/apiError';
import { findArticlePath } from '../shared/articleTree';
import {
  FEEDBACK_CONTACT_MAX_LENGTH,
  FEEDBACK_TEXT_MAX_LENGTH,
  FEEDBACK_TYPES,
  feedbackTextLength,
  readFeedbackRequest,
} from '../shared/feedback';
import { siteUrlFor } from '../shared/siteMeta';
import type { FeedbackType } from '../shared/types/ApiTypes';
import { Button } from '../shared/ui/Button';
import { Input } from '../shared/ui/Input';
import { Textarea } from '../shared/ui/Textarea';

type FieldName = 'type' | 'text' | 'contact';
type FieldErrors = Partial<Record<FieldName, string>>;

/** The server's validation codes and the field each belongs to; any other error is about the whole form. */
const fieldByErrorCode: Record<string, FieldName> = {
  feedback_type_invalid: 'type',
  feedback_text_required: 'text',
  feedback_text_too_long: 'text',
  feedback_contact_too_long: 'contact',
};

const labelClass = 'mb-1.5 block text-sm font-medium text-[var(--color-ink-strong)]';
const hintClass = 'mb-0 mt-1.5 text-[13px] leading-5 text-[var(--color-ink-muted)]';
const errorClass = 'mb-0 mt-1.5 text-[13px] leading-5 text-red-700';
const linkClass = 'text-[var(--color-brand-forest)] underline [overflow-wrap:anywhere]';

/**
 * The feedback form (F-01, #66): no sign-in, a kind of message, the text and an optional contact.
 * The link that leads here (`feedbackHref`) says which page, article and kind the message is about;
 * the form attaches them and the reader's mazhab by itself and shows all of it before sending.
 * A failed send keeps everything typed; a sent message is confirmed with its number.
 */
const FeedbackPage = () => {
  const t = useLocale().feedbackPage;
  const siteUrl = useSiteUrl();
  const [searchParams] = useSearchParams();
  const request = readFeedbackRequest(searchParams);

  const { selectedSchoolId } = useMazhab();
  const { data: systemSchools = [] } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
    queryFn: getSystemSchools,
    staleTime: Infinity,
  });
  const school = systemSchools.find((candidate) => candidate.id === selectedSchoolId) ?? null;

  const { data: navigationTree } = useNavigationTree();
  const articleTitle = request.articleId === null
    ? null
    : findArticlePath(navigationTree, request.articleId).at(-1)?.title ?? null;

  const [type, setType] = useState<FeedbackType | null>(
    request.type ?? (request.articleId === null ? null : 'ArticleError'),
  );
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);

  const firstTypeRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const textLength = feedbackTextLength(text);
  const textTooLong = textLength > FEEDBACK_TEXT_MAX_LENGTH;

  const focusField = (field: FieldName) => {
    const target = field === 'type' ? firstTypeRef.current : field === 'text' ? textRef.current : contactRef.current;
    target?.focus();
  };

  const mutation = useMutation({
    mutationFn: sendFeedback,
    onSuccess: ({ id }) => setSentId(id),
    onError: (error) => {
      const apiError = toApiError(error);
      const field = apiError.code ? fieldByErrorCode[apiError.code] : undefined;
      if (field) {
        setFieldErrors({ [field]: apiError.message });
        focusField(field);
      } else {
        setFormError(apiError.message);
      }
    },
  });

  useEffect(() => {
    if (sentId !== null) {
      successRef.current?.focus();
    }
  }, [sentId]);

  useEffect(() => {
    if (formError !== null) {
      formErrorRef.current?.focus();
    }
  }, [formError]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }

    const errors: FieldErrors = {};
    if (type === null) {
      errors.type = translateApiError('feedback_type_invalid');
    }
    if (textLength === 0) {
      errors.text = translateApiError('feedback_text_required');
    } else if (textTooLong) {
      errors.text = translateApiError('feedback_text_too_long', { maxLength: FEEDBACK_TEXT_MAX_LENGTH });
    }
    if (contact.trim().length > FEEDBACK_CONTACT_MAX_LENGTH) {
      errors.contact = translateApiError('feedback_contact_too_long', { maxLength: FEEDBACK_CONTACT_MAX_LENGTH });
    }

    setFieldErrors(errors);
    setFormError(null);
    const firstInvalid = (['type', 'text', 'contact'] as const).find((field) => errors[field]);
    if (firstInvalid || type === null) {
      focusField(firstInvalid ?? 'type');
      return;
    }

    mutation.mutate({
      type,
      text,
      contact: contact.trim() || null,
      pageUrl: request.from,
      articleId: request.articleId,
      mazhab: school?.slug ?? null,
      website: websiteRef.current?.value ?? '',
    });
  };

  const handleSendAnother = () => {
    setText('');
    setFieldErrors({});
    setFormError(null);
    setSentId(null);
    mutation.reset();
  };

  if (sentId !== null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div
          className="rounded-3xl border border-[var(--color-border-soft)] bg-white px-5 py-8 text-center shadow-sm sm:px-8"
          data-testid="feedback-success"
        >
          <CheckCircle2 size={36} aria-hidden="true" className="mx-auto text-[var(--color-brand-forest)]" />
          <h1
            ref={successRef}
            tabIndex={-1}
            className="mb-0 mt-3 text-2xl font-semibold text-[var(--color-ink-strong)] outline-none"
          >
            {formatMessage(t.successTitle, { id: sentId })}
          </h1>
          <p className="mb-0 mt-3 text-base leading-7 text-[var(--color-ink-muted)]">{t.successMessage}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={request.from ?? '/'}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-brand-forest)] bg-[var(--color-brand-forest)] px-4 py-2 text-sm font-medium text-white no-underline hover:bg-[var(--color-brand-forest-strong)]"
            >
              {request.from ? t.backToPage : t.backHome}
            </Link>
            <Button onClick={handleSendAnother}>{t.sendAnother}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em] text-[var(--color-ink-strong)]">{t.title}</h1>
      <p className="mb-0 mt-3 text-base leading-7 text-[var(--color-ink-muted)]">{t.intro}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6" data-testid="feedback-form">
        {formError !== null && (
          <div
            ref={formErrorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 outline-none"
          >
            <p className="m-0 font-semibold">{t.errorTitle}</p>
            <p className="m-0">{formError}</p>
            <p className="m-0">{t.errorKeepsText}</p>
          </div>
        )}

        <fieldset
          className="m-0 min-w-0 border-0 p-0"
          aria-describedby={fieldErrors.type ? 'feedback-type-error' : undefined}
        >
          <legend className={labelClass}>{t.typeLegend}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {FEEDBACK_TYPES.map((option, index) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-border-soft)] bg-white px-3 py-2 text-sm text-[var(--color-ink-strong)] has-[:checked]:border-[var(--color-brand-forest)] has-[:checked]:bg-[var(--color-brand-forest-soft)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--color-focus-ring)]"
              >
                <input
                  ref={index === 0 ? firstTypeRef : undefined}
                  type="radio"
                  name="type"
                  value={option}
                  checked={type === option}
                  onChange={() => setType(option)}
                  aria-invalid={fieldErrors.type ? true : undefined}
                  className="accent-[var(--color-brand-forest)]"
                />
                {t.types[option]}
              </label>
            ))}
          </div>
          {fieldErrors.type && <p id="feedback-type-error" className={errorClass}>{fieldErrors.type}</p>}
        </fieldset>

        <div>
          <label htmlFor="feedback-text" className={labelClass}>{t.textLabel}</label>
          <Textarea
            ref={textRef}
            id="feedback-text"
            name="text"
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
            aria-invalid={fieldErrors.text ? true : undefined}
            aria-describedby={fieldErrors.text ? 'feedback-text-error feedback-text-counter' : 'feedback-text-counter'}
            className="block min-h-36 resize-y text-base leading-6"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {fieldErrors.text && <p id="feedback-text-error" className={errorClass}>{fieldErrors.text}</p>}
            </div>
            <p
              id="feedback-text-counter"
              className={`mb-0 mt-1.5 shrink-0 text-[13px] leading-5 tabular-nums ${textTooLong ? 'font-semibold text-red-700' : 'text-[var(--color-ink-muted)]'}`}
              aria-label={formatMessage(t.textCounterLabel, { count: textLength, max: FEEDBACK_TEXT_MAX_LENGTH })}
            >
              {formatMessage(t.textCounter, { count: textLength, max: FEEDBACK_TEXT_MAX_LENGTH })}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="feedback-contact" className={labelClass}>
            {t.contactLabel}
            {' '}
            <span className="font-normal text-[var(--color-ink-muted)]">({t.optional})</span>
          </label>
          <Input
            ref={contactRef}
            id="feedback-contact"
            name="contact"
            type="text"
            autoComplete="email"
            maxLength={FEEDBACK_CONTACT_MAX_LENGTH}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            aria-invalid={fieldErrors.contact ? true : undefined}
            aria-describedby={fieldErrors.contact ? 'feedback-contact-error feedback-contact-hint' : 'feedback-contact-hint'}
            className="text-base"
          />
          {fieldErrors.contact && <p id="feedback-contact-error" className={errorClass}>{fieldErrors.contact}</p>}
          <p id="feedback-contact-hint" className={hintClass}>{t.contactHint}</p>
        </div>

        {/* The trap for bots (F-03): people neither see nor reach it, and its value is sent as it is. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="feedback-website">{t.websiteLabel}</label>
          <input
            ref={websiteRef}
            id="feedback-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <section
          aria-labelledby="feedback-attached-title"
          className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-4 py-4 text-sm leading-6 text-[var(--color-ink-default)]"
          data-testid="feedback-attached"
        >
          <h2 id="feedback-attached-title" className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">
            {t.attachedTitle}
          </h2>
          {request.from === null ? (
            <p className="mb-0 mt-2">{t.attachedNothing}</p>
          ) : null}
          <ul className="mb-0 mt-2 list-disc space-y-1 pl-5">
            {request.from !== null && (
              <li className="[overflow-wrap:anywhere]">
                {t.attachedPage}
                {' '}
                <Link to={request.from} className={linkClass}>{siteUrlFor(request.from, siteUrl)}</Link>
              </li>
            )}
            {articleTitle !== null && (
              <li className="[overflow-wrap:anywhere]">
                {t.attachedArticle}
                {' '}
                <span className="font-medium text-[var(--color-ink-strong)]">{articleTitle}</span>
              </li>
            )}
            <li>
              {t.attachedMazhab}
              {' '}
              <span className="font-medium text-[var(--color-ink-strong)]" data-testid="feedback-mazhab">
                {school?.name ?? t.attachedMazhabNone}
              </span>
            </li>
          </ul>
          <p className="mb-0 mt-3 text-[13px] leading-5 text-[var(--color-ink-muted)]">{t.publicNotice}</p>
        </section>

        <Button type="submit" variant="primary" disabled={mutation.isPending} className="w-full sm:w-auto">
          {mutation.isPending ? t.submitting : t.submit}
        </Button>
      </form>
    </div>
  );
};

export default FeedbackPage;
