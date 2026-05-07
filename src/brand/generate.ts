import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProductSpec, Result } from '../types.js';
import { err, ok } from '../types.js';
import { assertNoBanned } from '../content/banned-words.js';

interface PlatformPlan {
  platform: string;
  url: string;
  bioLimit: number;
  bio: string;
  notes: string;
}

const PLATFORMS_TO_GENERATE = [
  'linkedin',
  'x',
  'instagram',
  'tiktok',
  'youtube',
  'threads',
  'facebook',
  'github',
  'crunchbase',
  'reddit',
  'substack',
  'medium',
] as const;

type Platform = (typeof PLATFORMS_TO_GENERATE)[number];

const LIMITS: Record<Platform, number> = {
  linkedin: 2000, // company page tagline-equivalent
  x: 160,
  instagram: 150,
  tiktok: 80,
  youtube: 1000,
  threads: 150,
  facebook: 255,
  github: 200,
  crunchbase: 1000,
  reddit: 200,
  substack: 280,
  medium: 280,
};

const URL_BUILDERS: Record<Platform, (s: ProductSpec) => string> = {
  linkedin: (s) => `https://www.linkedin.com/company/${s.handle}`,
  x: (s) => `https://x.com/${s.handle}`,
  instagram: (s) => `https://www.instagram.com/${s.handle}/`,
  tiktok: (s) => `https://www.tiktok.com/@${s.handle}`,
  youtube: (s) => `https://www.youtube.com/@${s.handle}`,
  threads: (s) => `https://www.threads.net/@${s.handle}`,
  facebook: (s) => `https://www.facebook.com/${s.handle}`,
  github: (s) => `https://github.com/${s.github.org}`,
  crunchbase: (s) => `https://www.crunchbase.com/organization/${s.handle}`,
  reddit: (s) => `https://www.reddit.com/user/${s.handle}`,
  substack: (s) => `https://${s.handle}.substack.com`,
  medium: (s) => `https://medium.com/@${s.handle}`,
};

function buildPlan(platform: Platform, spec: ProductSpec): PlatformPlan {
  const url = URL_BUILDERS[platform](spec);
  const bioLimit = LIMITS[platform];
  const home = `https://${spec.domain}`;

  // Each bio uses platform-appropriate phrasing. Bios DO NOT include the brand
  // URL except where there's a separate URL field on the platform — most
  // platforms have a dedicated link slot, so saving every bio character for
  // copy.
  const fitToLimit = (s: string): string => (s.length <= bioLimit ? s : truncate(s, bioLimit));

  let bio: string;
  let notes: string;

  switch (platform) {
    case 'linkedin':
      bio = `${spec.name}\n\n${spec.descriptions.hundred}\n\nWebsite: ${home}`;
      notes = 'LinkedIn Company Page → About → Description. Add logo, banner, and the "Specialties" tags drawn from product-spec.category and audience.';
      break;
    case 'x':
      bio = fitToLimit(`${spec.tagline}. ${spec.descriptions.fifty}`);
      notes = 'Set the website field to ${home}. Pin the launch tweet. Avoid hashtags in bio.'.replace('${home}', home);
      break;
    case 'instagram':
      bio = fitToLimit(`${spec.tagline}\n${spec.descriptions.fifty}`);
      notes = `Add ${home} as the link-in-bio. Use the brand color for the avatar background.`;
      break;
    case 'tiktok':
      bio = fitToLimit(spec.tagline);
      notes = `Username @${spec.handle}. TikTok bio is 80 chars; tagline only.`;
      break;
    case 'youtube':
      bio = fitToLimit(`${spec.descriptions.twoHundred}\n\n${home}`);
      notes = 'YouTube channel → Customization → About → Description.';
      break;
    case 'threads':
      bio = fitToLimit(`${spec.tagline}\n${spec.descriptions.fifty}`);
      notes = 'Threads pulls bio from Instagram. Update Instagram and Threads syncs.';
      break;
    case 'facebook':
      bio = fitToLimit(`${spec.tagline}. ${spec.descriptions.fifty}`);
      notes = `Facebook Page → About → Short Description. Add ${home} as Website.`;
      break;
    case 'github':
      bio = fitToLimit(spec.tagline);
      notes = `GitHub Org → Profile → "github.com/${spec.github.org}" → Edit profile. Pin ${spec.github.repo}.`;
      break;
    case 'crunchbase':
      bio = fitToLimit(spec.descriptions.twoHundred);
      notes = `Crunchbase Organization → Edit → About. Add founder ${spec.founder.name}, headquarters, and primary website ${home}.`;
      break;
    case 'reddit':
      bio = fitToLimit(`${spec.tagline}. Building ${spec.name} — ${home}`);
      notes = 'Reddit user "About" — under 200 chars. Posting from a brand account triggers spam filters; prefer a personal account that mentions the brand.';
      break;
    case 'substack':
      bio = fitToLimit(`${spec.tagline}. Notes from building ${spec.name}.`);
      notes = `Substack → Newsletter → Settings → Description. Add ${home} as the homepage URL.`;
      break;
    case 'medium':
      bio = fitToLimit(`${spec.tagline}. Building ${spec.name} → ${home}`);
      notes = 'Medium profile bio. 160-char display limit on profile cards even though full bio allows more.';
      break;
  }

  return { platform, url, bioLimit, bio, notes };
}

