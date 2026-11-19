import type { SchoolDto } from '../../shared/types/ApiTypes';

/** Slugs that own a colour set in theme.css. Custom schools fall back to neutral. */
const PALETTE_SLUGS = ['hanafi', 'maliki', 'shafii', 'hanbali'] as const;

export type SchoolPaletteKey = (typeof PALETTE_SLUGS)[number] | 'neutral';

export type SchoolPalette = {
  bg: string;
  border: string;
  accent: string;
  accentSoft: string;
};

const hasPalette = (slug: string): slug is (typeof PALETTE_SLUGS)[number] =>
  (PALETTE_SLUGS as readonly string[]).includes(slug);

/**
 * A block is tinted by a single school only. Opinions with no school, with an
 * article-scoped custom school, or shared by several schools at once all read
 * as neutral — no single mazhab owns them.
 */
export const resolvePaletteKey = (schools: SchoolDto[]): SchoolPaletteKey => {
  if (schools.length !== 1) {
    return 'neutral';
  }

  const [school] = schools;
  return school.isSystem && hasPalette(school.slug) ? school.slug : 'neutral';
};

export const getSchoolPalette = (key: SchoolPaletteKey): SchoolPalette => ({
  bg: `var(--color-mazhab-${key}-bg)`,
  border: `var(--color-mazhab-${key}-border)`,
  accent: `var(--color-mazhab-${key}-accent)`,
  accentSoft: `var(--color-mazhab-${key}-accent-soft)`,
});

/** Palette for a single school, used by the selector tiles. */
export const getPaletteForSchool = (school: SchoolDto): SchoolPalette =>
  getSchoolPalette(resolvePaletteKey([school]));
