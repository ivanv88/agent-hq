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
