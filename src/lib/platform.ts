import type { Asset } from './github';

export type Platform = 'windows' | 'android' | 'macos' | 'linux';
export const PLATFORMS: Platform[] = ['android', 'windows', 'macos', 'linux'];

const BY_EXTENSION: [RegExp, Platform][] = [
  [/\.(exe|msi|msix|msixbundle|appx|appxbundle)$/i, 'windows'],
  [/\.(apk|aab)$/i, 'android'],
  [/\.(dmg|pkg)$/i, 'macos'],
  [/\.(appimage|deb|rpm|flatpak|snap)$/i, 'linux'],
];

const BY_NAME: [RegExp, Platform][] = [
  [/(^|[^a-z])(win|windows|win32|win64)([^a-z]|$)/i, 'windows'],
  [/(^|[^a-z])(android)([^a-z]|$)/i, 'android'],
  [/(^|[^a-z])(mac|macos|osx|darwin)([^a-z]|$)/i, 'macos'],
  [/(^|[^a-z])(linux)([^a-z]|$)/i, 'linux'],
];

/** Signatures, checksums and updater manifests aren't something people download by hand. */
export function isAuxiliary(name: string) {
  return /\.(sig|asc|sha\d*|md5|blockmap|json|ya?ml|txt)$/i.test(name) || /checksums?|sha\d+sums/i.test(name);
}

export function assetPlatform(name: string): Platform | null {
  if (isAuxiliary(name)) return null;
  for (const [re, p] of BY_EXTENSION) if (re.test(name)) return p;
  if (/\.(zip|tar\.gz|tgz|7z)$/i.test(name)) {
    for (const [re, p] of BY_NAME) if (re.test(name)) return p;
  }
  return null;
}

export function platformsOf(assets: Asset[]) {
  const set = new Set<Platform>();
  for (const a of assets) {
    const p = assetPlatform(a.name);
    if (p) set.add(p);
  }
  return PLATFORMS.filter((p) => set.has(p));
}

export function detectPlatform(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const ua = `${nav.userAgentData?.platform ?? ''} ${navigator.userAgent}`;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return null;
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  if (/linux|x11|cros/i.test(ua)) return 'linux';
  return null;
}

function rank(name: string) {
  let score = 0;
  if (/setup|install/i.test(name)) score -= 2;
  if (/\.(exe|apk|dmg|appimage)$/i.test(name)) score -= 1;
  if (/arm64|aarch64/i.test(name) && !/arm/i.test(navigator.userAgent)) score += 1;
  return score;
}

/** Downloadable files for a platform, best first. */
export function assetsFor(assets: Asset[], platform: Platform) {
  return assets
    .filter((a) => assetPlatform(a.name) === platform)
    .sort((a, b) => rank(a.name) - rank(b.name));
}
