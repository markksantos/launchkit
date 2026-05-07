import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ProductSpec, Result } from '../types.js';
import { err, ok } from '../types.js';
import { assertNoBanned } from './banned-words.js';
import { analyzeSamplesDir, applyVoice, type VoiceProfile } from './tone-analyzer.js';

export interface GeneratedContent {
  filename: string;
  body: string;
  /** Character count (or word count for long-form). */
  metric: { unit: 'chars' | 'words'; value: number; limit?: number };
}

export interface GenerateContentOptions {
  /** Path to a directory of sample writing (.md/.txt) used to match the user's voice. */
  samplesDir?: string;
}

/**
 * Generate every piece of launch content for a spec. Each piece is written to
 * its own .md file under `outDir/content/`. The generator runs the banned-
 * words filter on every output and FAILS the run if any hit is found, so the
 * operator never ships AI slop.
 *
 * When `samplesDir` is provided, the generator analyses the corpus to derive
 * a voice profile (contractions, emoji density, sentence length, semicolons)
 * and applies it to every draft before writing.
 */
export function generateAllContent(
  spec: ProductSpec,
  outDir: string,
  opts: GenerateContentOptions = {},
): Result<GeneratedContent[]> {
  const dir = resolve(outDir, 'content');
  mkdirSync(dir, { recursive: true });

  const voice = analyzeSamplesDir(opts.samplesDir);

  const pieces: GeneratedContent[] = [];

  pieces.push(buildLaunchTweetThread(spec));
  pieces.push(buildLinkedInLaunch(spec));
  pieces.push(buildShowHN(spec));
  pieces.push(buildProductHunt(spec));
  pieces.push(buildBlogLaunch(spec));
  pieces.push(buildNewsletterPitch(spec));

  for (const sub of pickSubreddits(spec)) {
    pieces.push(buildRedditPost(spec, sub));
  }

  for (const piece of pieces) {
    piece.body = applyVoice(piece.body, voice);
    piece.metric = recountMetric(piece);
    try {
      assertNoBanned(piece.body, piece.filename);
    } catch (cause) {
      return err(
        'CONTENT_BANNED_PHRASE',
        (cause as Error).message,
        'Rewrite the offending sentence and re-run.',
        cause,
      );
    }
    const path = resolve(dir, piece.filename);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, piece.body, 'utf-8');
  }

  return ok(pieces);
}

function recountMetric(piece: GeneratedContent): GeneratedContent['metric'] {
  if (piece.metric.unit === 'words') {
    return { ...piece.metric, value: piece.body.split(/\s+/).length };
  }
  return { ...piece.metric, value: piece.body.length };
}

/** Re-export so the CLI can show the operator what voice it inferred. */
export { analyzeSamplesDir };
export type { VoiceProfile };

// ─── Subreddit selector ─────────────────────────────────────────────────────

const CATEGORY_DEFAULT_SUBS: Record<ProductSpec['category'], string[]> = {
  saas: ['r/SaaS', 'r/SideProject', 'r/Entrepreneur', 'r/startups', 'r/IndieDev'],
  consumer: ['r/SideProject', 'r/InternetIsBeautiful', 'r/coolguides', 'r/Entrepreneur', 'r/IndieDev'],
  'developer-tool': ['r/SideProject', 'r/programming', 'r/webdev', 'r/IndieDev', 'r/opensource'],
  'mobile-app': ['r/SideProject', 'r/androidapps', 'r/iOSApps', 'r/Entrepreneur', 'r/IndieDev'],
  'ai-tool': ['r/SideProject', 'r/artificial', 'r/MachineLearning', 'r/IndieDev', 'r/Entrepreneur'],
  marketplace: ['r/SideProject', 'r/Entrepreneur', 'r/startups', 'r/smallbusiness', 'r/IndieDev'],
  'browser-extension': ['r/SideProject', 'r/chrome_extensions', 'r/firefox', 'r/productivity', 'r/IndieDev'],
  'open-source': ['r/SideProject', 'r/opensource', 'r/programming', 'r/IndieDev', 'r/selfhosted'],
  other: ['r/SideProject', 'r/Entrepreneur', 'r/startups', 'r/IndieDev', 'r/InternetIsBeautiful'],
};

