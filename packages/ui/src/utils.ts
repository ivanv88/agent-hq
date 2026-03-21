export function elapsedStr(start: string | Date | null): string {
  if (!start) return '';
  const ms = Date.now() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

export function generateBranchPreview(
  type: string,
  ticket: string,
  prompt: string
): string {
  if (!prompt.trim()) return '';

  const date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '');
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-');

  let branch = `${type}/`;
  if (ticket.trim()) branch += `${ticket.trim()}-`;
  branch += `${slug}-${date}`;

  return branch.replace(/--+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}
