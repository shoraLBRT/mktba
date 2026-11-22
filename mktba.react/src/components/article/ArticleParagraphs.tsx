import { VersionedParagraphBlock } from './VersionedParagraphBlock';
import MarkdownContent from '../MarkdownContent';
import { useLocale } from '../../localization/hooks';
import type { ArticleOutline, RenderedParagraph } from './useArticleParagraphs';

type ArticleParagraphListProps = {
  paragraphs: RenderedParagraph[];
  /** `useArticleOutline` of the same paragraphs. */
  outline: ArticleOutline;
  onSelect: (paragraphId: number, index: number, total: number) => void;
};

/** The article's text: plain paragraphs, blocks of opinions with their tabs, or the stub's notice. */
export const ArticleParagraphList = ({ paragraphs, outline, onSelect }: ArticleParagraphListProps) => {
  const locale = useLocale();

  if (paragraphs.length === 0) {
    return (
      <div className="flow-root rounded-3xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-8 py-10 text-center text-[var(--color-ink-muted)] shadow-sm">
        {locale.articlePage.noContent}
      </div>
    );
  }

  return paragraphs.map((paragraph, index) => {
    const { anchorId, headingAnchors, startsWithHeading } = outline[index];
    // A paragraph that opens with a heading is linked through the heading's own anchor.
    const paragraphLink = startsWithHeading ? null : (
      <a
        href={`#${anchorId}`}
        aria-label={locale.articlePage.paragraphLink.replace('{number}', String(index + 1))}
        className={`absolute -left-6 ${paragraph.hasAlternatives ? 'top-4' : 'top-1'} hidden h-6 w-6 items-center justify-center rounded text-[13px] text-[var(--color-ink-muted)] no-underline opacity-0 transition-opacity hover:text-[var(--color-brand-forest)] focus-visible:opacity-100 group-hover/paragraph:opacity-100 sm:flex`}
      >
        <span aria-hidden="true">¶</span>
      </a>
    );

    if (!paragraph.hasAlternatives) {
      return (
        <section key={paragraph.paragraphId} id={anchorId} className="group/paragraph relative scroll-mt-24 py-0.5">
          {paragraphLink}
          <div className="article-markdown text-[14.5px] leading-8 text-[var(--color-ink-default)]">
            <MarkdownContent content={paragraph.activeOpinion?.content ?? ''} headingAnchors={headingAnchors} />
          </div>
        </section>
      );
    }

    return (
      <div key={paragraph.paragraphId} id={anchorId} data-paragraph-id={paragraph.paragraphId} className="group/paragraph relative scroll-mt-24">
        {paragraphLink}
        <VersionedParagraphBlock
          activeIndex={paragraph.activeIndex}
          tabs={paragraph.tabs}
          note={paragraph.note}
          onSelect={(optionIndex) => onSelect(paragraph.paragraphId, optionIndex, paragraph.opinions.length)}
          panels={paragraph.opinions.map((opinion, opinionIndex) => (
            <div key={opinion.id} className="article-markdown">
              <MarkdownContent
                content={opinion.content}
                headingAnchors={opinionIndex === paragraph.activeIndex ? headingAnchors : undefined}
              />
            </div>
          ))}
        />
      </div>
    );
  });
};
