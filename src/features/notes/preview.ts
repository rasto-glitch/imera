/** First non-empty line of a note body, for previews and conversion titles. */
export function firstLine(body: string): string {
  return body.split('\n').find((line) => line.trim().length > 0)?.trim() ?? 'Untitled';
}

/** Body without its first non-empty line, single-line, for list snippets. */
export function restSnippet(body: string): string {
  const lines = body.split('\n');
  const index = lines.findIndex((line) => line.trim().length > 0);
  return lines
    .slice(index + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Zero-based line number containing character offset `at`. */
export function lineAt(body: string, at: number): number {
  return body.slice(0, at).split('\n').length - 1;
}
