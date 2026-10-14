import { useT, type UiKey } from '../i18n/ui';
import { GitHubError, getOwnerRepos, getReleases, latestRelease, type Repo } from '../lib/github';
import { GROUPS, groupsOf, platformsOf, type Group, type Platform } from '../lib/platform';
import { escapeHtml, formatNumber, formatTime } from '../lib/format';

const lang = document.documentElement.lang === 'cs' ? 'cs' : 'en';
const t = useT(lang);

const list = document.querySelector<HTMLUListElement>('[data-list]')!;
const items = [...list.querySelectorAll<HTMLLIElement>('.app-item')];
const chips = document.querySelector<HTMLElement>('[data-chips]')!;
const sortSelect = document.querySelector<HTMLSelectElement>('[data-sort]')!;
const notice = document.querySelector<HTMLElement>('[data-notice]')!;
const empty = document.querySelector<HTMLElement>('[data-empty]')!;
const emptyText = document.querySelector<HTMLElement>('[data-empty-text]')!;
const search = document.querySelector<HTMLInputElement>('#q')!;
const form = search.form!;

const state = {
  q: new URLSearchParams(location.search).get('q') ?? '',
  group: '' as Group | '',
  sort: 'updated',
};
search.value = state.q;

function showNotice(err: unknown) {
  let msg = t('error.generic');
  if (err instanceof GitHubError && err.isRateLimit) msg = t('error.rateLimit', { time: formatTime(err.resetAt!, lang) });
  else if (err === 'stale') msg = t('error.stale');
  notice.textContent = msg;
  notice.hidden = false;
}

function apply() {
  const q = state.q.trim().toLowerCase();
  let visible = 0;
  for (const li of items) {
    const haystack = `${li.dataset.name} ${li.dataset.search ?? ''}`.toLowerCase();
    const platforms = (li.dataset.platforms ?? '').split(' ').filter(Boolean) as Platform[];
    const show = (!q || q.split(/\s+/).every((w) => haystack.includes(w))) && (!state.group || groupsOf(platforms).includes(state.group));
    li.hidden = !show;
    if (show) visible++;
  }

  const sorted = [...items].sort((a, b) => {
    if (state.sort === 'name') return a.dataset.name!.localeCompare(b.dataset.name!, lang);
    if (state.sort === 'stars') return Number(b.dataset.stars ?? 0) - Number(a.dataset.stars ?? 0);
    return (b.dataset.updated ?? '').localeCompare(a.dataset.updated ?? '');
  });
  list.append(...sorted);

  empty.hidden = visible > 0;
  emptyText.textContent = t('list.empty', { q: state.q || t(`platform.${state.group || 'other'}` as UiKey) });
}

function renderChips(available: Group[]) {
  for (const g of available) {
    if (chips.querySelector(`[data-group="${g}"]`)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.group = g;
    b.setAttribute('aria-pressed', 'false');
    b.textContent = t(`platform.${g}` as UiKey);
    chips.append(b);
  }
  const order = ['', ...GROUPS];
  [...chips.children]
    .sort((a, b) => order.indexOf((a as HTMLElement).dataset.group!) - order.indexOf((b as HTMLElement).dataset.group!))
    .forEach((el) => chips.append(el));
}

function fillRepo(li: HTMLLIElement, repo: Repo) {
  const desc = li.dataset.description || repo.description || '';
  li.querySelector('[data-field="desc"]')!.innerHTML = desc
    ? escapeHtml(desc)
    : `<span class="muted">${escapeHtml(t('app.noDescription'))}</span>`;
  li.dataset.search = [desc, repo.language, ...(repo.topics ?? [])].filter(Boolean).join(' ');
  li.dataset.updated = repo.pushed_at;
  li.dataset.stars = String(repo.stargazers_count);
  li.dataset.language = repo.language ?? '';
}

function renderMeta(li: HTMLLIElement, version: string | null, platforms: Platform[]) {
  const parts: string[] = [];
  if (version) parts.push(`<span class="tag tag-version">${escapeHtml(version)}</span>`);
  for (const p of platforms) parts.push(`<span class="tag">${escapeHtml(t(`platform.${p}` as UiKey))}</span>`);
  if (!version && li.dataset.language) parts.push(`<span class="tag tag-quiet">${escapeHtml(li.dataset.language)}</span>`);
  const stars = Number(li.dataset.stars ?? 0);
  if (stars > 0) parts.push(`<span class="stars" aria-label="${escapeHtml(t('app.stars'))}">★ ${formatNumber(stars, lang)}</span>`);
  li.querySelector('[data-field="meta"]')!.innerHTML = parts.join('');
}

async function load() {
  const owners = [...new Set(items.map((li) => li.dataset.owner!))];
  let stale = false;
  let failed: unknown = null;

  await Promise.all(
    owners.map(async (owner) => {
      try {
        const { data, stale: s } = await getOwnerRepos(owner);
        stale ||= s;
        const byName = new Map(data.map((r) => [r.name.toLowerCase(), r]));
        for (const li of items.filter((li) => li.dataset.owner === owner)) {
          const repo = byName.get(li.dataset.repo!.toLowerCase());
          if (repo) fillRepo(li, repo);
        }
      } catch (err) {
        failed = err;
      }
    }),
  );

  const found = new Set<Platform>();
  await Promise.all(
    items.map(async (li) => {
      try {
        const { data, stale: s } = await getReleases(li.dataset.owner!, li.dataset.repo!);
        stale ||= s;
        const latest = latestRelease(data);
        const platforms = latest ? platformsOf(latest.assets) : [];
        platforms.forEach((p) => found.add(p));
        li.dataset.platforms = platforms.join(' ');
        renderMeta(li, latest?.tag_name ?? null, platforms);
      } catch (err) {
        failed ??= err;
        renderMeta(li, null, []);
      }
      const desc = li.querySelector('[data-field="desc"] .skeleton');
      if (desc) desc.parentElement!.innerHTML = `<span class="muted">${escapeHtml(t('app.noDescription'))}</span>`;
    }),
  );

  if (failed) showNotice(failed);
  else if (stale) showNotice('stale');
  renderChips(groupsOf([...found]));
  apply();
}

form.addEventListener('submit', (e) => e.preventDefault());
search.addEventListener('input', () => {
  state.q = search.value;
  const url = new URL(location.href);
  if (state.q) url.searchParams.set('q', state.q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
  apply();
});

chips.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!btn) return;
  state.group = (btn.dataset.group ?? '') as Group | '';
  chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
  apply();
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  apply();
});

document.querySelector('[data-clear]')!.addEventListener('click', () => {
  state.q = '';
  search.value = '';
  search.dispatchEvent(new Event('input'));
  chips.querySelector<HTMLButtonElement>('[data-group=""]')!.click();
});

apply();
load();
