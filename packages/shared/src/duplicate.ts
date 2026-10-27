import { normalizeUrl, trigramSimilarity } from './text';

export interface DuplicateCandidate {
  url: string;
  siteId?: string;
  externalId?: string | null;
  title: string;
  price: number;
  imageHash?: string | null;
}

export interface DuplicateDecision {
  duplicate: boolean;
  reason: 'same_url' | 'same_external_id' | 'repost' | null;
  score: number;
}

/** FR-VIS-003. Image identity is a hash of the image URL (v1), plus title trigram and price. */
export function duplicateDecision(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateDecision {
  if (normalizeUrl(a.url) === normalizeUrl(b.url)) {
    return { duplicate: true, reason: 'same_url', score: 1 };
  }
  if (
    a.externalId &&
    b.externalId &&
    a.externalId === b.externalId &&
    a.siteId &&
    a.siteId === b.siteId
  ) {
    return { duplicate: true, reason: 'same_external_id', score: 1 };
  }
  const titleScore = trigramSimilarity(a.title, b.title);
  const priceClose =
    a.price > 0 && b.price > 0 && Math.abs(a.price - b.price) / Math.max(a.price, b.price) <= 0.05;
  const sameImage = Boolean(a.imageHash && b.imageHash && a.imageHash === b.imageHash);
  if (priceClose && (titleScore >= 0.84 || (titleScore >= 0.75 && sameImage))) {
    return { duplicate: true, reason: 'repost', score: titleScore };
  }
  return { duplicate: false, reason: null, score: titleScore };
}
