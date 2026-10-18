import rawApps from './data/apps.json';
import { PLATFORMS, type Platform } from './lib/platform';

export const SITE = {
  name: 'OpiKula Store',
  url: 'https://store.opikula.dev',
  author: 'OpiKula',
  github: 'https://github.com/OpiKula2877',
};

export type Lang = 'en' | 'cs';
export const LANGS: Lang[] = ['en', 'cs'];

interface AppEntry {
  /** GitHub repository URL, e.g. https://github.com/OpiKula2877/Financer */
  repo: string;
  /** Display name. Defaults to the repo name with dashes turned into spaces. */
  name?: string;
  /** Used for meta tags and as a fallback when the repo has no description. */
  description?: string;
  /** Absolute URL of an icon image. Defaults to a generated letter icon. */
  icon?: string;
  featured?: boolean;
  /** Show the app in the icon shelf at the top of the home page. Default true. */
  shelf?: boolean;
  /**
   * Systems the app runs on, when they aren't all covered by release files,
   * e.g. Linux and macOS builds that are made from the source code.
   */
  platforms?: Platform[];
}

export interface App {
  slug: string;
  owner: string;
  repo: string;
  url: string;
  name: string;
  description?: string;
  icon?: string;
  featured: boolean;
  shelf: boolean;
  /** Declared in apps.json, see AppEntry.platforms. */
  platforms: Platform[];
  initials: string;
  hue: number;
  lightness: number;
}

function parseRepoUrl(url: string) {
  const m = url.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  if (!m) throw new Error(`apps.json: "${url}" is not a GitHub repository URL`);
  return { owner: m[1], repo: m[2] };
}

export function initialsOf(name: string) {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Golden-angle steps keep neighbouring icons far apart on the colour wheel. */
function hueAt(index: number) {
  return Math.round((222 + index * 137.508) % 360);
}

/** Yellows and greens need a darker shade to keep white initials readable. */
function lightnessFor(hue: number) {
  return hue >= 40 && hue <= 190 ? 38 : 52;
}

export const apps: App[] = (rawApps as AppEntry[]).map((entry, index) => {
  const { owner, repo } = parseRepoUrl(entry.repo);
  const name = entry.name ?? repo.replace(/[-_]+/g, ' ');
  for (const p of entry.platforms ?? []) {
    if (!PLATFORMS.includes(p)) throw new Error(`apps.json: unknown platform "${p}" for ${entry.repo}`);
  }
  return {
    slug: repo.toLowerCase(),
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    name,
    description: entry.description,
    icon: entry.icon,
    featured: entry.featured ?? false,
    shelf: entry.shelf ?? true,
    platforms: PLATFORMS.filter((p) => entry.platforms?.includes(p)),
    initials: initialsOf(name),
    hue: hueAt(index),
    lightness: lightnessFor(hueAt(index)),
  };
});

const slugs = new Set<string>();
for (const app of apps) {
  if (slugs.has(app.slug)) throw new Error(`apps.json: duplicate app "${app.slug}"`);
  slugs.add(app.slug);
}

export function localePath(lang: Lang, path = '/') {
  return lang === 'en' ? path : `/cs${path}`;
}
