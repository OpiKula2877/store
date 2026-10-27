import { useT, type UiKey } from '../i18n/ui';
import {
  GitHubError,
  decodeBase64,
  getReadme,
  getReleases,
  getRepo,
  latestRelease,
  published,
  type Asset,
  type Release,
  type Repo,
} from '../lib/github';
import {
  PLATFORMS,
  assetPlatform,
  assetsFor,
  detectPlatform,
  isAuxiliary,
  mergePlatforms,
  platformsOf,
  type Platform,
} from '../lib/platform';
import { renderMarkdown, type RepoContext } from '../lib/markdown';
import { plainSummary } from '../lib/summary';
import { escapeHtml, formatBytes, formatDate, formatNumber, formatTime } from '../lib/format';

const lang = document.documentElement.lang === 'cs' ? 'cs' : 'en';
const t = useT(lang);
const pname = (p: Platform) => t(`platform.${p}` as UiKey);

const root = document.querySelector<HTMLElement>('[data-app]')!;
const owner = root.dataset.owner!;
const repoName = root.dataset.repo!;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

const userPlatform = detectPlatform();
// Platforms declared in apps.json that may have no release file (built from source).
const declared = (root.dataset.declared ?? '').split(' ').filter(Boolean) as Platform[];
let ctx: RepoContext = { owner, repo: repoName, branch: 'HEAD' };
let releases: Release[] = [];
let about = '';
let readmeText = '';

function setStat(name: string, value: string) {
  $(`[data-stat="${name}"]`).textContent = value;
}

function showNotice(err: unknown) {
  const el = $('[data-notice]');
  let msg = t('error.generic');
  if (err === 'stale') msg = t('error.stale');
  else if (err instanceof GitHubError && err.isRateLimit) msg = t('error.rateLimit', { time: formatTime(err.resetAt!, lang) });
  else if (err instanceof GitHubError && err.status === 404) msg = t('error.notFound');
  el.textContent = msg;
  el.hidden = false;
}

function fillRepo(repo: Repo) {
  ctx = { owner, repo: repoName, branch: repo.default_branch };
  about = repo.description ?? '';
  setStat('stars', formatNumber(repo.stargazers_count, lang));
  setStat('updated', formatDate(repo.pushed_at, lang));
  if (repo.license && repo.license.spdx_id !== 'NOASSERTION') {
    setStat('license', repo.license.spdx_id);
    $('[data-stat-wrap="license"]').hidden = false;
  }
  if (repo.homepage) {
    const site = $<HTMLAnchorElement>('[data-website]');
    site.href = repo.homepage;
    site.hidden = false;
  }
}

/** apps.json description, then the GitHub About text, then the start of the README. */
function renderDesc() {
  const text = root.dataset.description || about || readmeText;
  $('[data-field="desc"]').innerHTML = text
    ? escapeHtml(text)
    : `<span class="muted">${escapeHtml(t('app.noDescription'))}</span>`;
}

function downloadButton(asset: Asset, label: string, primary: boolean) {
  return `<a class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" href="${escapeHtml(asset.browser_download_url)}" download>
    <span>${escapeHtml(label)}</span><small>${escapeHtml(formatBytes(asset.size, lang))}</small></a>`;
}

/** Platform rows in display order: the visitor's own system first (Android on a phone, Windows on a PC). */
function rowOrder(): Platform[] {
  return userPlatform ? [userPlatform, ...PLATFORMS.filter((p) => p !== userPlatform)] : [...PLATFORMS];
}

/** Systems this app has a file for in any release, or that are declared in apps.json. */
function appPlatforms(): Platform[] {
  const seen = mergePlatforms(...releases.map((r) => platformsOf(r.assets)), declared);
  return rowOrder().filter((p) => seen.includes(p));
}

/** The file offered for a system in a release: its own file, else one that works everywhere. */
function fileFor(rel: Release, p: Platform): Asset | undefined {
  return assetsFor(rel.assets, p)[0] ?? rel.assets.find((a) => !isAuxiliary(a.name) && assetPlatform(a.name) === null);
}

function releaseByTag(tag: string): Release {
  return releases.find((r) => r.tag_name === tag) ?? releases[0];
}

