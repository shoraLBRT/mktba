import { describe, expect, it } from 'vitest';
import { cleanPastedHtml } from './pasteCleanup';

describe('cleanPastedHtml', () => {
  it('given HTML from Word, when cleaned, then its comments, Office elements and list glyphs are gone and the text stays', () => {
    const html = [
      '<html><head><style>p.MsoNormal{margin:0}</style></head><body>',
      '<!--StartFragment-->',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><!--[if !supportLists]--><span style="font-family:Symbol;mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span><!--[endif]--><b>Намаз</b> путника<o:p></o:p></p>',
      '<!--EndFragment-->',
      '</body></html>',
    ].join('');

    expect(cleanPastedHtml(html)).toBe('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><b>Намаз</b> путника</p>');
  });

  it('given a web page fragment, when cleaned, then scripts and images are dropped and links kept', () => {
    const html = '<p>См. <a href="https://example.com">сайт</a><img src="x.png"><script>alert(1)</script></p>';

    expect(cleanPastedHtml(html)).toBe('<p>См. <a href="https://example.com">сайт</a></p>');
  });
});
