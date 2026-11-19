import { useCallback, useEffect, useRef, useState } from 'react';

/** A section counts as current once its top has passed this many pixels from the viewport's top. */
const ACTIVATION_LINE = 120;

export type SectionPosition = {
  id: string;
  /** Distance from the viewport's top to the section's top, in pixels. */
  top: number;
};

/**
 * The section the reader is in: the last one whose top has passed the activation line, or the
 * first one above the fold. At the end of the page the sections that can no longer reach the line
 * are all on screen: the one the reader asked for (`preferredId`) wins, otherwise the last.
 */
export const pickActiveSection = (
  sections: SectionPosition[],
  atPageEnd: boolean,
  preferredId: string | null = null,
): string | null => {
  if (sections.length === 0) return null;

  if (atPageEnd) {
    const unreachable = sections.filter((section) => section.top > ACTIVATION_LINE);
    if (unreachable.some((section) => section.id === preferredId)) return preferredId;
    return sections[sections.length - 1].id;
  }

  const passed = sections.filter((section) => section.top <= ACTIVATION_LINE);
  return (passed[passed.length - 1] ?? sections[0]).id;
};

/**
 * Follows the page scroll and names the current section among the elements with the given ids.
 * `select` marks a section the reader jumped to, which matters at the end of the page (see
 * {@link pickActiveSection}).
 */
export const useActiveSection = (ids: string[]): { activeId: string | null; select: (id: string) => void } => {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const preferredRef = useRef<string | null>(null);
  const key = ids.join('\n');

  useEffect(() => {
    const sectionIds = key.length > 0 ? key.split('\n') : [];
    if (sectionIds.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null)
        .map((element) => ({ id: element.id, top: element.getBoundingClientRect().top }));
      const page = document.documentElement;
      const atPageEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= page.scrollHeight - 2;
      if (!atPageEnd) preferredRef.current = null;
      setActiveId(pickActiveSection(sections, atPageEnd, preferredRef.current));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [key]);

  const select = useCallback((id: string) => {
    preferredRef.current = id;
    setActiveId(id);
  }, []);

  return { activeId: activeId !== null && ids.includes(activeId) ? activeId : ids[0] ?? null, select };
};
