// Cloudflare Worker in front of the GitHub API for the store.
// - Caches each answer for TTL seconds, so GitHub gets one request per repo per TTL, not one per visitor.
// - Adds the optional GITHUB_TOKEN (5000 requests/h instead of 60 per IP).
// - Only read-only calls about OpiKula2877's repos are allowed, so it can't be used as an open proxy.

export interface Env {
  /** Read-only GitHub token, set with `npx wrangler secret put GITHUB_TOKEN`. Optional. */
  GITHUB_TOKEN?: string;
}

const OWNER = 'OpiKula2877';
/** Seconds before a cached answer is checked again with GitHub. */
const TTL = 300;
const ALLOWED_ORIGINS = ['https://store.opikula.dev', 'http://localhost:4321'];

const ALLOWED_PATHS = [
  new RegExp(`^/users/${OWNER}/repos$`),
  new RegExp(`^/repos/${OWNER}/[A-Za-z0-9._-]+$`),
  new RegExp(`^/repos/${OWNER}/[A-Za-z0-9._-]+/(releases|readme)$`),
];

const ALLOWED_PARAMS: Record<string, RegExp> = {
  per_page: /^\d{1,3}$/,
  sort: /^(pushed|updated|full_name|created)$/,
};

interface Stored {
  body: string;
  etag: string | null;
  /** When GitHub last confirmed this answer, in ms since epoch. */
  at: number;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'If-None-Match, Accept',
    'Access-Control-Expose-Headers': 'ETag, x-ratelimit-remaining, x-ratelimit-reset, x-store-cache',
    Vary: 'Origin',
  };
}

function respond(s: Stored, request: Request, cors: Record<string, string>, state: string): Response {
  const headers: Record<string, string> = {
    ...cors,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${TTL}`,
    'x-store-cache': state,
  };
  if (s.etag) headers.ETag = s.etag;
  if (s.etag && request.headers.get('If-None-Match') === s.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(s.body, { status: 200, headers });
}

async function readCache(cache: Cache, key: Request): Promise<Stored | null> {
  const hit = await cache.match(key);
  if (!hit) return null;
  return { body: await hit.text(), etag: hit.headers.get('ETag'), at: Number(hit.headers.get('x-cached-at')) };
}

function writeCache(cache: Cache, key: Request, s: Stored): Promise<void> {
  return cache.put(
    key,
    new Response(s.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(s.etag ? { ETag: s.etag } : {}),
        'x-cached-at': String(s.at),
      },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/gh/')) return new Response('Not found', { status: 404, headers: cors });
    const path = url.pathname.slice('/gh'.length);
    if (!ALLOWED_PATHS.some((re) => re.test(path))) return new Response('Not found', { status: 404, headers: cors });

    const target = new URL(`https://api.github.com${path}`);
    for (const [key, value] of url.searchParams) {
      if (!ALLOWED_PARAMS[key]?.test(value)) return new Response('Bad request', { status: 400, headers: cors });
      target.searchParams.set(key, value);
    }

    const cache = caches.default;
    const key = new Request(target.toString());
    const cached = await readCache(cache, key);

    if (cached && Date.now() - cached.at < TTL * 1000) return respond(cached, request, cors, 'HIT');

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'store-api',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    if (cached?.etag) headers['If-None-Match'] = cached.etag;

    let upstream: Response;
    try {
      upstream = await fetch(target, { headers });
    } catch {
      return cached ? respond(cached, request, cors, 'STALE') : new Response('GitHub unreachable', { status: 502, headers: cors });
    }

    if (upstream.status === 304 && cached) {
      const refreshed = { ...cached, at: Date.now() };
      ctx.waitUntil(writeCache(cache, key, refreshed));
      return respond(refreshed, request, cors, 'REVALIDATED');
    }

    if (!upstream.ok) {
      if (cached) return respond(cached, request, cors, 'STALE');
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': 'application/json; charset=utf-8',
          'x-ratelimit-remaining': upstream.headers.get('x-ratelimit-remaining') ?? '',
          'x-ratelimit-reset': upstream.headers.get('x-ratelimit-reset') ?? '',
        },
      });
    }

    const fresh: Stored = { body: await upstream.text(), etag: upstream.headers.get('ETag'), at: Date.now() };
    ctx.waitUntil(writeCache(cache, key, fresh));
    return respond(fresh, request, cors, 'MISS');
  },
};
