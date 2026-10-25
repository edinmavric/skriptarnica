/**
 * @username mentions (SPEC §4.9). Usernames are 3–30 of [a-z0-9_.]; a mention must start the
 * text or follow whitespace/punctuation (so emails like a@b.rs don't count), and code spans
 * are ignored. Returns lowercase, unique usernames, at most `limit`.
 */
export function extractMentions(markdown: string, limit = 10): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const found = new Set<string>();
  for (const match of withoutCode.matchAll(/(^|[\s(>"'„“,;:!?])@([a-zA-Z0-9_.]{3,30})/g)) {
    const username = (match[2] ?? '').toLowerCase().replace(/\.+$/, '');
    if (username.length >= 3) found.add(username);
    if (found.size >= limit) break;
  }
  return [...found];
}
