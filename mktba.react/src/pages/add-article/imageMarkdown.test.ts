import { describe, expect, it } from 'vitest';
import { altFromFileName, imageMarkdown, pastedImageFile } from './imageMarkdown';

const transfer = (types: string[], files: File[]) => ({ types, files }) as unknown as DataTransfer;

describe('imageMarkdown', () => {
  it('given a description and an upload address, when built, then it is the plain image Markdown', () => {
    expect(imageMarkdown('Мечеть', '/files/abc.webp')).toBe('![Мечеть](/files/abc.webp)');
  });

  it('given brackets, backslashes and line breaks in the description, when built, then they cannot end the image', () => {
    expect(imageMarkdown(' Схема [1]\n\\ до  и после ', 'https://x.test/a.webp')).toBe('![Схема \\[1\\] \\\\ до и после](https://x.test/a.webp)');
  });

  it('given an address with a space or parentheses, when built, then it goes in angle brackets', () => {
    expect(imageMarkdown('', 'https://x.test/a (1).webp')).toBe('![](<https://x.test/a (1).webp>)');
  });
});

describe('altFromFileName', () => {
  it('given a file name, when turned into a description, then the extension and separators are gone', () => {
    expect(altFromFileName('masjid_al-haram.photo.JPG')).toBe('masjid al haram.photo');
  });
});

describe('pastedImageFile', () => {
  const image = new File(['x'], 'shot.png', { type: 'image/png' });

  it('given a paste of an image file alone, when read, then the image is taken', () => {
    expect(pastedImageFile(transfer(['Files'], [image]))).toBe(image);
  });

  it('given a paste carrying text beside the picture (Word), when read, then it stays text', () => {
    expect(pastedImageFile(transfer(['text/plain', 'text/html', 'Files'], [image]))).toBeNull();
  });

  it('given a paste of a file that is not an image, when read, then nothing is taken', () => {
    expect(pastedImageFile(transfer(['Files'], [new File(['x'], 'a.pdf', { type: 'application/pdf' })]))).toBeNull();
  });
});