function versionOptions(selected: string) {
  const latest = latestRelease(releases);
  return releases
    .map((r) => {
      const tags = [r === latest ? t('app.latest') : '', r.prerelease ? t('app.prerelease') : ''].filter(Boolean);
      const label = `${r.tag_name}${tags.length ? ` (${tags.join(', ')})` : ''}`;
      return `<option value="${escapeHtml(r.tag_name)}"${r.tag_name === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

/** What a row offers for its system in one release: a download, a build from source, or nothing. */
function actionFor(p: Platform, rel: Release, primary: boolean): string {
  const file = fileFor(rel, p);
  if (file) return downloadButton(file, t('app.download'), primary);
  if (declared.includes(p)) {
    const repoUrl = `https://github.com/${owner}/${repoName}`;
    return `<span class="muted">${escapeHtml(t('app.fromSource'))}</span> <a class="dl-link" href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(t('app.viewSource'))}</a>`;
  }
  return `<span class="muted">${escapeHtml(t('app.supportNo'))}</span>`;
}

/** One row per system; each row has its own version picker, starting at `tag`. */
function renderDownloads(tag: string) {
  const box = $('[data-downloads]');
  const platforms = appPlatforms();
  box.innerHTML = platforms
    .map(
      (p, i) => `<div class="download-row" data-platform="${p}">
        <span class="dl-name">${escapeHtml(pname(p))}</span>
        <select class="dl-version" aria-label="${escapeHtml(`${pname(p)}: ${t('app.chooseVersion')}`)}">${versionOptions(tag)}</select>
        <div class="dl-action">${actionFor(p, releaseByTag(tag), i === 0)}</div>
      </div>`,
    )
    .join('');
  box.hidden = platforms.length === 0;
}

/** Per OS: a file in this version, supported but only from source, or not supported. */
function renderSupport(rel: Release) {
  const shipped = new Set(rel.assets.map((a) => assetPlatform(a.name)));
  // A file that doesn't name a system (e.g. a web app's zip) works for every declared platform.
  const universalFile = rel.assets.some((a) => !isAuxiliary(a.name) && assetPlatform(a.name) === null);
  $('[data-support]').innerHTML = PLATFORMS.map((p) => {
    if (shipped.has(p) || (universalFile && declared.includes(p))) return `<li class="yes">${escapeHtml(pname(p))}</li>`;
    if (declared.includes(p)) {
      return `<li class="source">${escapeHtml(pname(p))} <small>${escapeHtml(t('app.fromSource'))}</small></li>`;
    }
    return `<li class="no"><span class="sr-only">${escapeHtml(t('app.supportNo'))}: </span>${escapeHtml(pname(p))}</li>`;
  }).join('');
  $<HTMLElement>('[data-support-row]').hidden = false;
}

function renderFiles(rel: Release) {
  const sorted = [...rel.assets].sort((a, b) => Number(isAuxiliary(a.name)) - Number(isAuxiliary(b.name)));
  const rows = sorted.map((a) => {
    const p = assetPlatform(a.name);
    return `<li class="${isAuxiliary(a.name) ? 'aux' : ''}">
      <a href="${escapeHtml(a.browser_download_url)}" download>${escapeHtml(a.name)}</a>
      <span class="file-meta">${p ? `<span class="tag">${escapeHtml(pname(p))}</span>` : ''}
      <span>${escapeHtml(formatBytes(a.size, lang))}</span>
      <span>↓ ${formatNumber(a.download_count, lang)}</span></span></li>`;
  });
  rows.push(
    `<li class="aux"><a href="${escapeHtml(rel.zipball_url)}">${escapeHtml(t('app.sourceZip'))}</a></li>`,
    `<li class="aux"><a href="${escapeHtml(rel.tarball_url)}">${escapeHtml(t('app.sourceTar'))}</a></li>`,
  );
  $('[data-files]').innerHTML = rows.join('');
}

function renderNotes(rel: Release) {
  $('[data-notes-title]').textContent = t('app.releaseNotes', { version: rel.tag_name });
  $('[data-released]').textContent = t('app.released', { date: formatDate(rel.published_at, lang) });
  $('[data-notes]').innerHTML = rel.body?.trim()
    ? renderMarkdown(rel.body, ctx).html
    : `<p class="muted">${escapeHtml(t('app.noNotes'))}</p>`;
}

function selectRelease(rel: Release, updateUrl: boolean) {
  setStat('version', rel.tag_name);
  renderDownloads(rel.tag_name);
  renderSupport(rel);
  renderFiles(rel);
  renderNotes(rel);
  $('[data-side]').hidden = false;
  if (updateUrl) {
    const url = new URL(location.href);
    if (rel === latestRelease(releases)) url.searchParams.delete('v');
    else url.searchParams.set('v', rel.tag_name);
    history.replaceState(null, '', url);
  }
}

function fillReleases(all: Release[]) {
  releases = published(all);
  const total = releases.reduce((sum, r) => sum + r.assets.reduce((s, a) => s + a.download_count, 0), 0);
  setStat('downloads', formatNumber(total, lang));

  if (!releases.length) {
    setStat('version', '—');
    $('[data-downloads]').innerHTML = `<a class="btn btn-primary" href="https://github.com/${owner}/${repoName}" target="_blank" rel="noopener"><span>${escapeHtml(t('app.viewSource'))}</span></a>`;
    $('[data-downloads]').hidden = false;
    const hint = $('[data-hint]');
    hint.textContent = t('app.noReleases');
    hint.hidden = false;
    $('[data-changelog]').innerHTML = `<p class="muted">${escapeHtml(t('app.noReleases'))}</p>`;
    return;
  }

  const latest = latestRelease(releases)!;
  const select = $<HTMLSelectElement>('[data-version]');
  const wanted = new URLSearchParams(location.search).get('v');
  const initial = releases.find((r) => r.tag_name === wanted) ?? latest;
  select.innerHTML = versionOptions(initial.tag_name);
  $('[data-version-wrap]').hidden = false;

  selectRelease(initial, false);
  select.addEventListener('change', () => selectRelease(releases.find((r) => r.tag_name === select.value)!, true));

  $('[data-changelog]').innerHTML = releases
    .map(
      (r) => `<section class="release">
        <header><h3>${escapeHtml(r.name?.trim() || r.tag_name)}</h3>
        <span class="tag tag-version">${escapeHtml(r.tag_name)}</span>
        ${r.prerelease ? `<span class="tag">${escapeHtml(t('app.prerelease'))}</span>` : ''}
        <time datetime="${escapeHtml(r.published_at ?? '')}">${escapeHtml(formatDate(r.published_at, lang))}</time></header>
        <div class="prose prose-small">${r.body?.trim() ? renderMarkdown(r.body, ctx).html : `<p class="muted">${escapeHtml(t('app.noNotes'))}</p>`}</div>
      </section>`,
    )
    .join('');
}

// Each row's own version picker only changes that row.
$('[data-downloads]').addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement;
  if (!select.classList.contains('dl-version')) return;
  const row = select.closest<HTMLElement>('.download-row')!;
  const primary = row === row.parentElement!.firstElementChild;
  row.querySelector('.dl-action')!.innerHTML = actionFor(row.dataset.platform as Platform, releaseByTag(select.value), primary);
});