function pickSubreddits(spec: ProductSpec): string[] {
  if (spec.subreddits && spec.subreddits.length > 0) return spec.subreddits.slice(0, 5);
  return CATEGORY_DEFAULT_SUBS[spec.category].slice(0, 5);
}

// ─── Builders ───────────────────────────────────────────────────────────────

function fence(label: string): string {
  return `<!-- ${label} — paste-ready, no edits required. Edit the spec instead and regenerate. -->`;
}

function buildLaunchTweetThread(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const handle = `@${spec.handle}`;
  const tweets: string[] = [
    `1/ I built ${spec.name}.\n\n${spec.tagline}\n\n${url}`,
    `2/ Why: ${truncate(spec.useCase, 240)}`,
    `3/ Who it's for: ${truncate(spec.audience, 240)}`,
    `4/ What's inside today:\n\n${spec.descriptions.fifty}`,
    `5/ Built solo. Open to feedback, harsh ones welcome.\n\nFollow ${handle} for the build journal.\n\n${url}`,
  ];
  const lengthOk = tweets.every((t) => t.length <= 280);
  if (!lengthOk) {
    // Truncate any over-length tweet — emit warning marker.
    for (let i = 0; i < tweets.length; i += 1) {
      tweets[i] = truncate(tweets[i] ?? '', 280);
    }
  }
  const body = [
    `# Launch tweet thread — ${spec.name}`,
    fence('launch-tweet-thread'),
    '',
    ...tweets.map((t, i) => `## Tweet ${i + 1} (${t.length}/280)\n\n${t}`),
  ].join('\n\n');
  return {
    filename: 'launch-tweet-thread.md',
    body,
    metric: { unit: 'chars', value: body.length },
  };
}

function buildLinkedInLaunch(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const para1 = `${spec.name} is live today.`;
  const para2 = spec.descriptions.hundred;
  const para3 = `Built it because ${truncate(spec.useCase, 280)}`;
  const cta = `Try it: ${url}\n\nIf it's a fit for someone you know, sharing this post means a lot. Honest feedback is the most useful thing I can hear today.`;
  const body = [
    `# LinkedIn launch post — ${spec.name}`,
    fence('linkedin-launch'),
    '',
    para1,
    '',
    para2,
    '',
    para3,
    '',
    cta,
  ].join('\n');
  return {
    filename: 'linkedin-launch.md',
    body,
    metric: { unit: 'chars', value: body.length, limit: 3000 },
  };
}

function buildShowHN(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const title = `Show HN: ${spec.name} – ${truncate(spec.tagline, 70)}`;
  const intro = spec.descriptions.twoHundred;
  const why = `Built it because ${truncate(spec.useCase, 280)}`;
  const stack = spec.hosting ? `Hosting: ${spec.hosting}.` : '';
  const ask = `What I'm hoping HN will tell me: where I've under- or over-engineered, and what's missing for the audience above.`;
  const body = [
    `# Show HN — ${spec.name}`,
    fence('show-hn'),
    '',
    `**Title (≤80 chars):** ${title}`,
    `**URL:** ${url}`,
    '',
    '**Body:**',
    '',
    intro,
    '',
    why,
    '',
    stack,
    '',
    ask,
  ].join('\n');
  return {
    filename: 'show-hn.md',
    body,
    metric: { unit: 'chars', value: body.length, limit: 2000 },
  };
}

