import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { emptySeoDraft } from '../../shared/seo';
import { SeoFields } from './SeoFields';

const Harness = () => {
  const [seo, setSeo] = useState(emptySeoDraft);
  return <SeoFields value={seo} onChange={setSeo} />;
};

const renderFields = () =>
  render(
    <LocalizationProvider>
      <Harness />
    </LocalizationProvider>,
  );

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
});
