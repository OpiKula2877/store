// Browser-side GitHub API client. Anonymous requests are limited to 60 per hour
// per IP, so responses are kept in localStorage: within TTL they are served
// without a request, after that they are revalidated with If-None-Match
// (a 304 doesn't count against the limit). When GitHub can't be reached or the
// limit is hit, the last saved copy is returned with `stale: true`.

const API = 'https://api.github.com';
const TTL = 10 * 60 * 1000;
const PREFIX = 'gh1:';

export interface Repo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string;
  updated_at: string;
  default_branch: string;
  license: { spdx_id: string; name: string } | null;
}

export interface Asset {
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  updated_at: string;
}

export interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  zipball_url: string;
  tarball_url: string;
  assets: Asset[];
}

export interface Readme {
  path: string;
  content: string;
  encoding: string;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    public resetAt?: Date,
  ) {
    super(`GitHub API ${status}`);
  }
  get isRateLimit() {
    return this.resetAt !== undefined;
  }
}

interface Entry {
  t: number;
  etag?: string;
  data: unknown;
}

function load(key: string): Entry | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function save(key: string, entry: Entry) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the site still works, just without caching.
  }
}

export interface Result<T> {
  data: T;
  stale: boolean;
}

const inflight = new Map<string, Promise<Result<unknown>>>();

export function gh<T>(path: string): Promise<Result<T>> {
  let p = inflight.get(path);
  if (!p) {
    p = request(path).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p as Promise<Result<T>>;
}

async function request(path: string): Promise<Result<unknown>> {
  const key = PREFIX + path;
  const cached = load(key);
  if (cached && Date.now() - cached.t < TTL) return { data: cached.data, stale: false };

  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  let res: Response;
  try {
    res = await fetch(API + path, { headers, cache: 'no-store' });
  } catch (err) {
    if (cached) return { data: cached.data, stale: true };
    throw new GitHubError(0);
  }

  if (res.status === 304 && cached) {
    save(key, { ...cached, t: Date.now() });
    return { data: cached.data, stale: false };
  }
  if (res.ok) {
    const data = await res.json();
    save(key, { t: Date.now(), etag: res.headers.get('ETag') ?? undefined, data });
    return { data, stale: false };
  }
  if (cached) return { data: cached.data, stale: true };

  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if ((res.status === 403 || res.status === 429) && remaining === '0' && reset) {
    throw new GitHubError(res.status, new Date(Number(reset) * 1000));
  }
  throw new GitHubError(res.status);
}

export const getOwnerRepos = (owner: string) =>
  gh<Repo[]>(`/users/${owner}/repos?per_page=100&sort=pushed`);
export const getRepo = (owner: string, repo: string) => gh<Repo>(`/repos/${owner}/${repo}`);
export const getReleases = (owner: string, repo: string) =>
  gh<Release[]>(`/repos/${owner}/${repo}/releases?per_page=50`);
export const getReadme = (owner: string, repo: string) =>
  gh<Readme>(`/repos/${owner}/${repo}/readme`);

export function decodeBase64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Published releases, newest first. */
export function published(releases: Release[]) {
  return releases
    .filter((r) => !r.draft)
    .sort((a, b) => Date.parse(b.published_at ?? '0') - Date.parse(a.published_at ?? '0'));
}

/** The newest stable release, or the newest pre-release if there is no stable one. */
export function latestRelease(releases: Release[]) {
  const list = published(releases);
  return list.find((r) => !r.prerelease) ?? list[0];
}
