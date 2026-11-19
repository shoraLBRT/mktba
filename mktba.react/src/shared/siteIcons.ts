/**
 * The site's icons and web app manifest (O-13, #62), served from `public/`. The raster files are
 * made from `favicon.svg` by `scripts/gen-icons.mjs`.
 */

/** Browser-tab icon for browsers without SVG favicons: 16, 32 and 48 px in one file. */
export const FAVICON_ICO_PATH = '/favicon.ico';
/** The scalable browser-tab icon. */
export const FAVICON_SVG_PATH = '/favicon.svg';
/** Home-screen icon on iOS (180×180, full bleed). */
export const APPLE_TOUCH_ICON_PATH = '/apple-touch-icon.png';
/** The largest square icon (512×512); also the site's logo in structured data. */
export const LOGO_ICON_PATH = '/icon-512.png';
/** The web app manifest. */
export const WEB_MANIFEST_PATH = '/site.webmanifest';
/**
 * Browser UI colour: `--color-brand-forest` in `styles/theme.css`, also `theme_color` in the
 * manifest. The app has no dark theme, so there is one value.
 */
export const THEME_COLOR = '#2d6a4f';
