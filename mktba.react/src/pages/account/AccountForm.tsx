import React, { forwardRef, useEffect, useRef } from 'react';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

/**
 * The frame of the readers' account pages (U-05, #126): `/login`, `/register`, `/confirm-email`,
 * `/reset-password`. A narrow card with the page's `h1`; `focusTitle` moves the focus to it, for a
 * result that replaces the form.
 */
export const AccountCard: React.FC<{ title: string; intro?: string; focusTitle?: boolean; children?: React.ReactNode }> = ({
  title,
  intro,
  focusTitle = false,
  children,
}) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle, title]);

  return (
    <div className="flex justify-center px-4 py-8 sm:px-6 lg:py-12">
      <Card className="w-full max-w-md border border-[var(--color-border-soft)] bg-white px-6 py-8 shadow-[0_18px_60px_rgba(28,27,24,0.08)]">
        <h1 ref={titleRef} tabIndex={-1} className="m-0 text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink-strong)] outline-none">
          {title}
        </h1>
        {intro ? <p className="mb-0 mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
};

type AccountFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

/** A labelled input with its hint and its error, both tied to it by `aria-describedby`. */
export const AccountField = forwardRef<HTMLInputElement, AccountFieldProps>(({ id, label, hint, error, ...input }, ref) => {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[var(--color-ink-strong)]">
        {label}
      </label>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-11"
        {...input}
      />
      {hint ? (
        <span id={`${id}-hint`} className="mt-1 block text-xs text-[var(--color-ink-subtle)]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
});

AccountField.displayName = 'AccountField';

/**
 * The trap field for bots, as on the feedback form: off-screen inside an `aria-hidden` block, out of
 * the tab order and of autofill, so a person never fills it in; its value is sent as it is.
 */
export const TrapField = forwardRef<HTMLInputElement, { id: string; label: string }>(({ id, label }, ref) => (
  <div aria-hidden="true" className="absolute inset-s-[-9999px] top-auto h-px w-px overflow-hidden">
    <label htmlFor={id}>{label}</label>
    <input ref={ref} id={id} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
  </div>
));

TrapField.displayName = 'TrapField';

/** A focused alert above a form, for an error that belongs to no field. */
export const FormAlert: React.FC<{ message: string | null }> = ({ message }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  return message ? (
    <div ref={ref} role="alert" tabIndex={-1} className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 outline-none">
      {message}
    </div>
  ) : null;
};
