import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { loadLocaleChunk } from '../localization';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

// ProseMirror (the article editor's rich text) measures the selection to scroll it into view;
// jsdom has no layout, so ranges report no boxes.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// The admin's strings are a lazy dictionary chunk that the admin route loads before rendering;
// component tests render admin pages directly, so load it once up front.
await loadLocaleChunk('admin');
