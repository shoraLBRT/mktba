/**
 * Cleans HTML pasted from Word or a web page before the editor reads it. The editor's schema
 * already keeps only what it knows (paragraphs, headings, lists, quotes, links, bold, italic…) and
 * drops styles, classes and unknown elements; this removes what it would otherwise turn into text:
 * Word's conditional comments, its XML islands and `<o:p>` filler, the bullet and number glyphs
 * Word draws for its list paragraphs (`mso-list: Ignore`), scripts and styles, and images (the
 * editor has no image upload, U-08 #73).
 */
export const cleanPastedHtml = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.body;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((comment) => comment.parentNode?.removeChild(comment));

  body.querySelectorAll('style, script, meta, link, title, xml, img, picture, svg, video, audio, iframe, object').forEach((element) => element.remove());
  body.querySelectorAll('*').forEach((element) => {
    if (element.tagName.includes(':')) {
      // `<o:p>`, `<w:…>`, `<v:…>`: Office's own elements hold nothing to keep.
      element.remove();
    } else if (/mso-list\s*:\s*ignore/i.test(element.getAttribute('style') ?? '')) {
      element.remove();
    }
  });

  return body.innerHTML;
};
