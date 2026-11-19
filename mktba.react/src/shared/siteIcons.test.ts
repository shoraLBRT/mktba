import { describe, expect, it } from 'vitest';
import manifestText from '../../public/site.webmanifest?raw';
import faviconSvg from '../../public/favicon.svg?raw';
import { APPLE_TOUCH_ICON_PATH, LOGO_ICON_PATH, THEME_COLOR } from './siteIcons';

// The served files themselves (sizes, content types) are checked end to end in e2e/ssr.spec.ts.

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };
const manifest = JSON.parse(manifestText) as {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};

describe('site icons and web app manifest', () => {
  it('given the manifest, when read, then it names the Russian site, starts at the root and claims no installable app mode', () => {
    expect(manifest).toMatchObject({ short_name: 'mktba', lang: 'ru', start_url: '/', display: 'browser' });
    expect(manifest.name).toContain('mktba');
  });

  it('given the theme colour, when comparing the manifest and the mark, then both use the brand colour on the page background', () => {
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.background_color).toBe('#fafaf8');
    expect(faviconSvg).toContain(`fill="${THEME_COLOR}"`);
  });

  it('given the manifest icons, when listed, then there are 192 and 512 px PNGs and exactly one maskable icon', () => {
    expect(manifest.icons.every((icon) => icon.type === 'image/png')).toBe(true);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1);
  });

  it('given the logo and touch icon, when compared with the manifest, then the logo is a listed square icon and the touch icon is separate', () => {
    expect(manifest.icons).toContainEqual({ src: LOGO_ICON_PATH, sizes: '512x512', type: 'image/png' });
    expect(manifest.icons.map((icon) => icon.src)).not.toContain(APPLE_TOUCH_ICON_PATH);
  });
});
