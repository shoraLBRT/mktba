import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInternalLinkClicks, useOpinionImpressions, useScrollDepth } from './articleEvents';

/** A stand-in for the browser's observer: the test decides which paragraphs are in view. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets: Element[] = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve(target: Element) {
    this.targets.splice(this.targets.indexOf(target), 1);
  }

  disconnect() {
    this.targets.length = 0;
  }

  show(paragraphId: number) {
    const target = this.targets.find((element) => (element as HTMLElement).dataset.paragraphId === String(paragraphId));
    if (target) this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const lastObserver = () => FakeIntersectionObserver.instances.at(-1)!;

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  window.history.replaceState(null, '', '/zakyat');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const Text = ({ top, onDepth }: { top: { value: number }; onDepth: (depth: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useScrollDepth(ref, true, onDepth);
  return (
    <div
      ref={(element) => {
        ref.current = element;
        if (element) {
          element.getBoundingClientRect = () => ({ top: top.value, height: 1000 }) as DOMRect;
        }
      }}
    />
  );
};

describe('useScrollDepth', () => {
  it('given a reader scrolling through the text, when each depth is passed, then each is reported once and in order', () => {
    // The window is 768 px high (jsdom); the text starts at 700 px, so nothing is passed yet.
    const top = { value: 700 };
    const onDepth = vi.fn();
    render(<Text top={top} onDepth={onDepth} />);
    expect(onDepth).not.toHaveBeenCalled();

    top.value = 400;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onDepth.mock.calls).toEqual([[25]]);

    top.value = -300;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onDepth.mock.calls).toEqual([[25], [50], [75], [100]]);
  });
});

const Paragraphs = ({ ids, onShown }: { ids: number[]; onShown: (id: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useOpinionImpressions(ref, ids.join(','), onShown);
  return (
    <div ref={ref}>
      {ids.map((id) => (
        <div key={id} data-paragraph-id={id} />
      ))}
    </div>
  );
};

describe('useOpinionImpressions', () => {
  it('given versioned paragraphs, when each comes into view, then it is reported once', () => {
    const onShown = vi.fn();
    const { rerender } = render(<Paragraphs ids={[11, 12]} onShown={onShown} />);

    act(() => lastObserver().show(12));
    act(() => lastObserver().show(12));
    rerender(<Paragraphs ids={[11, 12]} onShown={onShown} />);
    act(() => lastObserver().show(11));

    expect(onShown.mock.calls).toEqual([[12], [11]]);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it('given no paragraphs yet, when rendered, then nothing is observed', () => {
    render(<Paragraphs ids={[]} onShown={vi.fn()} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});

const Article = ({ onFollow }: { onFollow: (path: string) => void }) => {
  const ref = useRef<HTMLElement>(null);
  useInternalLinkClicks(ref, true, onFollow);
  return (
    <article ref={ref}>
      <a href="/salat?mazhab=hanafi#wudu">
        <span>Намаз</span>
      </a>
      <a href="#nisab">Нисаб</a>
      <a href="/zakyat#nisab">Нисаб</a>
      <a href="https://example.com/salat">Чужой сайт</a>
    </article>
  );
};

describe('useInternalLinkClicks', () => {
  it('given links in the article, when they are clicked, then only those to another page of the site are reported, by path', () => {
    const onFollow = vi.fn();
    const { getByText, getAllByText } = render(<Article onFollow={onFollow} />);

    fireEvent.click(getByText('Намаз'));
    getAllByText('Нисаб').forEach((link) => fireEvent.click(link));
    fireEvent.click(getByText('Чужой сайт'));

    expect(onFollow.mock.calls).toEqual([['/salat']]);
  });
});
