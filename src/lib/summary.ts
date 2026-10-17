/**
 * First real paragraph of a README as plain text, used as a blurb when the
 * repository has no description. Skips headings, badges, lists and tables.
 */
export function plainSummary(md: string, max = 200): string {
  const body = md
    .replace(/\r/g, '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ');

  for (const block of body.split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line || /^(#|\||>|[-*+]\s|\d+\.\s)/.test(line)) continue;

    const text = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 20) continue;
    if (text.length <= max) return text;

    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
  }
  return '';
}
