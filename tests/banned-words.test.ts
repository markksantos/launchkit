import { describe, it, expect } from 'vitest';
import { scanForBanned, assertNoBanned } from '../src/content/banned-words.js';

describe('banned-words filter', () => {
  it('finds delve', () => {
    const hits = scanForBanned("Let's delve into the topic.");
    expect(hits.length).toBe(1);
    expect(hits[0]?.phrase.toLowerCase()).toBe('delve');
  });

  it('finds in today\'s fast-paced world (with hyphen)', () => {
    const hits = scanForBanned("In today's fast-paced world, things move quickly.");
    expect(hits.length).toBe(1);
  });

  it('finds in today\'s fast paced world (with space)', () => {
    const hits = scanForBanned("In today's fast paced world, things move quickly.");
    expect(hits.length).toBe(1);
  });

  it('finds leverage as a word, not as part of another word', () => {
    expect(scanForBanned('We leverage tools.').length).toBe(1);
    expect(scanForBanned('A long lever age would help.').length).toBe(0);
  });

  it('finds unlock and unlocking', () => {
    expect(scanForBanned('Unlock new revenue.').length).toBe(1);
    expect(scanForBanned('Unlocking your potential.').length).toBe(1);
  });

  it('finds revolutionize', () => {
    expect(scanForBanned('We revolutionize the industry.').length).toBe(1);
  });

  it('finds game-changer with hyphen and space', () => {
    expect(scanForBanned('It is a game-changer.').length).toBe(1);
    expect(scanForBanned('It is a game changer.').length).toBe(1);
  });

  it('finds multiple banned phrases in one text', () => {
    const text = 'We empower users to leverage data and unlock insights.';
    const hits = scanForBanned(text);
    expect(hits.length).toBe(3);
  });

  it('passes clean text', () => {
    const text = 'Two partners fill out a questionnaire and download their documents.';
    expect(scanForBanned(text).length).toBe(0);
    expect(() => assertNoBanned(text, 'test')).not.toThrow();
  });

  it('throws with all hits listed when banned phrases present', () => {
    expect(() => assertNoBanned('We empower and elevate.', 'tweet')).toThrow(/empower.*elevate|elevate.*empower/);
  });
});
