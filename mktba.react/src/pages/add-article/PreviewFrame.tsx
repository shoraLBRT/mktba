import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type PreviewFrameProps = {
  /** The emulated screen width in CSS pixels: the page's media queries see exactly this viewport. */
  width: number;
  title: string;
  children: ReactNode;
};

/** The page's stylesheets, copied into the frame: Tailwind, the fonts, the Markdown styles. */
const copyStyles = (target: Document) => {
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => target.importNode(node, true));
  target.head.replaceChildren(...styles);
  target.documentElement.lang = document.documentElement.lang;
};

/**
 * Renders `children` inside an iframe of the given width, through a portal, so they keep the app's
 * React context (localization, queries, router) while `sm:` … `xl:` and `@container` queries respond
 * to the frame's width as they would to a phone's or a desktop's screen (E-11, #81).
 *
 * The preview is a look, not a page: a click on a link never navigates (a router link would leave
 * the editor, a plain one would load into the frame); an in-page `#anchor` scrolls the frame to it.
 */
export const PreviewFrame = ({ width, title, children }: PreviewFrameProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const scaleBoxRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const attach = () => {
      const frameDocument = frame.contentDocument;
      if (!frameDocument?.body) return;
      copyStyles(frameDocument);
      setBody(frameDocument.body);
    };
    // A frame without `src` keeps its first, empty document; some browsers report its load before
    // this effect runs, others after.
    if (frame.contentDocument?.readyState === 'complete') attach();
    frame.addEventListener('load', attach);
    return () => frame.removeEventListener('load', attach);
  }, []);

  // A screen wider than the editor's column is shown scaled down, not cut off.
  useEffect(() => {
    const box = scaleBoxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const scale = availableWidth !== null && availableWidth < width ? availableWidth / width : 1;
  const frameHeight = 720;

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest?.('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('#') && body) {
      body.ownerDocument.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' });
    }
  };

  return (
    <div ref={scaleBoxRef} className="w-full" style={{ height: frameHeight * scale }}>
      <iframe
        ref={frameRef}
        title={title}
        data-testid="article-preview-frame"
        className="mx-auto block rounded-xl border border-[var(--color-border-soft)] bg-white shadow-sm"
        style={{
          width,
          height: frameHeight,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          marginLeft: scale < 1 ? 0 : undefined,
        }}
      />
      {body ? createPortal(<div onClickCapture={handleClickCapture}>{children}</div>, body) : null}
    </div>
  );
};
