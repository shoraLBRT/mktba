import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { MazhabContext } from '../../context/mazhabContext';
import { LocalizationProvider } from '../../localization/provider';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { ArticleDraftPreview } from './ArticleDraftPreview';
import { createEmptyArticleDraft, type ArticleDraft } from './articleDraft';

const schools: SchoolDto[] = [
  { id: 1, slug: 'hanafi', name: 'Ханафитский мазхаб', shortName: 'Ханафиты', isSystem: true },
  { id: 3, slug: 'shafii', name: 'Шафиитский мазхаб', shortName: 'Шафииты', isSystem: true },
];

const draft: ArticleDraft = {
  ...createEmptyArticleDraft(),
  title: 'Омовение',
  blocks: [
    { id: 'b1', kind: 'heading2', content: 'Порядок' },
    { id: 'b2', kind: 'paragraph', content: 'Общий текст для всех.' },
    {
      id: 'b3',
      kind: 'versioned',
      variants: [
        { localId: 'v1', content: 'Мнение ханафитов.', isDefault: true, schoolIds: [1] },
        { localId: 'v2', content: 'Мнение шафиитов.', isDefault: false, schoolIds: [3] },
      ],
    },
  ],
};

const renderPreview = (readerSchoolId: number | null = null) => {
  const setSelectedSchoolId = vi.fn();
  render(
    <LocalizationProvider>
      <MemoryRouter>
        <MazhabContext.Provider value={{ selectedSchoolId: readerSchoolId, setSelectedSchoolId }}>
          <ArticleDraftPreview draft={draft} article={null} schools={schools} navigationTree={[]} />
        </MazhabContext.Provider>
      </MemoryRouter>
    </LocalizationProvider>,
  );
  return { setSelectedSchoolId };
};

const frame = () => screen.getByTestId('article-preview-frame') as HTMLIFrameElement;
const frameBody = async () => {
  await waitFor(() => expect(frame().contentDocument?.body.textContent).toContain('Омовение'));
  return within(frame().contentDocument!.body);
};
const visibleOpinion = (body: ReturnType<typeof within>) =>
  body.getAllByRole('tabpanel').find((panel: HTMLElement) => !panel.hidden)?.textContent;

describe('ArticleDraftPreview', () => {
  it('Given an unsaved draft, When the preview opens, Then the reader components render it inside the frame', async () => {
    renderPreview();

    const body = await frameBody();
    expect(body.getByRole('heading', { level: 1, name: 'Омовение' })).toBeTruthy();
    expect(body.getByText('Общий текст для всех.')).toBeTruthy();
    expect(body.getAllByRole('tab')).toHaveLength(2);
    expect(visibleOpinion(body)).toContain('Мнение ханафитов.');
  });

  it('Given the reader reads as a Shafii, When the preview opens, Then it starts with the Shafii opinion', async () => {
    renderPreview(3);

    const body = await frameBody();
    expect(visibleOpinion(body)).toContain('Мнение шафиитов.');
    expect((screen.getByLabelText('Мазхаб') as HTMLSelectElement).value).toBe('3');
  });

  it('Given the preview, When another mazhab is picked in it, Then the opinion follows and the reader\'s saved mazhab is not changed', async () => {
    const { setSelectedSchoolId } = renderPreview(1);
    const body = await frameBody();

    fireEvent.change(screen.getByLabelText('Мазхаб'), { target: { value: '3' } });

    await waitFor(() => expect(visibleOpinion(body)).toContain('Мнение шафиитов.'));
    expect(setSelectedSchoolId).not.toHaveBeenCalled();
  });

  it('Given the preview, When a screen width is picked, Then the frame takes that width', () => {
    renderPreview();
    expect(frame().style.width).toBe('1280px');

    fireEvent.click(screen.getByRole('button', { name: 'Телефон · 375 px' }));

    expect(frame().style.width).toBe('375px');
    expect(screen.getByRole('button', { name: 'Телефон · 375 px' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Given a link inside the preview, When it is clicked, Then the click does not navigate', async () => {
    renderPreview();
    const body = await frameBody();
    const link = body.getByRole('link', { name: /Сообщить об ошибке/ });

    const notPrevented = fireEvent.click(link);

    expect(notPrevented).toBe(false);
  });
});
