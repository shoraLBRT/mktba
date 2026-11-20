import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type PreviewDialogProps = {
  onClose: () => void;
  /** The dialog's content, given the id its heading must carry and the function that closes it. */
  children: (titleId: string, close: () => void) => ReactNode;
};

/**
 * A modal dialog over the whole window (E-11, #81). The focus moves to its close button; Escape
 * (also from inside the preview's frame) or the button closes it and returns the focus to where it
 * was, the «Просмотр» button. While it is open the rest of the page is `inert` and hidden from
 * assistive technology, and the page does not scroll under it.
 */
export const PreviewDialog = ({ onClose, children }: PreviewDialogProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read while rendering: the dialog only ever opens in the browser, after a click.
  const [openedFrom] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [host] = useState(() => document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(host);
    const hidden = [...document.body.children].filter(
      (element): element is HTMLElement => element !== host && element instanceof HTMLElement && !element.inert,
    );
    for (const element of hidden) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('[data-dialog-close]')?.focus();

    return () => {
      for (const element of hidden) {
        element.inert = false;
        element.removeAttribute('aria-hidden');
      }
      document.body.style.overflow = overflow;
      host.remove();
      // Only now: an inert element does not take the focus.
      openedFrom?.focus();
    };
  }, [host, openedFrom]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--color-page-panel)]"
    >
      {children(titleId, onClose)}
    </div>,
    host,
  );
};
