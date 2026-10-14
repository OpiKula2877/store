import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface RepoContext {
  owner: string;
  repo: string;
  branch: string;
  /** Directory of the markdown file inside the repo, '' for the root. */
  dir?: string;
}

const ABSOLUTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

function resolve(path: string, ctx: RepoContext, kind: 'raw' | 'blob') {
  if (ABSOLUTE.test(path)) {
    // github.com/<o>/<r>/blob/... images don't load as <img>, raw.githubusercontent.com does.
    if (kind === 'raw') {
      const m = path.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
      if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    }
    return path;
  }
  const base = path.startsWith('/') ? '' : ctx.dir ? `${ctx.dir.replace(/\/$/, '')}/` : '';
  const clean = (base + path.replace(/^\.?\//, '')).replace(/^\//, '');
  return kind === 'raw'
    ? `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${ctx.branch}/${clean}`
    : `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.branch}/${clean}`;
}

function isBadge(src: string, img: HTMLImageElement) {
  return (
    /shields\.io|badgen\.net|badge\.fury|travis-ci|codecov\.io|\/badge(\.svg)?|\/workflows\/.+\.svg|forthebadge|img\.buymeacoffee/i.test(src) ||
    (img.closest('a') !== null && /\.svg(\?|$)/i.test(src) && Number(img.getAttribute('height') ?? 0) <= 40)
  );
}

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });
}

/** Renders GitHub markdown to safe HTML and lists the non-badge images it contains. */
export function renderMarkdown(md: string, ctx: RepoContext) {
  ensureHooks();
  const raw = marked.parse(md, { gfm: true, async: false }) as string;
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;

  const images: string[] = [];
  root.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = resolve(img.getAttribute('src')!, ctx, 'raw');
    img.setAttribute('src', src);
    img.removeAttribute('srcset');
    if (isBadge(src, img)) img.classList.add('badge');
    else if (!images.includes(src)) images.push(src);
  });
  root.querySelectorAll('source[srcset]').forEach((s) => {
    s.setAttribute('srcset', resolve(s.getAttribute('srcset')!.split(/\s/)[0], ctx, 'raw'));
  });
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    a.setAttribute('href', resolve(a.getAttribute('href')!, ctx, 'blob'));
  });

  const html = DOMPurify.sanitize(root.innerHTML, { ADD_ATTR: ['target'] });
  return { html, images };
}