export interface BrandIdentityResult {
  markdownPath: string;
  plans: PlatformPlan[];
}

export function generateBrandIdentity(spec: ProductSpec, outDir: string): Result<BrandIdentityResult> {
  mkdirSync(resolve(outDir), { recursive: true });

  const plans = PLATFORMS_TO_GENERATE.map((p) => buildPlan(p, spec));

  // Banned-phrase guard: every bio is content too.
  for (const plan of plans) {
    try {
      assertNoBanned(plan.bio, `${plan.platform} bio`);
    } catch (cause) {
      return err(
        'BRAND_BANNED_PHRASE',
        (cause as Error).message,
        'Adjust the spec.descriptions.* until the bios are clean.',
        cause,
      );
    }
    if (plan.bio.length > plan.bioLimit) {
      return err(
        'BRAND_BIO_OVER_LIMIT',
        `${plan.platform} bio is ${plan.bio.length}/${plan.bioLimit} chars.`,
        'Shorten spec.descriptions.fifty so the platform bio fits.',
      );
    }
  }

  const md = renderMarkdown(spec, plans);
  const path = resolve(outDir, 'brand-identity.md');
  writeFileSync(path, md, 'utf-8');
  return ok({ markdownPath: path, plans });
}

function renderMarkdown(spec: ProductSpec, plans: PlatformPlan[]): string {
  const lines: string[] = [];
  lines.push(`# ${spec.name} — brand identity`);
  lines.push('');
  lines.push(`Generated by launchkit. Update by editing the spec and re-running \`pnpm brand:generate\`. Do not hand-edit this file.`);
  lines.push('');
  lines.push(`- **Domain:** https://${spec.domain}`);
  lines.push(`- **Handle (canonical, used everywhere):** \`@${spec.handle}\``);
  lines.push(`- **GitHub org:** https://github.com/${spec.github.org}`);
  lines.push(`- **Brand colors:** primary \`${spec.brand.primaryHex}\`, accent \`${spec.brand.accentHex}\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const plan of plans) {
    lines.push(`## ${labelFor(plan.platform)}`);
    lines.push('');
    lines.push(`- **URL:** ${plan.url}`);
    lines.push(`- **Bio (${plan.bio.length} / ${plan.bioLimit} chars):**`);
    lines.push('');
    lines.push('```text');
    lines.push(plan.bio);
    lines.push('```');
    lines.push('');
    lines.push(`> ${plan.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

function labelFor(p: string): string {
  const map: Record<string, string> = {
    linkedin: 'LinkedIn (company page)',
    x: 'X / Twitter',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube channel',
    threads: 'Threads',
    facebook: 'Facebook page',
    github: 'GitHub organization',
    crunchbase: 'Crunchbase organization',
    reddit: 'Reddit user "About"',
    substack: 'Substack publication',
    medium: 'Medium publication / user bio',
  };
  return map[p] ?? p;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}