let shots: string[] = [];
function fillReadme(md: string | null, path: string) {
  const box = $('[data-readme]');
  if (md === null) {
    box.innerHTML = `<p class="muted">${escapeHtml(t('app.noReadme'))}</p>`;
    return;
  }
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const { html, images } = renderMarkdown(md, { ...ctx, dir });
  box.innerHTML = html;

  shots = images.slice(0, 12);
  if (!shots.length) return;
  $('[data-shots-list]').innerHTML = shots
    .map((src, i) => `<li><button type="button" data-shot="${i}"><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"></button></li>`)
    .join('');
  $('[data-shots]').hidden = false;
}

// Screenshot lightbox
const lightbox = document.querySelector<HTMLDialogElement>('[data-lightbox]')!;
const lbImg = lightbox.querySelector<HTMLImageElement>('[data-lb-img]')!;
let current = 0;
function show(i: number) {
  current = (i + shots.length) % shots.length;
  lbImg.src = shots[current];
}
root.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-shot]');
  if (!btn) return;
  show(Number(btn.dataset.shot));
  lightbox.showModal();
});
lightbox.querySelector('[data-lb-prev]')!.addEventListener('click', () => show(current - 1));
lightbox.querySelector('[data-lb-next]')!.addEventListener('click', () => show(current + 1));
lightbox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(current - 1);
  if (e.key === 'ArrowRight') show(current + 1);
});
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.close();
});

// Tabs
const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function selectTab(tab: HTMLButtonElement) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !on;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
});

// Search in the header jumps back to the list with the query.
const search = document.querySelector<HTMLInputElement>('#q');
search?.form?.addEventListener('submit', (e) => {
  if (!search.value.trim()) e.preventDefault();
});

async function load() {
  let problem: unknown = null;
  let stale = false;

  const [repo, rels, readme] = await Promise.allSettled([
    getRepo(owner, repoName),
    getReleases(owner, repoName),
    getReadme(owner, repoName),
  ]);

  if (repo.status === 'fulfilled') {
    fillRepo(repo.value.data);
    stale ||= repo.value.stale;
  } else problem = repo.reason;

  if (rels.status === 'fulfilled') {
    fillReleases(rels.value.data);
    stale ||= rels.value.stale;
  } else {
    problem ??= rels.reason;
    for (const s of ['version', 'downloads']) setStat(s, '—');
  }
  if (repo.status === 'rejected') for (const s of ['stars', 'updated']) setStat(s, '—');

  if (readme.status === 'fulfilled') {
    const md = decodeBase64(readme.value.data.content);
    readmeText = plainSummary(md);
    fillReadme(md, readme.value.data.path);
    stale ||= readme.value.stale;
  } else if (readme.reason instanceof GitHubError && readme.reason.status === 404 && repo.status === 'fulfilled') {
    fillReadme(null, '');
  } else {
    problem ??= readme.reason;
    $('[data-readme]').innerHTML = '';
  }

  renderDesc();

  if (problem) showNotice(problem);
  else if (stale) showNotice('stale');
}

load();
