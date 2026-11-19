import { useLocale } from '../localization/hooks';

/** The site's title for a page without one of its own; React 19 hoists it into `<head>`. */
export const DefaultDocumentTitle = () => <title>{useLocale().brand.documentTitle}</title>;
