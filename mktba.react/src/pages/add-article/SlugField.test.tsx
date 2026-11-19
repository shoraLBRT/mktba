import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { SlugField } from './SlugField';

const noop = () => {};

const renderField = (locale?: string) =>
  render(
    <LocalizationProvider>
      <SlugField value="namaz" onChange={noop} onFillFromTitle={noop} locale={locale} />
    </LocalizationProvider>,
  );

describe('SlugField', () => {
  it('shows Russian as the read-only article language when no locale is given', () => {
    renderField();

    expect(screen.getByTestId('article-locale').textContent).toBe('Язык статьи: ru');
  });

  it('shows the locale of a loaded article', () => {
    renderField('en');

    expect(screen.getByTestId('article-locale').textContent).toBe('Язык статьи: en');
  });
});
