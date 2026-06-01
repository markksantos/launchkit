import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProductSpec, Result } from '../types.js';
import { ok } from '../types.js';

interface ChecklistItem {
  priority: 1 | 2 | 3;
  platform: string;
  url: string;
  why: string;
  pasteCopy: string;
  verification: 'sms' | 'email' | 'id' | 'none' | 'manual-review';
  approvalEta: string;
  notes?: string;
}

/**
 * Generate the human-in-loop checklist of accounts to create. Ordered by
 * impact (priority 1 first). Every item has paste-ready copy so the human
 * never has to write anything, just click + verify + paste.
 */
export function generateAccountChecklist(spec: ProductSpec, outDir: string): Result<string> {
  mkdirSync(resolve(outDir), { recursive: true });
  const items = buildItems(spec);
  const md = renderMarkdown(spec, items);
  const path = resolve(outDir, 'account-checklist.md');
  writeFileSync(path, md, 'utf-8');
  return ok(path);
}

function buildItems(spec: ProductSpec): ChecklistItem[] {
  const home = `https://${spec.domain}`;
  const handle = spec.handle;
  const taglinePeriod = spec.tagline.endsWith('.') ? spec.tagline : `${spec.tagline}.`;
  const items: ChecklistItem[] = [];

  // Tier 1 — entity recognition / Knowledge Graph
  items.push({
    priority: 1,
    platform: 'LinkedIn Company Page',
    url: `https://www.linkedin.com/company/setup/new/`,
    why: 'Strongest entity-recognition signal for Google and AI knowledge graphs. Required for Organization schema sameAs.',
    pasteCopy: `${spec.name} — ${spec.descriptions.hundred}\n\nWebsite: ${home}\nVanity URL: linkedin.com/company/${handle}`,
    verification: 'manual-review',
    approvalEta: 'a few hours after a personal account verifies the page',
    notes: `Set the vanity URL to /${handle}. Add ${spec.brand.primaryHex} as accent color.`,
  });
  items.push({
    priority: 1,
    platform: 'Crunchbase organization',
    url: 'https://www.crunchbase.com/add-new',
    why: 'Crunchbase is consumed by Wikidata and AI knowledge graphs. Real entity wiring.',
    pasteCopy: `${spec.name}\nWebsite: ${home}\nFounder: ${spec.founder.name}\nLocation: (your HQ)\nCategory: ${labelCategory(spec.category)}\nDescription: ${spec.descriptions.twoHundred}`,
    verification: 'email',
    approvalEta: '1–7 days for moderation',
  });
  items.push({
    priority: 1,
    platform: 'Google Business Profile',
    url: 'https://business.google.com/create',
    why: 'Knowledge Panel eligibility, even for digital-only businesses can claim "Service Area Business" or "Online Business" type.',
    pasteCopy: `${spec.name}\n${taglinePeriod}\nWebsite: ${home}`,
    verification: 'manual-review',
    approvalEta: '5–14 days for postcard verification (or instant for some categories)',
  });

  // Tier 2 — public social
  items.push({
    priority: 2,
    platform: 'X / Twitter',
    url: 'https://twitter.com/i/flow/signup',
    why: 'Distribution; the primary launch surface for Show HN audience and indie founders.',
    pasteCopy: `Username: ${handle}\nName: ${spec.name}\nBio (160): ${trim(`${spec.tagline}. ${spec.descriptions.fifty}`, 160)}\nWebsite: ${home}`,
    verification: 'sms',
    approvalEta: 'instant after SMS',
  });
  items.push({
    priority: 2,
    platform: 'Instagram',
    url: 'https://www.instagram.com/accounts/emailsignup/',
    why: 'Visual platform; indexable by Google for brand-name SERP.',
    pasteCopy: `Username: ${handle}\nName: ${spec.name}\nBio (150): ${trim(`${spec.tagline}\n${spec.descriptions.fifty}`, 150)}\nWebsite: ${home}`,
    verification: 'sms',
    approvalEta: 'instant after SMS',
  });
  items.push({
    priority: 2,
    platform: 'TikTok',
    url: 'https://www.tiktok.com/signup',
    why: 'Visual + audience-discovery surface for parental / consumer products.',
    pasteCopy: `Username: ${handle}\nName: ${spec.name}\nBio (80): ${trim(spec.tagline, 80)}\nWebsite: ${home}`,
    verification: 'sms',
    approvalEta: 'instant after SMS',
  });
  items.push({
    priority: 2,
    platform: 'Threads',
    url: 'https://www.threads.net',
    why: 'Auto-creates from Instagram. Confirm bio + link visibility.',
    pasteCopy: `Bio is inherited from Instagram; just verify it imported and the link is set to ${home}.`,
    verification: 'none',
    approvalEta: 'instant',
  });
  items.push({
    priority: 2,
    platform: 'Facebook Page',
    url: 'https://www.facebook.com/pages/create',
    why: 'Required for some ad platforms and for users who only Google "[brand] facebook".',
    pasteCopy: `Page name: ${spec.name}\nUsername: ${handle}\nCategory: ${labelCategory(spec.category)}\nShort description (255): ${trim(`${spec.tagline}. ${spec.descriptions.fifty}`, 255)}\nWebsite: ${home}`,
    verification: 'manual-review',
    approvalEta: 'instant for the page; a few days for category verification',
  });
  items.push({
    priority: 2,
    platform: 'YouTube channel',
    url: 'https://www.youtube.com/@youtube/about',
    why: 'Brand SERP, plus product-walkthrough hosting.',
    pasteCopy: `Handle: @${handle}\nDescription: ${trim(`${spec.descriptions.twoHundred}\n\n${home}`, 1000)}`,
    verification: 'email',
    approvalEta: 'instant',
  });

  // Tier 3 — content + community
  items.push({
    priority: 3,
    platform: 'GitHub org',
    url: 'https://github.com/account/organizations/new',
    why: 'Code repo home; org-level profile shows up in GitHub search and brand SERP.',
    pasteCopy: `Org name: ${spec.github.org}\nDisplay name: ${spec.name}\nDescription (200): ${trim(spec.tagline, 200)}\nWebsite: ${home}`,
    verification: 'email',
    approvalEta: 'instant',
  });
  items.push({
    priority: 3,
    platform: 'Substack',
    url: 'https://substack.com/signup',
    why: 'Email list / build-in-public channel. Reserves the namespace.',
    pasteCopy: `Publication name: ${spec.name}\nSubdomain: ${handle}\nDescription (280): ${trim(`${spec.tagline}. Notes from building ${spec.name}.`, 280)}`,
    verification: 'email',
    approvalEta: 'instant',
  });
  items.push({
    priority: 3,
    platform: 'Medium',
    url: 'https://medium.com/m/signin',
    why: 'Old-school SEO juice + the easiest cross-post target for the launch blog post.',
    pasteCopy: `Username: ${handle}\nBio (160): ${trim(`${spec.tagline}. Building ${spec.name} → ${home}`, 160)}`,
    verification: 'email',
    approvalEta: 'instant',
  });
  items.push({
    priority: 3,
    platform: 'Reddit user',
    url: 'https://www.reddit.com/register',
    why: 'Posting from a freshly-created brand account is shadowbanned everywhere; use a personal account, but reserve the brand handle.',
    pasteCopy: `Username: ${handle}\nAbout (200): ${trim(`${spec.tagline}. Building ${spec.name} — ${home}`, 200)}`,
    verification: 'email',
    approvalEta: 'instant',
  });
  items.push({
    priority: 3,
    platform: 'Product Hunt maker',
    url: 'https://www.producthunt.com/users/new',
    why: 'Required to launch on PH. Build maker reputation BEFORE you launch.',
    pasteCopy: `Use the founder's personal name and a personal photo, NOT the brand. The brand goes in the product page later.`,
    verification: 'email',
    approvalEta: 'instant',
  });

  return items;
}

