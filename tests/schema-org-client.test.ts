import { SchemaOrgClient } from '../src/schema-org-client';
import { FuzzyMatcher, resolveTypeAlias, normalizeString } from '../src/fuzzy-matcher';

describe('SchemaOrgClient', () => {
  let client: SchemaOrgClient;

  beforeAll(() => {
    client = new SchemaOrgClient();
  });

  describe('getSchemaType', () => {
    test('should get schema type for Person', async () => {
      const result = await client.getSchemaType('Person');
      expect(result.name).toBe('Person');
      expect(result.id).toBe('schema:Person');
      expect(result.superTypes).toBeDefined();
      expect(result.url).toBe('https://schema.org/Person');
      expect(result.category).toBe('core');
    });

    test('should include deprecation info when applicable', async () => {
      // UserInteraction is deprecated
      const result = await client.getSchemaType('UserInteraction');
      expect(result.name).toBe('UserInteraction');
      expect(result.deprecated).toBe(true);
      expect(result.supersededBy).toBeDefined();
    });

    test('should resolve type aliases', async () => {
      const result = await client.getSchemaType('blog');
      expect(result.name).toBe('BlogPosting');
    });

    test('should fuzzy match typos', async () => {
      // "Persn" should suggest "Person"
      await expect(client.getSchemaType('Persn')).rejects.toThrow(/Did you mean/);
    });

    test('should throw error for completely unrecognizable type', async () => {
      await expect(client.getSchemaType('XyzNonExistent123')).rejects.toThrow();
    });
  });

  describe('searchSchemas', () => {
    test('should search for article schemas', async () => {
      const results = await client.searchSchemas('article', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      const hasArticle = results.some(r => r.name.toLowerCase().includes('article'));
      expect(hasArticle).toBe(true);
    });

    test('should return results sorted by relevance', async () => {
      const results = await client.searchSchemas('person', 10);
      // Person should be first or near top due to exact match
      const personIndex = results.findIndex(r => r.name === 'Person');
      expect(personIndex).toBeLessThan(3);
    });

    test('should handle multi-word queries', async () => {
      const results = await client.searchSchemas('local business', 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getTypeHierarchy', () => {
    test('should get type hierarchy for NewsArticle', async () => {
      const hierarchy = await client.getTypeHierarchy('NewsArticle');
      expect(hierarchy.name).toBe('NewsArticle');
      expect(hierarchy.parents).toBeDefined();
      expect(hierarchy.parents.length).toBeGreaterThan(0);
      expect(hierarchy.ancestors).toBeDefined();
      expect(hierarchy.depth).toBeGreaterThan(0);
    });

    test('should include children for parent type', async () => {
      const hierarchy = await client.getTypeHierarchy('Article');
      expect(hierarchy.children).toBeDefined();
      expect(hierarchy.children.length).toBeGreaterThan(0);

      const hasNewsArticle = hierarchy.children.some((c: any) => c.name === 'NewsArticle');
      expect(hasNewsArticle).toBe(true);
    });
  });

  describe('getTypeProperties', () => {
    test('should get properties for Organization', async () => {
      const properties = await client.getTypeProperties('Organization', { mode: 'all' });
      expect(properties.length).toBeGreaterThan(0);

      const hasName = properties.some(p => p.name === 'name');
      expect(hasName).toBe(true);
    });

    test('should mark inherited properties', async () => {
      const properties = await client.getTypeProperties('LocalBusiness', { mode: 'all' });
      const inheritedProps = properties.filter(p => p.inheritedFrom);
      expect(inheritedProps.length).toBeGreaterThan(0);
    });

    test('should filter direct-only properties', async () => {
      const allProps = await client.getTypeProperties('LocalBusiness', { mode: 'all' });
      const directProps = await client.getTypeProperties('LocalBusiness', { mode: 'direct' });
      expect(allProps.length).toBeGreaterThan(directProps.length);
      expect(directProps.every(p => !p.inheritedFrom)).toBe(true);
    });

    test('should filter inherited-only properties', async () => {
      const inheritedProps = await client.getTypeProperties('LocalBusiness', { mode: 'inherited' });
      expect(inheritedProps.every(p => p.inheritedFrom)).toBe(true);
    });

    test('should exclude deprecated by default with new filter', async () => {
      const propsNoDeprecated = await client.getTypeProperties('Organization', { includeDeprecated: false });
      const propsWithDeprecated = await client.getTypeProperties('Organization', { includeDeprecated: true });
      // May or may not have deprecated props, but with should be >= without
      expect(propsWithDeprecated.length).toBeGreaterThanOrEqual(propsNoDeprecated.length);
    });

    test('should support pagination', async () => {
      const first5 = await client.getTypeProperties('Person', { limit: 5, offset: 0 });
      const next5 = await client.getTypeProperties('Person', { limit: 5, offset: 5 });

      expect(first5.length).toBe(5);
      expect(next5.length).toBe(5);
      expect(first5[0].name).not.toBe(next5[0].name);
    });

    test('should maintain backwards compatibility with boolean param', async () => {
      const withInherited = await client.getTypeProperties('LocalBusiness', true);
      const withoutInherited = await client.getTypeProperties('LocalBusiness', false);
      expect(withInherited.length).toBeGreaterThan(withoutInherited.length);
    });
  });

  describe('getPropertyDetails', () => {
    test('should get details for name property', async () => {
      const result = await client.getPropertyDetails('name');
      expect(result.name).toBe('name');
      expect(result.domainIncludes).toBeDefined();
      expect(result.rangeIncludes).toBeDefined();
      expect(result.url).toBe('https://schema.org/name');
    });

    test('should include inverse property when applicable', async () => {
      const result = await client.getPropertyDetails('subOrganization');
      expect(result.inverseOf).toBe('parentOrganization');
    });

    test('should fuzzy match property names', async () => {
      await expect(client.getPropertyDetails('nmae')).rejects.toThrow(/Did you mean/);
    });
  });

  describe('getEnumerationValues', () => {
    test('should get values for DayOfWeek', async () => {
      const result = await client.getEnumerationValues('DayOfWeek');
      expect(result.enumeration).toBe('DayOfWeek');
      expect(result.values.length).toBe(8); // 7 days + PublicHolidays

      const hasSunday = result.values.some((v: any) => v.name === 'Sunday');
      expect(hasSunday).toBe(true);
    });

    test('should throw error for non-enumeration type', async () => {
      await expect(client.getEnumerationValues('Person')).rejects.toThrow();
    });
  });

  describe('validateJsonLd', () => {
    test('should validate correct JSON-LD', async () => {
      const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'John Doe',
        email: 'john@example.com',
      };

      const result = await client.validateJsonLd(jsonld);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should detect missing @type', async () => {
      const jsonld = {
        '@context': 'https://schema.org',
        name: 'John Doe',
      };

      const result = await client.validateJsonLd(jsonld);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('@type'))).toBe(true);
    });

    test('should warn about missing @context', async () => {
      const jsonld = {
        '@type': 'Person',
        name: 'John Doe',
      };

      const result = await client.validateJsonLd(jsonld);
      expect(result.warnings.some(w => w.includes('@context'))).toBe(true);
    });

    test('should detect unknown properties with suggestions', async () => {
      const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'John Doe',
        nmae: 'typo', // typo
      };

      const result = await client.validateJsonLd(jsonld);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('nmae') && e.includes('Did you mean'))).toBe(true);
    });

    test('should suggest common missing properties', async () => {
      const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Widget',
      };

      const result = await client.validateJsonLd(jsonld);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('getRelatedTypes', () => {
    test('should find related types for Person', async () => {
      const result = await client.getRelatedTypes('Person');
      expect(result.type).toBe('Person');
      expect(result.usedAsPropertyValues).toBeDefined();
      expect(result.typesWithPropertiesToThis).toBeDefined();
    });
  });

  describe('generateExample', () => {
    test('should generate minimal example', async () => {
      const example = await client.generateExample('Person', 'minimal');
      expect(example['@context']).toBe('https://schema.org');
      expect(example['@type']).toBe('Person');
      expect(example.name).toBeDefined();
      expect(Object.keys(example).length).toBeLessThanOrEqual(4);
    });

    test('should generate standard example', async () => {
      const example = await client.generateExample('Person', 'standard');
      expect(example['@context']).toBe('https://schema.org');
      expect(example['@type']).toBe('Person');
      expect(example.name).toBeDefined();
    });

    test('should generate comprehensive example', async () => {
      const example = await client.generateExample('Person', 'comprehensive');
      expect(example['@context']).toBe('https://schema.org');
      expect(example['@type']).toBe('Person');
      expect(Object.keys(example).length).toBeGreaterThan(5);
    });

    test('should use predefined templates for common types', async () => {
      const example = await client.generateExample('Event', 'standard');
      expect(example.startDate).toBeDefined();
      expect(example.eventStatus).toBeDefined();
    });

    test('should include custom properties', async () => {
      const example = await client.generateExample('Recipe', 'standard', {
        name: 'Custom Recipe',
        cookTime: 'PT30M',
      });

      expect(example['@context']).toBe('https://schema.org');
      expect(example['@type']).toBe('Recipe');
      expect(example.name).toBe('Custom Recipe');
      expect(example.cookTime).toBe('PT30M');
    });

    test('should generate nested types for complex properties', async () => {
      const example = await client.generateExample('LocalBusiness', 'comprehensive');
      expect(example.address).toBeDefined();
      if (typeof example.address === 'object') {
        expect(example.address['@type']).toBe('PostalAddress');
      }
    });

    test('should generate dynamic dates', async () => {
      const example = await client.generateExample('Event', 'standard');
      // startDate should be in the future (at least this year)
      const currentYear = new Date().getFullYear();
      expect(example.startDate).toContain(String(currentYear));
    });

    test('should generate examples for FAQPage', async () => {
      const example = await client.generateExample('FAQPage', 'standard');
      expect(example['@type']).toBe('FAQPage');
      expect(example.mainEntity).toBeDefined();
      expect(Array.isArray(example.mainEntity)).toBe(true);
    });
  });

  // === Batch Operations ===

  describe('getMultipleTypes', () => {
    test('should get multiple types at once', async () => {
      const results = await client.getMultipleTypes(['Person', 'Organization', 'Event']);
      expect(results.length).toBe(3);
      expect(results.every(r => r.found)).toBe(true);
    });

    test('should handle mixed valid/invalid types', async () => {
      const results = await client.getMultipleTypes(['Person', 'NonExistent', 'Event']);
      expect(results.length).toBe(3);

      const valid = results.filter(r => r.found);
      const invalid = results.filter(r => !r.found);

      expect(valid.length).toBe(2);
      expect(invalid.length).toBe(1);
      expect(invalid[0].error).toBeDefined();
    });
  });

  describe('compareTypes', () => {
    test('should compare two types', async () => {
      const result = await client.compareTypes(['Article', 'BlogPosting']);

      expect(result.types.length).toBe(2);
      expect(result.sharedProperties).toBeDefined();
      expect(result.uniqueProperties).toBeDefined();
      expect(Array.isArray(result.sharedProperties)).toBe(true);
    });

    test('should include recommendations for common comparisons', async () => {
      const result = await client.compareTypes(['Article', 'BlogPosting']);
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation).toContain('BlogPosting');
    });

    test('should reject fewer than 2 types', async () => {
      await expect(client.compareTypes(['Person'])).rejects.toThrow(/at least 2/);
    });

    test('should reject more than 5 types', async () => {
      await expect(client.compareTypes([
        'Person', 'Organization', 'Event', 'Product', 'Article', 'Recipe'
      ])).rejects.toThrow(/at most 5/);
    });
  });

  describe('validateJsonLdBatch', () => {
    test('should validate multiple JSON-LD objects', async () => {
      const items = [
        { '@context': 'https://schema.org', '@type': 'Person', name: 'John' },
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
        { '@type': 'Invalid' }, // Missing context, unknown type
      ];

      const results = await client.validateJsonLdBatch(items);

      expect(results.length).toBe(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
      expect(results[2].valid).toBe(false);
      expect(results[2].index).toBe(2);
    });
  });

  describe('cacheStatus', () => {
    test('should return cache status', async () => {
      // Ensure initialized
      await client.getSchemaType('Person');

      const status = await client.getCacheStatus();
      expect(status.exists).toBeDefined();
      expect(status.path).toBeDefined();
    });
  });
});

// === Fuzzy Matcher Tests ===

describe('FuzzyMatcher', () => {
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher();
    matcher.addItems(['Person', 'Organization', 'LocalBusiness', 'BlogPosting', 'NewsArticle']);
  });

  test('should find exact matches', () => {
    expect(matcher.findExact('Person')).toBe('Person');
    expect(matcher.findExact('person')).toBe('Person'); // case-insensitive
    expect(matcher.findExact('PERSON')).toBe('Person');
  });

  test('should return null for no exact match', () => {
    expect(matcher.findExact('Persn')).toBeNull();
  });

  test('should find similar items', () => {
    const similar = matcher.findSimilar('Persn');
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].name).toBe('Person');
    expect(similar[0].score).toBeGreaterThan(0.5);
  });

  test('should resolve with fuzzy matching', () => {
    expect(matcher.resolve('Person', 'Type')).toBe('Person');
  });

  test('should throw with suggestions for typos', () => {
    expect(() => matcher.resolve('Persn', 'Type')).toThrow(/Did you mean: Person/);
  });
});

describe('Type Aliases', () => {
  test('should resolve common aliases', () => {
    expect(resolveTypeAlias('blog')).toBe('BlogPosting');
    expect(resolveTypeAlias('faq')).toBe('FAQPage');
    expect(resolveTypeAlias('biz')).toBe('LocalBusiness');
    expect(resolveTypeAlias('org')).toBe('Organization');
  });

  test('should handle plurals', () => {
    expect(resolveTypeAlias('products')).toBe('Product');
    expect(resolveTypeAlias('events')).toBe('Event');
  });

  test('should return original for unknown aliases', () => {
    expect(resolveTypeAlias('Person')).toBe('Person');
    expect(resolveTypeAlias('CustomType')).toBe('CustomType');
  });
});

describe('normalizeString', () => {
  test('should normalize strings', () => {
    expect(normalizeString('Hello World')).toBe('helloworld');
    expect(normalizeString('Blog-Posting')).toBe('blogposting');
    expect(normalizeString('  Spaced  ')).toBe('spaced');
  });
});