function buildRedditPost(spec: ProductSpec, subreddit: string): GeneratedContent {
  const url = `https://${spec.domain}`;
  const slug = subreddit.replace(/^r\//, '').toLowerCase();
  const rules = REDDIT_RULES[slug] ?? 'Skim the sub rules before posting. Most subs require flair, no shortened URLs, and a transparent self-promo ratio.';
  const title = `${spec.name} — ${truncate(spec.tagline, 200)}`;
  const intro = `I built ${spec.name}. ${truncate(spec.useCase, 280)}`;
  const what = spec.descriptions.hundred;
  const honest = `It's not a finished thing. Looking for the kind of feedback that hurts: where it's confusing, where it's the wrong solution, where it's a duplicate of something better.`;
  const body = [
    `# Reddit post — ${subreddit}`,
    fence(`reddit-${slug}`),
    '',
    `## Sub rules to check before posting`,
    rules,
    '',
    `## Title`,
    title,
    '',
    `## Body`,
    '',
    intro,
    '',
    what,
    '',
    honest,
    '',
    `Link in comments: ${url}`,
  ].join('\n');
  return {
    filename: `reddit-${slug}.md`,
    body,
    metric: { unit: 'chars', value: body.length },
  };
}

const REDDIT_RULES: Record<string, string> = {
  sideproject: 'r/SideProject: title must include the project name. Self-promo allowed but ratio enforced. No shortened URLs. Flair required.',
  saas: 'r/SaaS: explicit "self promo" flair required. Must include short product description, link, and 2-3 lines of context.',
  entrepreneur: 'r/Entrepreneur: link posts get downvoted. Lead with story or lesson, link in body or comment.',
  startups: 'r/startups: hard-no on raw promo. Frame as a build/lessons/case-study post.',
  indiedev: 'r/IndieDev: include screenshots, gif, or short demo. Self-promo allowed with development context.',
  parenting: 'r/Parenting: do NOT promote products in the main thread. Comment in relevant threads only after building karma.',
  internetparents: 'r/internetparents: heavily moderated. Only post if directly answering a parenting question — never as a promo.',
  webdev: 'r/webdev: Saturday-only "showoff" thread. Otherwise no promo. Bring the technical story.',
  programming: 'r/programming: requires substantive technical content, not a product launch. Write a build post about a non-obvious decision.',
  artificial: 'r/artificial: open to AI tool launches. Include what model/approach you used.',
  machinelearning: 'r/MachineLearning: requires technical depth. NOT for product launches; consider r/artificial or r/learnmachinelearning instead.',
  opensource: 'r/opensource: post the GitHub link first, mention the license, mention the maintainer model.',
  selfhosted: 'r/selfhosted: only relevant if your tool can be self-hosted. Otherwise skip.',
  chrome_extensions: 'r/chrome_extensions: include a screenshot and Chrome Web Store link. Include privacy note (data collection).',
  firefox: 'r/firefox: AMO link preferred over Chrome Web Store. Mention Manifest V2/V3 status.',
  productivity: 'r/productivity: lead with the workflow problem you solve, not the tool. Include screenshots.',
  androidapps: 'r/androidapps: Play Store link required. Mention if free/paid/IAP.',
  iosapps: 'r/iOSApps: App Store link required. Mention if free/paid/IAP.',
  smallbusiness: 'r/smallbusiness: low promo tolerance. Frame as "tool I built for X businesses" not "buy my thing".',
  internetisbeautiful: 'r/InternetIsBeautiful: must be free, public, and visually interesting. No paywalls.',
  coolguides: 'r/coolguides: only relevant if your launch includes an infographic / educational guide.',
};

function buildProductHunt(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const taglineVariants = [
    spec.tagline,
    `${shortenTaglineToFiveWords(spec.tagline)}`,
    `${spec.name}: ${shortenTaglineToFiveWords(spec.tagline)}`,
  ];
  const makerComment = `Hi Hunters,\n\nI'm ${spec.founder.name}, the maker of ${spec.name}.\n\n${truncate(spec.descriptions.hundred, 480)}\n\nWhy I built it: ${truncate(spec.useCase, 240)}\n\nFor: ${truncate(spec.audience, 200)}\n\nFeedback I'd love today: where the onboarding is unclear, where the value isn't obvious in 30 seconds, and what's missing for ${truncate(spec.audience, 100)}.`;
  const body = [
    `# Product Hunt copy — ${spec.name}`,
    fence('product-hunt'),
    '',
    `## Taglines (Product Hunt limit: 60 chars)`,
    ...taglineVariants.map((t, i) => `${i + 1}. (${t.length}/60) ${t}`),
    '',
    `## URL`,
    url,
    '',
    `## First-comment maker note`,
    '',
    makerComment,
    '',
    `## Maker comment plan`,
    '- Reply to every top-level comment within 30 minutes.',
    '- Pin the maker comment.',
    '- Post a midday status update with one specific data point (signups, feedback theme).',
  ].join('\n');
  return {
    filename: 'product-hunt.md',
    body,
    metric: { unit: 'chars', value: body.length },
  };
}

function buildBlogLaunch(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const body = [
    `# Why I built ${spec.name}`,
    fence('blog-launch'),
    '',
    `Today I'm shipping **${spec.name}** — ${spec.tagline.toLowerCase()}.`,
    '',
    `## What it does`,
    '',
    spec.descriptions.twoHundred,
    '',
    `## Who it's for`,
    '',
    spec.audience,
    '',
    `## Why this, why now`,
    '',
    `${spec.useCase}`,
    '',
    `${spec.competitors && spec.competitors.length > 0
      ? `Existing options like ${spec.competitors.slice(0, 3).join(', ')} solve adjacent problems but not this one specifically.`
      : ''}`,
    '',
    `## Try it`,
    '',
    `[${spec.name}](${url})`,
    '',
    `## Feedback channels`,
    '',
    `Email me at ${spec.support?.email ?? `support@${spec.domain}`}, or open an issue at https://github.com/${spec.github.org}/${spec.github.repo}/issues.`,
  ].join('\n');
  return {
    filename: 'blog-launch.md',
    body,
    metric: { unit: 'words', value: body.split(/\s+/).length },
  };
}

function buildNewsletterPitch(spec: ProductSpec): GeneratedContent {
  const url = `https://${spec.domain}`;
  const tldr = `Subject: ${spec.name} — ${truncate(spec.tagline, 60)}\n\nHi,\n\nI built ${spec.name} — ${truncate(spec.descriptions.fifty, 220)}\n\n${url}\n\nIf it's a fit for TLDR readers, happy to write a 60-word blurb in your format.\n\n— ${spec.founder.name}`;
  const indie = `Subject: Launch on Indie Hackers — ${spec.name}\n\nHi Indie Hackers team,\n\nLaunching ${spec.name} this week. ${truncate(spec.descriptions.hundred, 320)}\n\nLink: ${url}\n\nHappy to add it to the milestones, and to write a build-in-public follow-up post if helpful.\n\n— ${spec.founder.name}`;
  const makers = `Subject: ${spec.name} — for Makers' Box\n\nHi,\n\nWe just launched ${spec.name}. ${truncate(spec.descriptions.fifty, 240)}\n\nWeb: ${url}\nPricing: ${spec.pricing?.model ?? 'free'}.\n\nThanks for considering.\n\n— ${spec.founder.name}`;
  const body = [
    `# Newsletter pitches — ${spec.name}`,
    fence('newsletter-pitch'),
    '',
    `## TLDR`,
    '',
    tldr,
    '',
    `## Indie Hackers Newsletter`,
    '',
    indie,
    '',
    `## Makers' Box`,
    '',
    makers,
  ].join('\n');
  return {
    filename: 'newsletter-pitch.md',
    body,
    metric: { unit: 'chars', value: body.length },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // Cut at the last word boundary before `max`.
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function shortenTaglineToFiveWords(tagline: string): string {
  const words = tagline.trim().split(/\s+/);
  if (words.length <= 5) return tagline;
  return words.slice(0, 5).join(' ');
}

export function existsFile(p: string): boolean {
  return existsSync(p);
}
