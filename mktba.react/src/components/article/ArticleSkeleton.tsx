import { LoadingPlaceholder, SkeletonBar } from '../Skeleton';

const TEXT_LINE_WIDTHS = ['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-10/12', 'w-3/5'];

/**
 * The article column while the article loads after a client-side navigation (the server HTML
 * already holds the article): breadcrumbs, the title, the dates and a few lines of text, in the
 * column's own width so the page does not jump when the text arrives.
 */
export const ArticleSkeleton = () => (
  <div className="min-w-0 flex-1 bg-white">
    <LoadingPlaceholder className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
      <SkeletonBar className="mb-5 h-3 w-48" />
      <SkeletonBar className="mb-4 h-8 w-2/3" />
      <SkeletonBar className="mb-8 h-3 w-56" />
      <div className="space-y-3">
        {TEXT_LINE_WIDTHS.map((width, index) => (
          <SkeletonBar key={index} className={`h-4 ${width}`} />
        ))}
      </div>
    </LoadingPlaceholder>
  </div>
);
