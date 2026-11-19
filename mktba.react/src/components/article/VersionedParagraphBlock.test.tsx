import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { VersionedParagraphBlock, type OpinionTab } from './VersionedParagraphBlock';

const tabs: OpinionTab[] = [
  { label: 'Ханафиты', heading: 'Мнение мазхаба: Ханафитский мазхаб', paletteKey: 'hanafi', isReaderSchool: false },
  { label: 'Маликиты', heading: 'Мнение мазхаба: Маликитский мазхаб', paletteKey: 'maliki', isReaderSchool: true },
  { label: 'Шафииты', heading: 'Мнение мазхаба: Шафиитский мазхаб', paletteKey: 'shafii', isReaderSchool: false },
];
const texts = ['Мнение ханафитов', 'Мнение маликитов', 'Мнение шафиитов'];

const Block = ({ initialIndex = 0, note }: { initialIndex?: number; note?: string | null }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  return (
    <LocalizationProvider>
      <VersionedParagraphBlock
        activeIndex={activeIndex}
        tabs={tabs}
        note={note}
        onSelect={setActiveIndex}
        panels={texts.map((text) => <p key={text}>{text}</p>)}
      />
    </LocalizationProvider>
  );
};

const panelOf = (text: string) => screen.getByText(text).parentElement as HTMLElement;

describe('VersionedParagraphBlock', () => {
  it('given several opinions, when rendered on the server, then the HTML carries every opinion and hides the inactive ones', () => {
    const html = renderToString(<Block initialIndex={1} />);

    texts.forEach((text) => expect(html).toContain(text));
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/hidden=""/g)).toHaveLength(2);
  });

  it('given several opinions, when rendered, then only the active panel is visible and wired to its tab', () => {
    render(<Block initialIndex={1} />);

    expect(panelOf(texts[0]).hidden).toBe(true);
    expect(panelOf(texts[1]).hidden).toBe(false);
    expect(panelOf(texts[2]).hidden).toBe(true);

    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab.hasAttribute('aria-label')).toBe(false);
    expect(activeTab.textContent).toContain(tabs[1].label);
    expect(screen.getByText(tabs[1].heading)).toBeTruthy();
    expect(activeTab.getAttribute('aria-controls')).toBe(panelOf(texts[1]).id);
    expect(panelOf(texts[1]).getAttribute('aria-labelledby')).toBe(activeTab.id);
    expect(activeTab.tabIndex).toBe(0);
    screen.getAllByRole('tab', { selected: false }).forEach((tab) => expect(tab.tabIndex).toBe(-1));
  });

  it('given a focused tab, when arrow, Home and End keys are pressed, then the selection and focus move and wrap', () => {
    render(<Block />);
    const tabAt = (index: number) => screen.getAllByRole('tab')[index];

    fireEvent.keyDown(tabAt(0), { key: 'ArrowRight' });
    expect(tabAt(1).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabAt(1));
    expect(panelOf(texts[1]).hidden).toBe(false);

    fireEvent.keyDown(tabAt(1), { key: 'End' });
    expect(tabAt(2).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabAt(2), { key: 'ArrowRight' });
    expect(tabAt(0).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabAt(0), { key: 'ArrowLeft' });
    expect(tabAt(2).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabAt(2), { key: 'Home' });
    expect(tabAt(0).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabAt(0));
  });

  it('given a key that is not a navigation key, when pressed on a tab, then the selection stays', () => {
    render(<Block />);

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'a' });

    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true');
  });

  it('given an opinion of the reader mazhab, when rendered, then its tab name starts with the school and marks it as theirs', () => {
    render(<Block />);

    const readerTab = screen.getByRole('tab', { name: 'Маликиты, ваш мазхаб' });
    expect(readerTab.querySelector('[data-reader-school]')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Ханафиты' }).querySelector('[data-reader-school]')).toBeNull();
  });

  it('given a note, when rendered, then it is shown above the text; without one nothing is shown', () => {
    const { unmount } = render(<Block note="У ханафитов отдельного мнения нет — показано общее" />);
    expect(screen.getByText('У ханафитов отдельного мнения нет — показано общее')).toBeTruthy();
    unmount();

    render(<Block />);
    expect(screen.queryByText(/отдельного мнения нет/)).toBeNull();
  });

  it('given the block, when rendered, then it has no previous or next arrow buttons', () => {
    render(<Block />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
