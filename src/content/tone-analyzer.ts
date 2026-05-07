import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

/**
 * Read a directory of past content samples (e.g. tweets.txt, blog-1.md) and
 * compute a deterministic voice profile. The content generator threads this
 * profile through the templates: emoji frequency, contractions, sentence
 * length, first-person vs we-form, exclamation density, hashtag usage.
 *
 * If no --samples dir is provided, the generator uses NEUTRAL_VOICE — a
 * direct, contraction-friendly, no-emoji indie-hacker baseline.
 */

export interface VoiceProfile {
  /** True if the corpus uses contractions ("I'm", "don't") more often than not. */
  usesContractions: boolean;
  /** True if the corpus is dominated by first-person singular ("I", "me", "my"). */
  firstPerson: boolean;
  /** Mean sentence length in words. */
  meanSentenceWords: number;
  /** Average emoji frequency per 100 words (0 = no emoji). */
  emojiPer100Words: number;
  /** Average exclamation marks per 100 words. */
  exclamationPer100Words: number;
  /** Average hashtags per post (only counted on lines that contain at least one). */
  hashtagsPerPost: number;
  /** True if the corpus uses semicolons (a stylistic flag — most launch copy avoids them). */
  usesSemicolons: boolean;
  /** True if the corpus is empty or unreadable. */
  empty: boolean;
}

export const NEUTRAL_VOICE: VoiceProfile = {
  usesContractions: true,
  firstPerson: true,
  meanSentenceWords: 14,
  emojiPer100Words: 0,
  exclamationPer100Words: 0.4,
  hashtagsPerPost: 0,
  usesSemicolons: false,
  empty: false,
};

const SAMPLE_EXTENSIONS = ['.txt', '.md', '.markdown'];

export interface AnalyzeOptions {
  /** Override file reader (used in tests). */
  readDir?: (path: string) => string[];
  readFile?: (path: string) => string;
}

export function analyzeSamplesDir(dir: string | undefined, opts: AnalyzeOptions = {}): VoiceProfile {
  if (!dir) return NEUTRAL_VOICE;
  const root = resolve(dir);
  if (!existsSync(root)) return NEUTRAL_VOICE;

  let entries: string[];
  try {
    entries = (opts.readDir ?? defaultReadDir)(root);
  } catch {
    return NEUTRAL_VOICE;
  }

  const sampleFiles = entries.filter((f) => SAMPLE_EXTENSIONS.includes(extname(f).toLowerCase()));
  if (sampleFiles.length === 0) return NEUTRAL_VOICE;

  let allText = '';
  let postCount = 0;
  for (const file of sampleFiles) {
    try {
      const content = (opts.readFile ?? defaultReadFile)(resolve(root, file));
      if (content.trim().length === 0) continue;
      allText += '\n' + content;
      // For .txt files we count blank-line-separated blocks as posts, capped at 50; for .md, treat the whole file as one post.
      postCount += extname(file).toLowerCase() === '.txt' ? splitParagraphs(content).length : 1;
    } catch {
      /* skip unreadable file */
    }
  }

  if (allText.trim().length === 0) return { ...NEUTRAL_VOICE, empty: true };
  if (postCount === 0) postCount = 1;

  return analyze(allText, postCount);
}

export function analyze(text: string, postCount: number = 1): VoiceProfile {
  if (text.trim().length === 0) return { ...NEUTRAL_VOICE, empty: true };

  const wordCount = countWords(text);
  if (wordCount === 0) return { ...NEUTRAL_VOICE, empty: true };

  const sentences = splitSentences(text);
  const sentenceWordCounts = sentences.map(countWords).filter((n) => n > 0);
  const meanSentenceWords = sentenceWordCounts.length === 0
    ? NEUTRAL_VOICE.meanSentenceWords
    : Math.round((sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length) * 10) / 10;

  const contractionMatches = (text.match(/\b\w+'\w+\b/g) || []).length;
  const usesContractions = contractionMatches >= Math.max(2, Math.floor(wordCount / 50));

  // Case-insensitive pronoun counting — corpora often arrive lowercase.
  const firstPersonSingular = countWordMatches(text, /\b(I|me|my|mine|myself)\b/gi);
  const firstPersonPlural = countWordMatches(text, /\b(we|us|our|ours|ourselves)\b/gi);
  const firstPerson = firstPersonSingular >= firstPersonPlural;

  const emojiCount = countEmoji(text);
  const exclamationCount = (text.match(/!/g) || []).length;
  const hashtagMatches = (text.match(/(?:^|\s)#[A-Za-z0-9_]{2,}/g) || []).length;
  const semicolonCount = (text.match(/;/g) || []).length;
  // For corpora long enough to have a clear opinion (50+ words) require ≥3 semicolons; else any semicolon counts.
  const semicolonThreshold = wordCount >= 50 ? 3 : 1;
  const usesSemicolons = semicolonCount >= semicolonThreshold;

  return {
    usesContractions,
    firstPerson,
    meanSentenceWords,
    emojiPer100Words: round1((emojiCount / wordCount) * 100),
    exclamationPer100Words: round1((exclamationCount / wordCount) * 100),
    hashtagsPerPost: round1(hashtagMatches / postCount),
    usesSemicolons,
    empty: false,
  };
}

function defaultReadDir(dir: string): string[] {
  return readdirSync(dir).filter((entry) => {
    try {
      return statSync(resolve(dir, entry)).isFile();
    } catch {
      return false;
    }
  });
}

function defaultReadFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

function splitSentences(text: string): string[] {
  // Cheap heuristic: split on . ! ? followed by whitespace, dropping empties.
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function countWordMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu;

function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) || []).length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Apply a voice profile to a draft. Currently:
 *   - If !usesContractions, expand "I'm" → "I am", "don't" → "do not", etc.
 *     (mirror direction is unsafe — we never *insert* contractions because
 *     the casing/agreement is hard to get right.)
 *   - If emojiPer100Words === 0, strip emoji from the draft.
 *   - If usesSemicolons === false, replace "; " with ". " followed by
 *     capitalised next word.
 *
 * The transformations are deliberately conservative — better to leave the
 * draft slightly off-voice than to introduce ungrammatical edits.
 */
export function applyVoice(draft: string, voice: VoiceProfile): string {
  let out = draft;

  if (!voice.usesContractions) {
    const expansions: Array<[RegExp, string]> = [
      [/\bI'm\b/g, 'I am'],
      [/\byou're\b/gi, 'you are'],
      [/\bwe're\b/gi, 'we are'],
      [/\bthey're\b/gi, 'they are'],
      [/\bit's\b/gi, 'it is'],
      [/\bdon't\b/gi, 'do not'],
      [/\bdoesn't\b/gi, 'does not'],
      [/\bdidn't\b/gi, 'did not'],
      [/\bwon't\b/gi, 'will not'],
      [/\bcan't\b/gi, 'cannot'],
      [/\bisn't\b/gi, 'is not'],
      [/\baren't\b/gi, 'are not'],
      [/\bwasn't\b/gi, 'was not'],
      [/\bweren't\b/gi, 'were not'],
      [/\bI've\b/g, 'I have'],
      [/\bI'll\b/g, 'I will'],
      [/\bI'd\b/g, 'I would'],
    ];
    for (const [re, sub] of expansions) {
      out = out.replace(re, sub);
    }
  }

  if (voice.emojiPer100Words === 0) {
    out = out.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ');
  }

  if (!voice.usesSemicolons) {
    out = out.replace(/;\s+([a-z])/g, (_, ch: string) => `. ${ch.toUpperCase()}`);
  }

  return out;
}
