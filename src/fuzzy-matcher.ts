/**
 * Fuzzy matching utilities for type and property lookup
 * Provides typo tolerance and did-you-mean suggestions
 */

export interface MatchResult {
  name: string;
  score: number;
  normalized: string;
}

export interface FuzzyMatchOptions {
  maxSuggestions?: number;
  minScore?: number;
  caseSensitive?: boolean;
}

const DEFAULT_OPTIONS: FuzzyMatchOptions = {
  maxSuggestions: 5,
  minScore: 0.4,
  caseSensitive: false,
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarityScore(query: string, target: string): number {
  const maxLen = Math.max(query.length, target.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(query, target);
  return 1 - distance / maxLen;
}

/**
 * Normalize a string for comparison
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .trim();
}

/**
 * Calculate combined match score using multiple factors
 */
function calculateMatchScore(query: string, target: string, normalizedQuery: string, normalizedTarget: string): number {
  let score = 0;

  // Exact match (highest priority)
  if (target.toLowerCase() === query.toLowerCase()) {
    return 1.0;
  }

  // Normalized exact match
  if (normalizedTarget === normalizedQuery) {
    return 0.95;
  }

  // Prefix match bonus
  if (normalizedTarget.startsWith(normalizedQuery)) {
    score += 0.3;
  }

  // Contains match bonus
  if (normalizedTarget.includes(normalizedQuery)) {
    score += 0.2;
  }

  // Levenshtein similarity
  const levScore = similarityScore(normalizedQuery, normalizedTarget);
  score += levScore * 0.5;

  // Length similarity bonus (penalize very different lengths)
  const lengthRatio = Math.min(query.length, target.length) / Math.max(query.length, target.length);
  score += lengthRatio * 0.1;

  // Word boundary match bonus (for multi-word queries)
  const queryWords = normalizedQuery.split(/(?=[A-Z])|[^a-z0-9]+/i).filter(Boolean);
  const targetWords = normalizedTarget.split(/(?=[A-Z])|[^a-z0-9]+/i).filter(Boolean);

  let wordMatches = 0;
  for (const qw of queryWords) {
    if (targetWords.some(tw => tw.includes(qw) || qw.includes(tw))) {
      wordMatches++;
    }
  }
  if (queryWords.length > 0) {
    score += (wordMatches / queryWords.length) * 0.2;
  }

  return Math.min(score, 0.94); // Cap below exact match
}

export class FuzzyMatcher {
  private items: Map<string, string> = new Map(); // normalized -> original
  private normalizedIndex: Map<string, string[]> = new Map(); // normalized -> [originals]

  constructor() {}

  /**
   * Add an item to the matcher index
   */
  addItem(name: string): void {
    const normalized = normalizeString(name);
    this.items.set(normalized, name);

    // Also index by original name for exact matches
    const lowerName = name.toLowerCase();
    if (!this.normalizedIndex.has(lowerName)) {
      this.normalizedIndex.set(lowerName, []);
    }
    this.normalizedIndex.get(lowerName)!.push(name);

    // Index by normalized form
    if (!this.normalizedIndex.has(normalized)) {
      this.normalizedIndex.set(normalized, []);
    }
    if (!this.normalizedIndex.get(normalized)!.includes(name)) {
      this.normalizedIndex.get(normalized)!.push(name);
    }
  }

  /**
   * Add multiple items
   */
  addItems(names: string[]): void {
    for (const name of names) {
      this.addItem(name);
    }
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.items.clear();
    this.normalizedIndex.clear();
  }

  /**
   * Find exact match (case-insensitive, with normalization)
   */
  findExact(query: string): string | null {
    // Try exact case-insensitive match first
    const lower = query.toLowerCase();
    const exactMatches = this.normalizedIndex.get(lower);
    if (exactMatches && exactMatches.length > 0) {
      return exactMatches[0];
    }

    // Try normalized match
    const normalized = normalizeString(query);
    const normalizedMatches = this.normalizedIndex.get(normalized);
    if (normalizedMatches && normalizedMatches.length > 0) {
      return normalizedMatches[0];
    }

    return null;
  }

  /**
   * Find similar items with scoring
   */
  findSimilar(query: string, options: FuzzyMatchOptions = {}): MatchResult[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const normalizedQuery = normalizeString(query);
    const results: MatchResult[] = [];

    for (const [normalized, original] of this.items.entries()) {
      const score = calculateMatchScore(query, original, normalizedQuery, normalized);

      if (score >= opts.minScore!) {
        results.push({
          name: original,
          score,
          normalized,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, opts.maxSuggestions);
  }

  /**
   * Resolve a query to an exact match or throw with suggestions
   */
  resolve(query: string, entityType: string = 'item'): string {
    // Try exact match first
    const exact = this.findExact(query);
    if (exact) {
      return exact;
    }

    // Find similar items
    const similar = this.findSimilar(query, { maxSuggestions: 3 });

    if (similar.length === 0) {
      throw new Error(`${entityType} '${query}' not found in schema.org`);
    }

    const suggestions = similar.map(s => s.name).join(', ');
    throw new Error(`${entityType} '${query}' not found. Did you mean: ${suggestions}?`);
  }

  /**
   * Get size of the index
   */
  get size(): number {
    return this.items.size;
  }
}

/**
 * Common schema.org type aliases and natural language variants
 */
export const TYPE_ALIASES: Record<string, string> = {
  // Common abbreviations
  'org': 'Organization',
  'biz': 'LocalBusiness',
  'faq': 'FAQPage',
  'qa': 'QAPage',
  'howto': 'HowTo',

  // Natural language variants
  'business': 'LocalBusiness',
  'company': 'Organization',
  'store': 'Store',
  'shop': 'Store',
  'restaurant': 'Restaurant',
  'article': 'Article',
  'blog': 'BlogPosting',
  'blogpost': 'BlogPosting',
  'news': 'NewsArticle',
  'recipe': 'Recipe',
  'product': 'Product',
  'event': 'Event',
  'person': 'Person',
  'place': 'Place',
  'review': 'Review',
  'rating': 'Rating',
  'offer': 'Offer',
  'video': 'VideoObject',
  'image': 'ImageObject',
  'website': 'WebSite',
  'webpage': 'WebPage',
  'searchbox': 'WebSite', // Common confusion
  'breadcrumb': 'BreadcrumbList',
  'breadcrumbs': 'BreadcrumbList',

  // Plural handling
  'products': 'Product',
  'events': 'Event',
  'articles': 'Article',
  'recipes': 'Recipe',
  'reviews': 'Review',
  'people': 'Person',
  'persons': 'Person',
};

/**
 * Resolve type alias or return original
 */
export function resolveTypeAlias(query: string): string {
  const lower = query.toLowerCase().trim();
  return TYPE_ALIASES[lower] || query;
}
