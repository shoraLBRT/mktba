import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { uploadArticleImage } from '../../services/uploadService';
import { UPLOAD_MAX_BYTES } from '../../shared/upload';
import { ImageUploadDialog } from './ImageUploadDialog';

vi.mock('../../services/uploadService', () => ({ uploadArticleImage: vi.fn() }));

const upload = vi.mocked(uploadArticleImage);

const renderDialog = (file: File) => {
  const onInsert = vi.fn();
  const onClose = vi.fn();
  render(
    <LocalizationProvider>
      <ImageUploadDialog file={file} onInsert={onInsert} onClose={onClose} />
    </LocalizationProvider>,
  );
  return { onInsert, onClose };
};

const photo = () => new File(['x'], 'kaaba_photo.jpg', { type: 'image/jpeg' });

describe('ImageUploadDialog', () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it('given a picked image, when the upload finishes and the author inserts it, then the text gets the image Markdown with the description', async () => {
    upload.mockResolvedValue({ url: '/files/abc.webp', contentType: 'image/webp', width: 800, height: 600, sizeBytes: 1000 });
    const { onInsert } = renderDialog(photo());

    expect((screen.getByRole('textbox', { name: 'Описание картинки' }) as HTMLInputElement).value).toBe('kaaba photo');
    expect((screen.getByRole('button', { name: 'Вставить' }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText('Загружено, 800 × 600 px');

    fireEvent.change(screen.getByRole('textbox', { name: 'Описание картинки' }), { target: { value: 'Кааба' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }));

    expect(onInsert).toHaveBeenCalledWith('![Кааба](/files/abc.webp)');
  });

  it('given the server refuses the file, when the upload fails, then its message is shown and nothing can be inserted', async () => {
    upload.mockRejectedValue(new Error('Не удалось прочитать картинку: файл повреждён или это не изображение.'));
    renderDialog(photo());

    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось прочитать картинку');
    expect((screen.getByRole('button', { name: 'Вставить' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('given a file over the limit, when the dialog opens, then it is not sent and the limit is named', () => {
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: UPLOAD_MAX_BYTES + 1 });
    renderDialog(big);

    expect(screen.getByRole('alert').textContent).toContain('Файл больше 10 МБ.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('given an upload under way, when Escape is pressed, then the dialog asks to close', () => {
    upload.mockReturnValue(new Promise(() => undefined));
    const { onClose } = renderDialog(photo());

    expect(screen.getByRole('status').textContent).toContain('Загрузка… 0 %');
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
