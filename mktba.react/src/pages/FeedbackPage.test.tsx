import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { MazhabContext } from '../context/mazhabContext';
import { LocalizationProvider } from '../localization/provider';
import { sendFeedback } from '../services/feedbackService';
import { ApiError, translateApiError } from '../shared/api-client/apiError';
import FeedbackPage from './FeedbackPage';

vi.mock('../services/feedbackService', () => ({ sendFeedback: vi.fn() }));
const sendFeedbackMock = vi.mocked(sendFeedback);

const schools = [
  { id: 1, slug: 'hanafi', name: 'Ханафитский', shortName: 'Ханафи', isSystem: true },
  { id: 3, slug: 'shafii', name: 'Шафиитский', shortName: 'Шафии', isSystem: true },
];
const tree = [
  { id: 12, title: 'Тахарат', slug: 'taharat', status: 'Published', hasContent: true, canEdit: false, children: [] },
];

const renderPage = (url = '/feedback', selectedSchoolId: number | null = null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, 'ru'], schools);
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE, 'ru'], tree);

  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[url]}>
          <MazhabContext.Provider value={{ selectedSchoolId, setSelectedSchoolId: () => {} }}>
            <FeedbackPage />
          </MazhabContext.Provider>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

const textField = () => screen.getByLabelText('Сообщение') as HTMLTextAreaElement;
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

