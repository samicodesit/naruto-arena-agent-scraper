export type CharacterLink = {
  name: string;
  slug: string;
  url: string;
  discoveredAt: string;
};

export type LinkInfo = {
  text: string;
  href: string;
};

export type ImageInfo = {
  alt: string;
  src: string;
};

export type SkillCandidate = {
  name: string;
  chakraCost?: string;
  cooldown?: string;
  classes?: string[];
  description?: string;
  confidence: "high" | "medium" | "low";
  rawText: string;
};

export type CharacterRaw = {
  name: string;
  slug: string;
  url: string;
  title: string;
  fetchedAt: string;
  contentHash: string;
  changedSincePrevious: boolean;
  previousHash?: string;
  visibleText: string;
  links: LinkInfo[];
  images: ImageInfo[];
  skillCandidates: SkillCandidate[];
};

export type PatchPage = {
  title: string;
  url: string;
  fetchedAt: string;
  contentHash: string;
  visibleText: string;
  characterLinks: LinkInfo[];
};
