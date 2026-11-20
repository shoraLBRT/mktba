import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { emptySeoDraft } from '../../shared/seo';
import { SeoFields } from './SeoFields';

const Harness = () => {
  const [seo, setSeo] = useState(emptySeoDraft);
  return <SeoFields value={seo} onChange={setSeo} snippet={{ title: seo.title || 'Намаз', description: seo.description || null }} url="mktba.ru/namaz" />;
};

/** Opens the collapsed section the way a click on its summary does (jsdom queues the toggle event). */
const openSeoSection = () => {
  const details = screen.getByTestId('seo-fields') as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event('toggle'));
};

const renderFields = () => {
  const result = render(
    <LocalizationProvider>
      <Harness />
    </LocalizationProvider>,
  );
  openSeoSection();
  return result;
};

describe('SeoFields', () => {
  it('given typing in the SEO title, when rendered, then the counter shows the length against the limit', () => {
    renderFields();

    fireEvent.change(screen.getByLabelText('Заголовок для поиска'), { target: { value: 'Намаз' } });

    expect(screen.getByText('5 / 70')).toBeTruthy();
    expect(screen.getByText('0 / 160')).toBeTruthy();
  });

  it('given an invalid image URL, when typed, then shows the format hint', () => {
    renderFields();

    fireEvent.change(screen.getByLabelText('Изображение для соцсетей'), { target: { value: 'javascript:alert(1)' } });

    expect(screen.getByText(/Нужен полный адрес/)).toBeTruthy();
  });

  it('given the section opened, when noindex is ticked, then the search preview shows the effective values and the warning', () => {
    renderFields();

    fireEvent.click(screen.getByLabelText(/Не индексировать/));

    const snippet = screen.getByTestId('seo-snippet');
    expect(snippet.textContent).toContain('mktba.ru/namaz');
    expect(snippet.textContent).toContain('Намаз');
    expect(snippet.textContent).toContain('Описания нет');
    expect(snippet.textContent).toContain('в выдаче статьи не будет');
  });

  it('given the section closed, when rendered, then neither the fields nor the preview are in the page', () => {
    render(
      <LocalizationProvider>
        <Harness />
      </LocalizationProvider>,
    );

    expect(screen.queryByLabelText('Заголовок для поиска')).toBeNull();
    expect(screen.queryByTestId('seo-snippet')).toBeNull();
  });
});
