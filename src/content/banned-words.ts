/**
 * AI-giveaway phrases the content generator must never emit.
 *
 * Source: the launchkit project spec, deliberately conservative. Each entry is
 * a regex matched case-insensitively against the generated text. Hits cause
 * the generator to fail loudly so the operator notices and rewrites.
 */

export const BANNED_PHRASES: readonly RegExp[] = [
  /\bdelve\b/i,
  /\bin today's fast[-\s]?paced world\b/i,
  /\bleverage\b/i,
  /\bunlock(?:ing)?\b/i,
  /\belevate\b/i,
  /\bempower(?:ing)?\b/i,
  /\bnavigate the landscape\b/i,
  /\bgame[-\s]?changer\b/i,
  /\brevolutionize\b/i,
];

export interface BannedHit {
  phrase: string;
  index: number;
  context: string;
}

/**
 * Scan text for banned phrases. Returns every hit (not just the first) so the
 * operator can fix them all in one pass.
 */
export function scanForBanned(text: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const pattern of BANNED_PHRASES) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 24);
      const end = Math.min(text.length, m.index + m[0].length + 24);
      hits.push({
        phrase: m[0],
        index: m.index,
        context: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return hits;
}

/** Throw a clean error listing every banned hit. Used in tests + content generators. */
export function assertNoBanned(text: string, label: string): void {
  const hits = scanForBanned(text);
  if (hits.length === 0) return;
  const summary = hits.map((h) => `"${h.phrase}" near "...${h.context}..."`).join('\n  - ');
  throw new Error(`Banned AI-giveaway phrases in ${label}:\n  - ${summary}`);
}
