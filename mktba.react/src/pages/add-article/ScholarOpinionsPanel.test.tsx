import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { ScholarOpinionsPanel } from './ScholarOpinionsPanel';

const own: SchoolDto = {
  id: 5, slug: 'scholar-a', name: 'Ибн Таймия', shortName: 'ИТ', isSystem: false, articleScopeId: 10,
  scholarName: 'Ибн Таймия', scholarYears: '661–728 гг. х.', description: null, scholarArticleId: null,
};
const shared: SchoolDto = { id: 6, slug: 'scholar-b', name: 'Аль-Албани', shortName: 'Алб', isSystem: false, articleScopeId: 3 };
const inDirectory: SchoolDto = { id: 7, slug: 'scholar-c', name: 'Ибн Хазм', shortName: 'ИХ', isSystem: false, articleScopeId: null, scholarName: 'Ибн Хазм' };

const renderPanel = (overrides: Partial<ComponentProps<typeof ScholarOpinionsPanel>> = {}) => {
  const props = {
    schools: [own, shared],
    directory: [inDirectory],
    articleOptions: [{ id: 42, title: 'Ибн Таймия', path: 'Учёные / Ибн Таймия' }],
    isLocked: false,
    canManage: (school: SchoolDto) => school.articleScopeId === 10,
    onPick: vi.fn(),
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <LocalizationProvider>
      <ScholarOpinionsPanel {...props} />
    </LocalizationProvider>,
  );
  return props;
};

describe('ScholarOpinionsPanel', () => {
  it('given the article scholar opinions, when rendered, then each shows its scholar and only the manageable ones can be changed', () => {
    renderPanel();

    expect(screen.getByText('Ибн Таймия, 661–728 гг. х.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Изменить мнение учёного: Ибн Таймия' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Изменить мнение учёного: Аль-Албани' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить мнение учёного: Аль-Албани' })).toBeNull();
  });

  it('given a directory entry, when picked, then the article gets it', () => {
    const props = renderPanel();

    fireEvent.change(screen.getByRole('combobox', { name: 'Взять из каталога…' }), { target: { value: '7' } });

    expect(props.onPick).toHaveBeenCalledWith(7);
  });

  it('given the new-entry form, when filled and submitted, then every field is sent', () => {
    const props = renderPanel({ schools: [], directory: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: ' Ибн Таймия ' } });
    fireEvent.change(screen.getByLabelText('Сокращение для вкладки'), { target: { value: 'ИТ' } });
    fireEvent.change(screen.getByLabelText('Учёный'), { target: { value: 'Ибн Таймия' } });
    fireEvent.change(screen.getByLabelText('Годы жизни, например 661–728 гг. х.'), { target: { value: '661–728 гг. х.' } });
    fireEvent.change(screen.getByLabelText('Кратко об учёном или позиции'), { target: { value: 'Ханбалит.' } });
    fireEvent.change(screen.getByLabelText('Статья об учёном'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(props.onAdd).toHaveBeenCalledWith({
      name: 'Ибн Таймия',
      shortName: 'ИТ',
      scholarName: 'Ибн Таймия',
      scholarYears: '661–728 гг. х.',
      description: 'Ханбалит.',
      scholarArticleId: 42,
    });
  });

  it('given an own entry, when changed, then the form starts from it and saves under its id', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Изменить мнение учёного: Ибн Таймия' }));
    fireEvent.change(screen.getByLabelText('Кратко об учёном или позиции'), { target: { value: 'Новое описание' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(props.onUpdate).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Ибн Таймия', description: 'Новое описание' }));
  });
});
