import { describe, expect, it } from 'vitest';
import { pickActiveSection } from './useActiveSection';

describe('pickActiveSection', () => {
  it('given no section has reached the top yet, when picked, then the first one is current', () => {
    expect(pickActiveSection([{ id: 'a', top: 300 }, { id: 'b', top: 900 }], false)).toBe('a');
  });

  it('given several sections above the activation line, when picked, then the last of them is current', () => {
    const sections = [{ id: 'a', top: -900 }, { id: 'b', top: 80 }, { id: 'c', top: 500 }];

    expect(pickActiveSection(sections, false)).toBe('b');
  });

  it('given the end of the page, when picked, then the last section is current although it never reached the line', () => {
    const sections = [{ id: 'a', top: -900 }, { id: 'b', top: 300 }, { id: 'c', top: 500 }];

    expect(pickActiveSection(sections, true)).toBe('c');
  });

  it('given the end of the page and a section the reader jumped to, when picked, then that section stays current', () => {
    const sections = [{ id: 'a', top: -900 }, { id: 'b', top: 300 }, { id: 'c', top: 500 }];

    expect(pickActiveSection(sections, true, 'b')).toBe('b');
    expect(pickActiveSection(sections, true, 'a')).toBe('c');
  });

  it('given no sections, when picked, then nothing is current', () => {
    expect(pickActiveSection([], false)).toBeNull();
  });
});
