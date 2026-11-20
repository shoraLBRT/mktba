import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadToEnd } from './useReadToEnd';

/** A stand-in for the browser's observer: the test decides when the end of the text is in view. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  show(isIntersecting: boolean) {
    const entries = this.targets.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry);
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

const Text = ({ enabled, onReached }: { enabled: boolean; onReached: () => void }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useReadToEnd(endRef, enabled, onReached);
  return <div ref={endRef} />;
};

const lastObserver = () => FakeIntersectionObserver.instances.at(-1);

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReadToEnd', () => {
  it('given the end of the text, when it comes into view, then reports once and stops observing', () => {
    const onReached = vi.fn();
    const { rerender } = render(<Text enabled onReached={onReached} />);

    act(() => lastObserver()?.show(false));
    expect(onReached).not.toHaveBeenCalled();

    act(() => lastObserver()?.show(true));
    rerender(<Text enabled onReached={onReached} />);

    expect(onReached).toHaveBeenCalledTimes(1);
    expect(lastObserver()?.disconnected).toBe(true);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it('given a stub without text, when rendered, then nothing is observed', () => {
    render(<Text enabled={false} onReached={vi.fn()} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('given another article (a new callback), when its end comes into view, then it is reported too', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Text enabled onReached={first} />);
    act(() => lastObserver()?.show(true));

    rerender(<Text enabled onReached={second} />);
    act(() => lastObserver()?.show(true));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
