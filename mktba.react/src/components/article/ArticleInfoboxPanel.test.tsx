import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import type { ArticleInfoboxDto } from '../../shared/types/ApiTypes';
import { ArticleInfoboxPanel } from './ArticleInfoboxPanel';

const field = (order: number, label: string, value: string) => ({ id: order, order, key: `k${order}`, label, value });

const renderPanel = (infobox?: ArticleInfoboxDto) =>
  render(
    <LocalizationProvider>
      <ArticleInfoboxPanel infobox={infobox} />
    </LocalizationProvider>,
  );

describe('ArticleInfoboxPanel', () => {
  it('given an infobox, when rendered, then the facts are in the markup while the body is collapsed for phones', () => {
    renderPanel({ title: 'الصلاة', subtitle: 'Салят', fields: [field(1, 'Тип', 'Столп ислама')] });

    const body = screen.getByTestId('infobox-body');
    expect(body.textContent).toContain('Столп ислама');
    expect(body.className).toContain('max-sm:hidden');
    const toggle = screen.getByRole('button', { name: 'Показать сведения' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);
  });

  it('given a collapsed infobox, when the header is pressed twice, then the body opens and collapses again', () => {
    renderPanel({ title: 'Салят', fields: [field(1, 'Тип', 'Столп ислама')] });

    fireEvent.click(screen.getByRole('button', { name: 'Показать сведения' }));
    expect(screen.getByTestId('infobox-body').className).not.toContain('max-sm:hidden');
    const toggle = screen.getByRole('button', { name: 'Скрыть сведения' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(screen.getByTestId('infobox-body').className).toContain('max-sm:hidden');
  });

  it('given more than five fields, when "Подробнее" is pressed, then the remaining fields appear', () => {
    renderPanel({ fields: [1, 2, 3, 4, 5, 6].map((order) => field(order, `Поле ${order}`, `Значение ${order}`)) });

    expect(screen.queryByText('Значение 6')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    expect(screen.getByText('Значение 6')).toBeTruthy();
  });

  it('given fields out of order with a blank one, when rendered, then they are sorted and the blank one is dropped', () => {
    renderPanel({ fields: [field(2, 'Второе', 'б'), field(1, 'Первое', 'а'), field(3, 'Пустое', '   ')] });

    const body = screen.getByTestId('infobox-body');
    expect(body.textContent).toBe('ПервоеаВтороеб');
  });

  it('given no infobox or an empty one, when rendered, then nothing is shown', () => {
    expect(renderPanel(undefined).container.querySelector('aside')).toBeNull();
    expect(renderPanel({ title: ' ', fields: [] }).container.querySelector('aside')).toBeNull();
  });
});