function renderMarkdown(spec: ProductSpec, items: ChecklistItem[]): string {
  const lines: string[] = [];
  lines.push(`# ${spec.name} — account-creation checklist`);
  lines.push('');
  lines.push(`These are the accounts launchkit cannot create automatically (they require SMS / email / ID verification or new-account captcha). Each item is paste-ready: open the URL, paste the copy, verify, done. Tier 1 first.`);
  lines.push('');
  for (const tier of [1, 2, 3] as const) {
    const tierItems = items.filter((i) => i.priority === tier);
    lines.push(`## Tier ${tier} — ${tierLabel(tier)}`);
    lines.push('');
    for (const item of tierItems) {
      lines.push(`### ${item.platform}`);
      lines.push('');
      lines.push(`- **Sign-up URL:** ${item.url}`);
      lines.push(`- **Why:** ${item.why}`);
      lines.push(`- **Verification:** ${item.verification}`);
      lines.push(`- **Approval ETA:** ${item.approvalEta}`);
      if (item.notes) lines.push(`- **Notes:** ${item.notes}`);
      lines.push('');
      lines.push('**Paste-ready copy:**');
      lines.push('');
      lines.push('```text');
      lines.push(item.pasteCopy);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function tierLabel(t: 1 | 2 | 3): string {
  return t === 1
    ? 'entity / knowledge-graph'
    : t === 2
      ? 'public social'
      : 'content + community';
}

function labelCategory(c: ProductSpec['category']): string {
  return {
    saas: 'SaaS',
    consumer: 'Consumer',
    'developer-tool': 'Developer Tool',
    'mobile-app': 'Mobile App',
    'ai-tool': 'AI Tool',
    marketplace: 'Marketplace',
    'browser-extension': 'Browser Extension',
    'open-source': 'Open Source',
    other: 'Other',
  }[c];
}

function trim(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
