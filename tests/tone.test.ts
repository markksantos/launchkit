import { describe, it, expect } from 'vitest';
import { analyze, applyVoice, NEUTRAL_VOICE, analyzeSamplesDir } from '../src/content/tone-analyzer.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('analyze', () => {
  it('detects contractions', () => {
    const profile = analyze("I'm shipping today. I don't know if it's good but I'll try. We're going to find out. It isn't perfect but it works.", 1);
    expect(profile.usesContractions).toBe(true);
  });

  it('detects formal voice without contractions', () => {
    const profile = analyze('I am shipping today. I do not know if it is good but I will try. We are going to find out. It is not perfect but it works.', 1);
    expect(profile.usesContractions).toBe(false);
  });

  it('detects first-person singular vs plural dominance', () => {
    const fpsProfile = analyze('I built this. I shipped it. My team helped me.', 1);
    expect(fpsProfile.firstPerson).toBe(true);

    const fppProfile = analyze('We built this. Our team shipped it. We are proud.', 1);
    expect(fppProfile.firstPerson).toBe(false);
  });

  it('measures sentence length', () => {
    const profile = analyze('Short. Short. Short.', 1);
    expect(profile.meanSentenceWords).toBeLessThan(3);
    expect(profile.meanSentenceWords).toBeGreaterThan(0);
  });

  it('detects emoji usage', () => {
    const withEmoji = analyze('We launched 🚀 today! It is great 🎉 stuff.', 1);
    expect(withEmoji.emojiPer100Words).toBeGreaterThan(0);

    const withoutEmoji = analyze('We launched today. It is great stuff.', 1);
    expect(withoutEmoji.emojiPer100Words).toBe(0);
  });

  it('detects semicolon usage', () => {
    const heavy = analyze('First; second; third; fourth; fifth.', 1);
    expect(heavy.usesSemicolons).toBe(true);

    const none = analyze('First. Second. Third. Fourth.', 1);
    expect(none.usesSemicolons).toBe(false);
  });

  it('counts hashtags per post', () => {
    const profile = analyze('Loving this #buildinpublic #indiehackers vibe today!', 1);
    expect(profile.hashtagsPerPost).toBeGreaterThan(0);
  });

  it('falls back to neutral voice when text is empty', () => {
    const profile = analyze('', 1);
    expect(profile.empty).toBe(true);
  });
});

describe('analyzeSamplesDir', () => {
  it('falls back to NEUTRAL_VOICE when no path given', () => {
    expect(analyzeSamplesDir(undefined)).toEqual(NEUTRAL_VOICE);
  });

  it('falls back to NEUTRAL_VOICE when path does not exist', () => {
    expect(analyzeSamplesDir('/tmp/launchkit-no-such-dir-xyz')).toEqual(NEUTRAL_VOICE);
  });

  it('reads .md and .txt files and merges them', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'launchkit-tone-'));
    writeFileSync(resolve(dir, 'a.md'), "I'm shipping. I don't sleep. I write.");
    writeFileSync(resolve(dir, 'b.txt'), "I'm pumped. Today I shipped a thing. I'm tired.");
    writeFileSync(resolve(dir, 'ignore.png'), 'not text');
    const profile = analyzeSamplesDir(dir);
    expect(profile.empty).toBe(false);
    expect(profile.usesContractions).toBe(true);
  });
});

describe('applyVoice', () => {
  it('expands contractions when the corpus is formal', () => {
    const formal = { ...NEUTRAL_VOICE, usesContractions: false };
    const result = applyVoice("I'm shipping. We can't stop. It's great.", formal);
    expect(result).toContain('I am shipping');
    expect(result).toContain('cannot stop');
    expect(result).toContain('it is great');
  });

  it('strips emoji when the corpus has none', () => {
    const result = applyVoice('We launched 🚀 today! 🎉', NEUTRAL_VOICE);
    expect(result).not.toMatch(/🚀|🎉/);
    expect(result).toContain('launched');
  });

  it('replaces semicolons with periods when the corpus avoids them', () => {
    const result = applyVoice('Built it; shipped it; wrote about it.', NEUTRAL_VOICE);
    expect(result).not.toContain(';');
    expect(result).toContain('. Shipped');
    expect(result).toContain('. Wrote');
  });

  it('leaves text alone when voice matches', () => {
    const matching = { ...NEUTRAL_VOICE, usesContractions: true, emojiPer100Words: 5, usesSemicolons: true };
    const original = "I'm shipping; building 🚀 things.";
    expect(applyVoice(original, matching)).toBe(original);
  });
});
