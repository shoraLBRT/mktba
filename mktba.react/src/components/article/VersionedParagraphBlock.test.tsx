import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { VersionedParagraphBlock, type OpinionTab } from './VersionedParagraphBlock';

const tabs: OpinionTab[] = [
  { shortLabel: 'Хан', fullLabel: 'Ханафитский мазхаб', paletteKey: 'hanafi' },
  { shortLabel: 'Мал', fullLabel: 'Маликитский мазхаб', paletteKey: 'maliki' },
  { shortLabel: 'Шаф', fullLabel: 'Шафиитский мазхаб', paletteKey: 'shafii' },
];
const texts = ['Мнение ханафитов', 'Мнение маликитов', 'Мнение шафиитов'];

const Block = ({ mode = 'numbers' as const, initialIndex = 0 }: { mode?: 'arrows' | 'numbers'; initialIndex?: number }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  return (
    <LocalizationProvider>
      <VersionedParagraphBlock
        order={1}
        activeIndex={activeIndex}
        tabs={tabs}
        mode={mode}
        onSelect={setActiveIndex}
        onMove={(direction) => setActiveIndex((index) => (index + direction + tabs.length) % tabs.length)}
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

  it('given tabs mode, when rendered, then only the active panel is visible and wired to its tab', () => {
    render(<Block initialIndex={1} />);

    expect(panelOf(texts[0]).hidden).toBe(true);
    expect(panelOf(texts[1]).hidden).toBe(false);
    expect(panelOf(texts[2]).hidden).toBe(true);

    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab.getAttribute('aria-label')).toBe(tabs[1].fullLabel);
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

  it('given arrows mode, when the next arrow is clicked, then every opinion stays in the DOM and the next one shows', () => {
    render(<Block mode="arrows" />);

    expect(screen.queryByRole('tabpanel')).toBeNull();
    texts.forEach((text) => expect(screen.getByText(text)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Следующее мнение' }));

    expect(panelOf(texts[0]).hidden).toBe(true);
    expect(panelOf(texts[1]).hidden).toBe(false);
  });
});