describe('FeedbackPage', () => {
  beforeEach(() => {
    sendFeedbackMock.mockReset();
  });

  it('given a link from an article, when opened, then the kind is chosen and the page, the article and the mazhab are shown', () => {
    renderPage('/feedback?type=article-error&article=12&from=%2Ftaharat', 3);

    expect((screen.getByRole('radio', { name: 'Ошибка в статье' }) as HTMLInputElement).checked).toBe(true);
    const attached = screen.getByRole('region', { name: 'Что будет отправлено вместе с сообщением' });
    expect(within(attached).getByRole('link').getAttribute('href')).toBe('/taharat');
    expect(attached.textContent).toContain('Статья: Тахарат');
    expect(attached.textContent).toContain('Выбранный мазхаб: Шафиитский');
    expect(attached.textContent).toContain('открытый список задач проекта на GitHub');
    expect(attached.textContent).toContain('Контакт туда не попадает');
  });

  it('given a filled form, when sent, then the request carries the attached values and the number is confirmed', async () => {
    sendFeedbackMock.mockResolvedValue({ id: 41 });
    renderPage('/feedback?type=article-error&article=12&from=%2Ftaharat', 3);

    fireEvent.change(textField(), { target: { value: 'Опечатка во втором абзаце' } });
    fireEvent.change(screen.getByLabelText(/Контакт для ответа/), { target: { value: ' reader@example.com ' } });
    submit();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Сообщение № 41 отправлено' });
    expect(document.activeElement).toBe(heading);
    expect(sendFeedbackMock.mock.calls[0][0]).toEqual({
      type: 'ArticleError',
      text: 'Опечатка во втором абзаце',
      contact: 'reader@example.com',
      pageUrl: '/taharat',
      articleId: 12,
      mazhab: 'shafii',
      website: '',
    });
    expect(screen.getByRole('link', { name: 'Вернуться на страницу' }).getAttribute('href')).toBe('/taharat');
  });

  it('given the bare form, when sent, then nothing is attached and an unchosen mazhab is said so', async () => {
    sendFeedbackMock.mockResolvedValue({ id: 5 });
    renderPage();

    expect(screen.getByTestId('feedback-mazhab').textContent).toBe('не выбран');
    fireEvent.click(screen.getByRole('radio', { name: 'Идея' }));
    fireEvent.change(textField(), { target: { value: 'Добавьте тёмную тему' } });
    submit();

    await screen.findByRole('heading', { name: 'Сообщение № 5 отправлено' });
    expect(sendFeedbackMock.mock.calls[0][0]).toEqual({
      type: 'Idea',
      text: 'Добавьте тёмную тему',
      contact: null,
      pageUrl: null,
      articleId: null,
      mazhab: null,
      website: '',
    });
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  });

  it('given no kind and no text, when sent, then nothing is requested, both fields say why and the first one is focused', () => {
    renderPage();

    submit();

    expect(sendFeedbackMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Ошибка в статье' }));
    expect(screen.getByRole('group', { name: 'О чём сообщение' }).getAttribute('aria-describedby')).toBe('feedback-type-error');
    expect(document.getElementById('feedback-type-error')?.textContent).toBe(translateApiError('feedback_type_invalid'));
    expect(textField().getAttribute('aria-invalid')).toBe('true');
    expect(textField().getAttribute('aria-describedby')).toContain('feedback-text-error');
    expect(document.getElementById('feedback-text-error')?.textContent).toBe('Напишите текст сообщения.');
  });

  it('given a text over the limit, when typed and sent, then the counter shows it and the form is not sent', () => {
    renderPage('/feedback?type=idea');

    fireEvent.change(textField(), { target: { value: 'я'.repeat(4001) } });
    expect(document.getElementById('feedback-text-counter')?.textContent).toBe('4001 из 4000');
    submit();

    expect(sendFeedbackMock).not.toHaveBeenCalled();
    expect(document.getElementById('feedback-text-error')?.textContent).toBe('Сообщение — не длиннее 4000 символов.');
    expect(document.activeElement).toBe(textField());
  });

  it('given the per-visitor limit, when the server answers 429, then the translated error is announced and the typed text stays', async () => {
    sendFeedbackMock.mockRejectedValue(new ApiError(translateApiError('too_many_requests'), 429, 'too_many_requests'));
    renderPage('/feedback?type=site-problem');

    fireEvent.change(textField(), { target: { value: 'Не открывается поиск' } });
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Слишком много запросов. Попробуйте позже.');
    expect(alert.textContent).toContain('Текст сохранён в форме');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(textField().value).toBe('Не открывается поиск');
    expect((screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('given the site-wide limit, when the server answers 429, then its own translation is shown', async () => {
    sendFeedbackMock.mockRejectedValue(new ApiError(translateApiError('feedback_limit_reached'), 429, 'feedback_limit_reached'));
    renderPage('/feedback?type=idea');

    fireEvent.change(textField(), { target: { value: 'Идея' } });
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Сейчас пришло слишком много сообщений');
  });

  it('given a validation error from the server, when it names a field, then the error sits at that field', async () => {
    sendFeedbackMock.mockRejectedValue(
      new ApiError(translateApiError('feedback_contact_too_long', { maxLength: 200 }), 400, 'feedback_contact_too_long'),
    );
    renderPage('/feedback?type=idea');

    fireEvent.change(textField(), { target: { value: 'Идея' } });
    submit();

    const contact = screen.getByLabelText(/Контакт для ответа/);
    await waitFor(() => expect(contact.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById('feedback-contact-error')?.textContent).toBe('Контакт — не длиннее 200 символов.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.activeElement).toBe(contact);
  });

  it('given the trap field, when rendered, then people cannot reach it and its value is sent as it is', async () => {
    sendFeedbackMock.mockResolvedValue({ id: 9 });
    renderPage('/feedback?type=idea');

    const trap = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.getAttribute('autocomplete')).toBe('off');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap.hidden).toBe(false);
    expect(trap.type).toBe('text');

    trap.value = 'https://spam.example';
    fireEvent.change(textField(), { target: { value: 'Идея' } });
    submit();

    await screen.findByRole('heading', { name: 'Сообщение № 9 отправлено' });
    expect(sendFeedbackMock.mock.calls[0][0].website).toBe('https://spam.example');
  });

  it('given a sent message, when the reader writes another, then the form is back with an empty text', async () => {
    sendFeedbackMock.mockResolvedValue({ id: 2 });
    renderPage('/feedback?type=idea');

    fireEvent.change(textField(), { target: { value: 'Идея' } });
    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Написать ещё одно' }));

    expect(textField().value).toBe('');
    expect((screen.getByRole('radio', { name: 'Идея' }) as HTMLInputElement).checked).toBe(true);
  });
});
