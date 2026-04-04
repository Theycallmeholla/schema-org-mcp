import axios from 'axios';
import { CacheManager, CacheConfig } from './cache-manager.js';
import { FuzzyMatcher, resolveTypeAlias, normalizeString } from './fuzzy-matcher.js';
import { observability } from './observability.js';

interface SchemaType {
  '@id': string;
  '@type': string | string[];
  'rdfs:label': string | { '@language': string; '@value': string };
  'rdfs:comment'?: string | { '@language': string; '@value': string };
  'rdfs:subClassOf'?: { '@id': string } | { '@id': string }[];
  'schema:isPartOf'?: { '@id': string };
  'schema:supersededBy'?: { '@id': string };
  [key: string]: any;
}

interface SchemaProperty {
  '@id': string;
  '@type': string | string[];
  'rdfs:label': string | { '@language': string; '@value': string };
  'rdfs:comment'?: string | { '@language': string; '@value': string };
  'schema:domainIncludes'?: { '@id': string } | { '@id': string }[];
  'schema:rangeIncludes'?: { '@id': string } | { '@id': string }[];
  'schema:supersededBy'?: { '@id': string };
  'schema:inverseOf'?: { '@id': string };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

type ExampleStyle = 'minimal' | 'standard' | 'comprehensive';

export interface PropertyFilter {
  mode?: 'all' | 'direct' | 'inherited';
  includeDeprecated?: boolean;
  limit?: number;
  offset?: number;
}

export interface ClientConfig extends CacheConfig {
  offline?: boolean;
}

// Common property patterns for realistic example generation
const EXAMPLE_DATA: Record<string, Record<string, any>> = {
  Person: {
    name: 'Jane Smith',
    givenName: 'Jane',
    familyName: 'Smith',
    email: 'jane.smith@example.com',
    telephone: '+1-555-123-4567',
    jobTitle: 'Software Engineer',
    url: 'https://example.com/jane-smith',
    image: 'https://example.com/photos/jane-smith.jpg',
    sameAs: ['https://linkedin.com/in/janesmith', 'https://twitter.com/janesmith'],
  },
  Organization: {
    name: 'Acme Corporation',
    url: 'https://acme.example.com',
    logo: 'https://acme.example.com/logo.png',
    email: 'info@acme.example.com',
    telephone: '+1-800-555-0123',
    foundingDate: () => `${new Date().getFullYear() - 10}-01-15`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '100 Business Park Drive',
      addressLocality: 'Austin',
      addressRegion: 'TX',
      postalCode: '78701',
      addressCountry: 'US',
    },
  },
  Product: {
    name: 'Premium Wireless Headphones',
    description: 'High-quality wireless headphones with noise cancellation',
    sku: 'WH-1000XM5',
    brand: { '@type': 'Brand', name: 'AudioTech' },
    image: 'https://example.com/products/headphones.jpg',
  },
  Event: {
    name: () => `Tech Conference ${new Date().getFullYear() + 1}`,
    description: 'Annual technology conference',
    startDate: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().replace(/\.\d{3}Z$/, '-07:00');
    },
    endDate: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      d.setDate(d.getDate() + 2);
      return d.toISOString().replace(/\.\d{3}Z$/, '-07:00');
    },
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  },
  Article: {
    headline: 'Understanding Schema.org Structured Data',
    description: 'A comprehensive guide to implementing schema.org markup',
    datePublished: () => new Date().toISOString().split('T')[0],
    dateModified: () => new Date().toISOString().split('T')[0],
    author: { '@type': 'Person', name: 'John Author' },
  },
  LocalBusiness: {
    name: 'Downtown Coffee Shop',
    description: 'Artisan coffee and pastries in the heart of downtown',
    telephone: '+1-555-COFFEE',
    priceRange: '$$',
    servesCuisine: 'Coffee',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main Street',
      addressLocality: 'San Francisco',
      addressRegion: 'CA',
      postalCode: '94102',
      addressCountry: 'US',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '07:00',
        closes: '19:00',
      },
    ],
  },
  Recipe: {
    name: 'Classic Chocolate Chip Cookies',
    description: 'Soft and chewy chocolate chip cookies',
    prepTime: 'PT15M',
    cookTime: 'PT12M',
    totalTime: 'PT27M',
    recipeYield: '24 cookies',
    recipeCategory: 'Dessert',
    recipeCuisine: 'American',
    datePublished: () => new Date().toISOString().split('T')[0],
  },
  WebSite: {
    name: 'Example Website',
    url: 'https://example.com',
    description: 'An example website for demonstration purposes',
    inLanguage: 'en-US',
  },
  Place: {
    name: 'Central Park',
    description: 'A large public park in New York City',
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 40.785091,
      longitude: -73.968285,
    },
  },
  FAQPage: {
    name: 'Frequently Asked Questions',
    description: 'Common questions and answers about our service',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What are your business hours?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We are open Monday through Friday, 9 AM to 5 PM.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I contact support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can reach our support team at support@example.com.',
        },
      },
    ],
  },
  BlogPosting: {
    headline: 'How to Implement Structured Data',
    description: 'A step-by-step guide to adding schema.org markup to your website',
    datePublished: () => new Date().toISOString().split('T')[0],
    dateModified: () => new Date().toISOString().split('T')[0],
    author: { '@type': 'Person', name: 'Blog Author' },
    image: 'https://example.com/blog/featured-image.jpg',
  },
};

// Nested type templates for comprehensive examples
const NESTED_TYPE_TEMPLATES: Record<string, Record<string, any>> = {
  PostalAddress: {
    '@type': 'PostalAddress',
    streetAddress: '123 Main Street',
    addressLocality: 'San Francisco',
    addressRegion: 'CA',
    postalCode: '94102',
    addressCountry: 'US',
  },
  GeoCoordinates: {
    '@type': 'GeoCoordinates',
    latitude: 37.7749,
    longitude: -122.4194,
  },
  MonetaryAmount: {
    '@type': 'MonetaryAmount',
    currency: 'USD',
    value: '99.99',
  },
  Offer: {
    '@type': 'Offer',
    price: '29.99',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: 'https://example.com/buy',
    priceValidUntil: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().split('T')[0];
    },
  },
  Rating: {
    '@type': 'Rating',
    ratingValue: '4.5',
    bestRating: '5',
    worstRating: '1',
  },
  AggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.5',
    reviewCount: '127',
    bestRating: '5',
  },
  Review: {
    '@type': 'Review',
    reviewRating: { '@type': 'Rating', ratingValue: '5' },
    author: { '@type': 'Person', name: 'Happy Customer' },
    reviewBody: 'Excellent product, highly recommended!',
    datePublished: () => new Date().toISOString().split('T')[0],
  },
  ContactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1-800-555-0123',
    contactType: 'customer service',
    availableLanguage: 'English',
  },
  ImageObject: {
    '@type': 'ImageObject',
    url: 'https://example.com/image.jpg',
    width: '1200',
    height: '800',
    caption: 'Example image',
  },
  QuantitativeValue: {
    '@type': 'QuantitativeValue',
    value: 100,
    unitCode: 'CMT',
  },
};

// Common/recommended properties for types (for filtering)
const COMMON_PROPERTIES: Record<string, string[]> = {
  Person: ['name', 'givenName', 'familyName', 'email', 'telephone', 'jobTitle', 'url', 'image', 'sameAs', 'worksFor'],
  Organization: ['name', 'url', 'logo', 'email', 'telephone', 'address', 'sameAs', 'foundingDate', 'description'],
  LocalBusiness: ['name', 'address', 'telephone', 'openingHoursSpecification', 'priceRange', 'image', 'url', 'geo', 'review', 'aggregateRating'],
  Product: ['name', 'description', 'image', 'sku', 'brand', 'offers', 'aggregateRating', 'review'],
  Event: ['name', 'startDate', 'endDate', 'location', 'description', 'image', 'eventStatus', 'eventAttendanceMode', 'organizer', 'performer'],
  Article: ['headline', 'description', 'image', 'datePublished', 'dateModified', 'author', 'publisher'],
  Recipe: ['name', 'image', 'description', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'recipeIngredient', 'recipeInstructions', 'nutrition'],
  WebSite: ['name', 'url', 'description', 'potentialAction'],
  FAQPage: ['mainEntity', 'name', 'description'],
  BlogPosting: ['headline', 'description', 'image', 'datePublished', 'dateModified', 'author', 'publisher', 'mainEntityOfPage'],
};

export class SchemaOrgClient {
  private schemaData: Map<string, any> = new Map();
  private propertyIndex: Map<string, any> = new Map();
  private enumerationIndex: Map<string, any[]> = new Map();
  private typeMatcher: FuzzyMatcher = new FuzzyMatcher();
  private propertyMatcher: FuzzyMatcher = new FuzzyMatcher();
  private initialized = false;
  private cacheManager: CacheManager;
  private offline: boolean;
  private readonly SCHEMA_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld';

  constructor(config: ClientConfig = {}) {
    this.cacheManager = new CacheManager(config);
    this.offline = config.offline || false;
  }

  async initialize() {
    if (this.initialized) {
      observability.recordWarmStart(0);
      return;
    }

    const startTime = Date.now();
    let data: any = null;
    let fromCache = false;

    // Try cache first
    const cached = await this.cacheManager.get();
    if (cached) {
      data = cached.data;
      fromCache = true;
      observability.recordCacheHit();
      console.error(`Schema.org data loaded from cache (${cached.metadata.itemCount} items, age: ${Math.round((Date.now() - cached.metadata.fetchedAt) / 1000 / 60)}min)`);
    }

    // Fetch fresh data if needed
    if (!data && !this.offline) {
      observability.recordCacheMiss();
      try {
        console.error('Fetching schema.org data...');
        const response = await axios.get(this.SCHEMA_URL, {
          headers: { 'Accept': 'application/ld+json' },
          timeout: 30000,
        });
        data = response.data;

        // Save to cache
        await this.cacheManager.set(data);
        console.error('Fresh schema.org data fetched and cached');
      } catch (error) {
        console.error('Error fetching schema.org data:', error);

        // Try stale cache as fallback
        const stale = await this.cacheManager.getStale();
        if (stale) {
          data = stale.data;
          observability.recordStaleHit();
          console.error('Using stale cache as fallback');
        } else {
          throw new Error('Unable to load schema.org data: fetch failed and no cache available');
        }
      }
    }

    if (!data) {
      throw new Error('Unable to load schema.org data: no cache available in offline mode');
    }

    // Index the data
    this.indexSchemaData(data);
    this.initialized = true;

    const duration = Date.now() - startTime;
    observability.recordColdStart(duration);
  }

  private indexSchemaData(data: any) {
    if (data['@graph']) {
      for (const item of data['@graph']) {
        if (item['@id']) {
          this.schemaData.set(item['@id'], item);

          // Index by label for easier lookup
          const label = this.extractLabel(item['rdfs:label']);
          if (label) {
            this.schemaData.set(`schema:${label}`, item);

            // Add to fuzzy matcher
            const types = this.normalizeToArray(item['@type']);
            if (types.includes('rdfs:Class')) {
              this.typeMatcher.addItem(label);
            }
          }

          // Build property index
          const types = this.normalizeToArray(item['@type']);
          if (types.includes('rdf:Property')) {
            this.propertyIndex.set(item['@id'], item);
            if (label) {
              this.propertyIndex.set(`schema:${label}`, item);
              this.propertyMatcher.addItem(label);
            }
          }

          // Build enumeration index
          if (!types.includes('rdfs:Class') && item['@type']) {
            const typeIds = this.normalizeToArray(item['@type']);
            for (const typeId of typeIds) {
              if (typeId.startsWith('schema:') && typeId !== 'schema:Enumeration') {
                const enumType = this.schemaData.get(typeId);
                if (enumType) {
                  const enumTypes = this.normalizeToArray(enumType['@type']);
                  const superTypes = this.normalizeToArray(enumType['rdfs:subClassOf']);
                  const isEnumeration = enumTypes.includes('rdfs:Class') &&
                    superTypes.some((s: any) => s['@id'] === 'schema:Enumeration');

                  if (isEnumeration) {
                    if (!this.enumerationIndex.has(typeId)) {
                      this.enumerationIndex.set(typeId, []);
                    }
                    this.enumerationIndex.get(typeId)!.push(item);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.error(`Indexed: ${this.typeMatcher.size} types, ${this.propertyMatcher.size} properties`);
  }

  private extractLabel(labelField: any): string | null {
    if (!labelField) return null;
    if (typeof labelField === 'string') return labelField;
    if (labelField['@value']) return labelField['@value'];
    return null;
  }

  /**
   * Resolve a type name with fuzzy matching
   */
  private resolveTypeName(typeName: string): string {
    // Check for alias first
    const aliased = resolveTypeAlias(typeName);

    const typeId = aliased.startsWith('schema:') ? aliased : `schema:${aliased}`;
    const type = this.schemaData.get(typeId);

    if (type) {
      return this.extractLabel(type['rdfs:label']) || aliased;
    }

    // Use fuzzy matcher
    return this.typeMatcher.resolve(typeName, 'Type');
  }

  /**
   * Resolve a property name with fuzzy matching
   */
  private resolvePropertyName(propertyName: string): string {
    const propId = propertyName.startsWith('schema:') ? propertyName : `schema:${propertyName}`;
    const prop = this.propertyIndex.get(propId);

    if (prop) {
      return this.extractLabel(prop['rdfs:label']) || propertyName;
    }

    // Use fuzzy matcher
    return this.propertyMatcher.resolve(propertyName, 'Property');
  }

  async getSchemaType(typeName: string): Promise<any> {
    await this.initialize();

    const resolvedName = this.resolveTypeName(typeName);
    const typeId = `schema:${resolvedName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    const label = this.extractLabel(type['rdfs:label']) || resolvedName;
    const comment = this.extractLabel(type['rdfs:comment']);
    const superTypes = this.extractSuperTypes(type);

    // Check for deprecation
    const supersededBy = type['schema:supersededBy'];
    const isDeprecated = !!supersededBy;

    // Determine category (extension or core)
    const isPartOf = type['schema:isPartOf']?.['@id'];
    let category = 'core';
    if (isPartOf?.includes('pending')) category = 'pending';
    else if (isPartOf?.includes('auto')) category = 'auto';
    else if (isPartOf?.includes('bib')) category = 'bib';
    else if (isPartOf?.includes('health')) category = 'health-lifesci';

    const result: any = {
      name: label,
      description: comment || 'No description available',
      id: type['@id'],
      type: type['@type'],
      superTypes,
      url: `https://schema.org/${label}`,
      category,
    };

    if (isDeprecated) {
      result.deprecated = true;
      result.supersededBy = this.extractLabel(
        this.schemaData.get(supersededBy['@id'])?.['rdfs:label']
      ) || supersededBy['@id'].replace('schema:', '');
    }

    return result;
  }

  async searchSchemas(query: string, limit: number = 10): Promise<any[]> {
    await this.initialize();

    const results: any[] = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const [key, value] of this.schemaData.entries()) {
      const types = this.normalizeToArray(value['@type']);
      if (!types.includes('rdfs:Class')) continue;

      const label = this.extractLabel(value['rdfs:label'])?.toLowerCase() || '';
      const comment = this.extractLabel(value['rdfs:comment'])?.toLowerCase() || '';

      // Calculate relevance score
      let relevance = 0;

      // Exact name match
      if (label === queryLower) relevance += 10;
      // Name starts with query
      else if (label.startsWith(queryLower)) relevance += 5;
      // Name contains query
      else if (label.includes(queryLower)) relevance += 3;

      // Word matches in name
      for (const word of queryWords) {
        if (label.includes(word)) relevance += 2;
        if (comment.includes(word)) relevance += 1;
      }

      if (relevance > 0) {
        const typeLabel = this.extractLabel(value['rdfs:label']);
        results.push({
          name: typeLabel,
          description: this.extractLabel(value['rdfs:comment']) || 'No description available',
          id: value['@id'],
          url: `https://schema.org/${typeLabel}`,
          relevance,
        });
      }

      if (results.length >= limit * 3) break;
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(({ relevance, ...rest }) => rest);
  }

  async getTypeHierarchy(typeName: string): Promise<any> {
    await this.initialize();

    const resolvedName = this.resolveTypeName(typeName);
    const typeId = `schema:${resolvedName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    const label = this.extractLabel(type['rdfs:label']) || resolvedName;

    // Get full ancestor chain
    const ancestors = this.getAncestorChain(type);

    return {
      name: label,
      id: type['@id'],
      parents: this.extractSuperTypes(type),
      children: this.findSubTypes(typeId),
      ancestors, // Full chain to Thing
      depth: ancestors.length,
    };
  }

  private getAncestorChain(type: any): any[] {
    const ancestors: any[] = [];
    const visited = new Set<string>();

    const traverse = (currentType: any) => {
      const superClasses = this.normalizeToArray(currentType['rdfs:subClassOf']);
      for (const sc of superClasses) {
        if (visited.has(sc['@id'])) continue;
        visited.add(sc['@id']);

        const superType = this.schemaData.get(sc['@id']);
        if (superType) {
          const label = this.extractLabel(superType['rdfs:label']) || sc['@id'].replace('schema:', '');
          ancestors.push({ name: label, id: sc['@id'] });
          traverse(superType);
        }
      }
    };

    traverse(type);
    return ancestors;
  }

  async getTypeProperties(
    typeName: string,
    includeInheritedOrFilter: boolean | PropertyFilter = true
  ): Promise<any[]> {
    await this.initialize();

    // Handle backwards compatibility
    let filter: PropertyFilter;
    if (typeof includeInheritedOrFilter === 'boolean') {
      filter = {
        mode: includeInheritedOrFilter ? 'all' : 'direct',
        includeDeprecated: true,
      };
    } else {
      filter = {
        mode: 'all',
        includeDeprecated: false,
        ...includeInheritedOrFilter,
      };
    }

    const resolvedName = this.resolveTypeName(typeName);
    const typeId = `schema:${resolvedName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    const properties: any[] = [];
    const processedProps = new Set<string>();

    // Get all types to check (current + ancestors if not direct-only)
    const typesToCheck = [typeId];
    if (filter.mode !== 'direct') {
      const ancestors = this.getAncestorChain(type);
      typesToCheck.push(...ancestors.map(a => a.id));
    }

    // Get common properties for this type (for sorting)
    const commonProps = COMMON_PROPERTIES[resolvedName] || [];

    for (const [key, value] of this.propertyIndex.entries()) {
      const types = this.normalizeToArray(value['@type']);
      if (!types.includes('rdf:Property')) continue;

      const domains = this.normalizeToArray(value['schema:domainIncludes']);
      const matchingDomain = domains.find((d: any) => typesToCheck.includes(d['@id']));

      if (matchingDomain) {
        if (!processedProps.has(value['@id'])) {
          processedProps.add(value['@id']);

          const propInfo = this.formatProperty(value);
          const isDirect = matchingDomain['@id'] === typeId;
          const isInherited = !isDirect;

          // Apply mode filter
          if (filter.mode === 'direct' && isInherited) continue;
          if (filter.mode === 'inherited' && isDirect) continue;

          // Apply deprecated filter
          if (!filter.includeDeprecated && propInfo.deprecated) continue;

          if (isInherited) {
            propInfo.inheritedFrom = this.extractLabel(
              this.schemaData.get(matchingDomain['@id'])?.['rdfs:label']
            ) || matchingDomain['@id'].replace('schema:', '');
          }

          // Add common property flag for sorting
          propInfo.isCommon = commonProps.includes(propInfo.name);

          properties.push(propInfo);
        }
      }
    }

    // Sort: common first, then direct, then by name
    properties.sort((a, b) => {
      // Common properties first
      if (a.isCommon && !b.isCommon) return -1;
      if (!a.isCommon && b.isCommon) return 1;
      // Direct properties before inherited
      if (a.inheritedFrom && !b.inheritedFrom) return 1;
      if (!a.inheritedFrom && b.inheritedFrom) return -1;
      return a.name.localeCompare(b.name);
    });

    // Remove isCommon from output (internal sorting only)
    properties.forEach(p => delete p.isCommon);

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit;

    if (limit) {
      return properties.slice(offset, offset + limit);
    }
    return properties.slice(offset);
  }

  async getPropertyDetails(propertyName: string): Promise<any> {
    await this.initialize();

    const resolvedName = this.resolvePropertyName(propertyName);
    const propId = `schema:${resolvedName}`;
    const prop = this.propertyIndex.get(propId);

    if (!prop) {
      throw new Error(`Property '${propertyName}' not found in schema.org`);
    }

    const label = this.extractLabel(prop['rdfs:label']) || resolvedName;
    const comment = this.extractLabel(prop['rdfs:comment']);

    const domains = this.normalizeToArray(prop['schema:domainIncludes']).map((d: any) => {
      const domainType = this.schemaData.get(d['@id']);
      return {
        name: this.extractLabel(domainType?.['rdfs:label']) || d['@id'].replace('schema:', ''),
        id: d['@id'],
      };
    });

    const ranges = this.normalizeToArray(prop['schema:rangeIncludes']).map((r: any) => {
      const rangeType = this.schemaData.get(r['@id']);
      return {
        name: this.extractLabel(rangeType?.['rdfs:label']) || r['@id'].replace('schema:', ''),
        id: r['@id'],
      };
    });

    const result: any = {
      name: label,
      description: comment || 'No description available',
      id: prop['@id'],
      url: `https://schema.org/${label}`,
      domainIncludes: domains,
      rangeIncludes: ranges,
    };

    // Check for inverse property
    if (prop['schema:inverseOf']) {
      const inverseId = prop['schema:inverseOf']['@id'];
      const inverseProp = this.propertyIndex.get(inverseId);
      result.inverseOf = this.extractLabel(inverseProp?.['rdfs:label']) || inverseId.replace('schema:', '');
    }

    // Check for deprecation
    if (prop['schema:supersededBy']) {
      result.deprecated = true;
      result.supersededBy = prop['schema:supersededBy']['@id'].replace('schema:', '');
    }

    return result;
  }

  async getEnumerationValues(enumerationType: string): Promise<any> {
    await this.initialize();

    const resolvedName = this.resolveTypeName(enumerationType);
    const typeId = `schema:${resolvedName}`;
    const enumType = this.schemaData.get(typeId);

    if (!enumType) {
      throw new Error(`Enumeration '${enumerationType}' not found in schema.org`);
    }

    // Verify it's an enumeration
    const superTypes = this.normalizeToArray(enumType['rdfs:subClassOf']);
    const isEnumeration = superTypes.some((s: any) =>
      s['@id'] === 'schema:Enumeration' || this.isSubtypeOf(s['@id'], 'schema:Enumeration')
    );

    if (!isEnumeration) {
      throw new Error(`'${enumerationType}' is not an enumeration type`);
    }

    // Find all values of this enumeration
    const values: any[] = [];
    for (const [key, value] of this.schemaData.entries()) {
      const types = this.normalizeToArray(value['@type']);
      if (types.includes(typeId)) {
        values.push({
          name: this.extractLabel(value['rdfs:label']) || key.replace('schema:', ''),
          description: this.extractLabel(value['rdfs:comment']) || 'No description',
          id: value['@id'],
          url: `https://schema.org/${this.extractLabel(value['rdfs:label']) || key.replace('schema:', '')}`,
        });
      }
    }

    return {
      enumeration: this.extractLabel(enumType['rdfs:label']) || resolvedName,
      description: this.extractLabel(enumType['rdfs:comment']) || 'No description',
      valueCount: values.length,
      values: values.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private isSubtypeOf(typeId: string, targetId: string): boolean {
    const type = this.schemaData.get(typeId);
    if (!type) return false;

    const superTypes = this.normalizeToArray(type['rdfs:subClassOf']);
    for (const st of superTypes) {
      if (st['@id'] === targetId) return true;
      if (this.isSubtypeOf(st['@id'], targetId)) return true;
    }
    return false;
  }

  async validateJsonLd(jsonld: Record<string, any>): Promise<ValidationResult> {
    await this.initialize();

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check for @context
    if (!jsonld['@context']) {
      result.warnings.push('Missing @context. Consider adding "@context": "https://schema.org"');
    }

    // Check @type
    const types = this.normalizeToArray(jsonld['@type']);
    if (types.length === 0) {
      result.errors.push('Missing @type property');
      result.valid = false;
      return result;
    }

    // Validate each type
    for (const typeName of types) {
      const typeId = typeName.startsWith('schema:') ? typeName : `schema:${typeName}`;
      const typeData = this.schemaData.get(typeId);

      if (!typeData) {
        // Try fuzzy match for suggestion
        const similar = this.typeMatcher.findSimilar(typeName, { maxSuggestions: 3 });
        if (similar.length > 0) {
          result.errors.push(`Unknown type: ${typeName}. Did you mean: ${similar.map(s => s.name).join(', ')}?`);
        } else {
          result.errors.push(`Unknown type: ${typeName}`);
        }
        result.valid = false;
        continue;
      }

      // Check for deprecated type
      if (typeData['schema:supersededBy']) {
        const replacement = typeData['schema:supersededBy']['@id'].replace('schema:', '');
        result.warnings.push(`Type '${typeName}' is deprecated. Consider using '${replacement}' instead`);
      }
    }

    // Get valid properties for the type(s)
    const validProperties = new Set<string>();
    for (const typeName of types) {
      try {
        const props = await this.getTypeProperties(typeName, { mode: 'all' });
        props.forEach(p => validProperties.add(p.name));
      } catch (e) {
        // Type validation already handled above
      }
    }

    // Validate properties
    for (const [key, value] of Object.entries(jsonld)) {
      if (key.startsWith('@')) continue; // Skip JSON-LD keywords

      if (!validProperties.has(key)) {
        const propId = `schema:${key}`;
        if (this.propertyIndex.has(propId)) {
          result.warnings.push(`Property '${key}' exists but is not typically used with type(s) ${types.join(', ')}`);
        } else {
          // Try fuzzy match
          const similar = this.propertyMatcher.findSimilar(key, { maxSuggestions: 3 });
          if (similar.length > 0) {
            result.errors.push(`Unknown property: ${key}. Did you mean: ${similar.map(s => s.name).join(', ')}?`);
          } else {
            result.errors.push(`Unknown property: ${key}`);
          }
          result.valid = false;
        }
      }

      // Check for deprecated property
      const propData = this.propertyIndex.get(`schema:${key}`);
      if (propData?.['schema:supersededBy']) {
        const replacement = propData['schema:supersededBy']['@id'].replace('schema:', '');
        result.warnings.push(`Property '${key}' is deprecated. Consider using '${replacement}' instead`);
      }
    }

    // Add suggestions for common missing properties
    const commonProps = ['name', 'description', 'url', 'image'];
    for (const prop of commonProps) {
      if (!jsonld[prop] && validProperties.has(prop)) {
        result.suggestions.push(`Consider adding '${prop}' property for better SEO`);
      }
    }

    return result;
  }

  async getRelatedTypes(typeName: string): Promise<any> {
    await this.initialize();

    const resolvedName = this.resolveTypeName(typeName);
    const typeId = `schema:${resolvedName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    const label = this.extractLabel(type['rdfs:label']) || resolvedName;

    // Types that are used as property values for this type
    const usedAsPropertyValues = new Map<string, string[]>();

    // Types that have properties pointing to this type
    const typesWithPropertiesToThis = new Map<string, string[]>();

    for (const [key, prop] of this.propertyIndex.entries()) {
      const domains = this.normalizeToArray(prop['schema:domainIncludes']);
      const ranges = this.normalizeToArray(prop['schema:rangeIncludes']);
      const propLabel = this.extractLabel(prop['rdfs:label']) || key.replace('schema:', '');

      // Check if this type uses properties that have these range types
      if (domains.some((d: any) => d['@id'] === typeId)) {
        for (const range of ranges) {
          const rangeType = this.schemaData.get(range['@id']);
          if (rangeType && this.normalizeToArray(rangeType['@type']).includes('rdfs:Class')) {
            const rangeLabel = this.extractLabel(rangeType['rdfs:label']) || range['@id'].replace('schema:', '');
            if (!usedAsPropertyValues.has(rangeLabel)) {
              usedAsPropertyValues.set(rangeLabel, []);
            }
            usedAsPropertyValues.get(rangeLabel)!.push(propLabel);
          }
        }
      }

      // Check if other types have properties that can point to this type
      if (ranges.some((r: any) => r['@id'] === typeId)) {
        for (const domain of domains) {
          const domainType = this.schemaData.get(domain['@id']);
          if (domainType && this.normalizeToArray(domainType['@type']).includes('rdfs:Class')) {
            const domainLabel = this.extractLabel(domainType['rdfs:label']) || domain['@id'].replace('schema:', '');
            if (!typesWithPropertiesToThis.has(domainLabel)) {
              typesWithPropertiesToThis.set(domainLabel, []);
            }
            typesWithPropertiesToThis.get(domainLabel)!.push(propLabel);
          }
        }
      }
    }

    return {
      type: label,
      usedAsPropertyValues: Object.fromEntries(
        Array.from(usedAsPropertyValues.entries())
          .slice(0, 20)
          .map(([type, props]) => [type, props.slice(0, 5)])
      ),
      typesWithPropertiesToThis: Object.fromEntries(
        Array.from(typesWithPropertiesToThis.entries())
          .slice(0, 20)
          .map(([type, props]) => [type, props.slice(0, 5)])
      ),
    };
  }

  async generateExample(
    typeName: string,
    style: ExampleStyle = 'standard',
    customProperties?: Record<string, any>
  ): Promise<any> {
    await this.initialize();

    const type = await this.getSchemaType(typeName);
    const properties = await this.getTypeProperties(typeName, { mode: 'all' });

    const example: any = {
      '@context': 'https://schema.org',
      '@type': type.name,
    };

    // Get pre-defined example data if available
    const templateData = EXAMPLE_DATA[type.name] || {};

    // Define property sets based on style
    const minimalProps = ['name'];
    const standardProps = ['name', 'description', 'url', 'image', 'identifier'];

    // Get template property names
    const templateProps = Object.keys(templateData);

    // For comprehensive, we'll include more properties
    let propsToInclude: string[];

    switch (style) {
      case 'minimal':
        propsToInclude = minimalProps;
        break;
      case 'comprehensive':
        // Include template properties + many relevant properties from schema
        const schemaProps = properties
          .filter(p => !p.inheritedFrom || p.inheritedFrom === 'Thing')
          .slice(0, 15)
          .map(p => p.name);
        propsToInclude = [...new Set([...templateProps, ...schemaProps])];
        break;
      case 'standard':
      default:
        // Include standard props + all template props for this type
        propsToInclude = [...new Set([...standardProps, ...templateProps])];
    }

    // Build the example
    for (const propName of propsToInclude) {
      const prop = properties.find(p => p.name === propName);
      if (!prop) continue;

      // Use template data if available
      if (templateData[propName] !== undefined) {
        const value = templateData[propName];
        // Handle dynamic values (functions)
        example[propName] = typeof value === 'function' ? value() : this.deepResolve(value);
      } else {
        // Generate example value based on expected type
        const generated = this.generateExampleValue(prop, style);
        if (generated !== undefined) {
          example[propName] = generated;
        }
      }
    }

    // Add custom properties
    if (customProperties) {
      Object.assign(example, customProperties);
    }

    return example;
  }

  /**
   * Deep resolve any function values in objects
   */
  private deepResolve(value: any): any {
    if (typeof value === 'function') {
      return value();
    }
    if (Array.isArray(value)) {
      return value.map(v => this.deepResolve(v));
    }
    if (value && typeof value === 'object') {
      const resolved: any = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.deepResolve(v);
      }
      return resolved;
    }
    return value;
  }

  // === Batch Operations ===

  /**
   * Get multiple types in a single call
   */
  async getMultipleTypes(typeNames: string[]): Promise<any[]> {
    await this.initialize();

    const results = [];
    for (const typeName of typeNames) {
      try {
        const typeInfo = await this.getSchemaType(typeName);
        results.push({ ...typeInfo, found: true });
      } catch (error: any) {
        results.push({
          name: typeName,
          found: false,
          error: error.message,
        });
      }
    }
    return results;
  }

  /**
   * Compare multiple types side by side
   */
  async compareTypes(typeNames: string[]): Promise<any> {
    await this.initialize();

    if (typeNames.length < 2) {
      throw new Error('Compare requires at least 2 types');
    }
    if (typeNames.length > 5) {
      throw new Error('Compare supports at most 5 types');
    }

    const types: any[] = [];
    const allProperties = new Map<string, Set<string>>();

    for (const typeName of typeNames) {
      const resolvedName = this.resolveTypeName(typeName);
      const typeInfo = await this.getSchemaType(resolvedName);
      const properties = await this.getTypeProperties(resolvedName, { mode: 'all', includeDeprecated: false });

      types.push({
        name: typeInfo.name,
        description: typeInfo.description,
        category: typeInfo.category,
        superTypes: typeInfo.superTypes.map((s: any) => s.name),
        propertyCount: properties.length,
      });

      for (const prop of properties) {
        if (!allProperties.has(prop.name)) {
          allProperties.set(prop.name, new Set());
        }
        allProperties.get(prop.name)!.add(typeInfo.name);
      }
    }

    // Categorize properties
    const sharedProperties: string[] = [];
    const uniqueProperties: Record<string, string[]> = {};

    for (const typeName of typeNames) {
      const resolvedName = this.resolveTypeName(typeName);
      uniqueProperties[resolvedName] = [];
    }

    for (const [propName, typeSet] of allProperties.entries()) {
      if (typeSet.size === types.length) {
        sharedProperties.push(propName);
      } else {
        for (const typeName of typeSet) {
          if (!uniqueProperties[typeName]) {
            uniqueProperties[typeName] = [];
          }
          uniqueProperties[typeName].push(propName);
        }
      }
    }

    // Limit unique properties output
    for (const typeName of Object.keys(uniqueProperties)) {
      uniqueProperties[typeName] = uniqueProperties[typeName].slice(0, 15);
    }

    return {
      types,
      sharedProperties: sharedProperties.slice(0, 20),
      uniqueProperties,
      recommendation: this.generateCompareRecommendation(types),
    };
  }

  private generateCompareRecommendation(types: any[]): string | null {
    // Simple heuristics for recommendations
    const typeNames = types.map(t => t.name);

    if (typeNames.includes('Article') && typeNames.includes('BlogPosting')) {
      return 'Use BlogPosting for blog content with clear publication dates and author. Use Article for general news or editorial content.';
    }
    if (typeNames.includes('LocalBusiness') && typeNames.includes('Organization')) {
      return 'Use LocalBusiness for physical locations with addresses. Use Organization for entities without specific physical presence.';
    }
    if (typeNames.includes('Product') && typeNames.includes('Service')) {
      return 'Use Product for tangible items that can be purchased. Use Service for intangible offerings.';
    }

    return null;
  }

  /**
   * Validate multiple JSON-LD objects
   */
  async validateJsonLdBatch(items: Record<string, any>[]): Promise<any[]> {
    await this.initialize();

    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const validation = await this.validateJsonLd(items[i]);
        results.push({
          index: i,
          ...validation,
        });
      } catch (error: any) {
        results.push({
          index: i,
          valid: false,
          errors: [error.message],
          warnings: [],
          suggestions: [],
        });
      }
    }
    return results;
  }

  // === Cache Status ===

  /**
   * Get cache status information
   */
  async getCacheStatus(): Promise<any> {
    return this.cacheManager.getStatus();
  }

  /**
   * Force cache refresh
   */
  async refreshCache(): Promise<void> {
    await this.cacheManager.clear();
    this.initialized = false;
    this.schemaData.clear();
    this.propertyIndex.clear();
    this.enumerationIndex.clear();
    this.typeMatcher.clear();
    this.propertyMatcher.clear();
    await this.initialize();
  }

  private extractSuperTypes(type: any): any[] {
    const superClasses = this.normalizeToArray(type['rdfs:subClassOf']);
    return superClasses.map((sc: any) => {
      const superType = this.schemaData.get(sc['@id']);
      return {
        name: this.extractLabel(superType?.['rdfs:label']) || sc['@id'].replace('schema:', ''),
        id: sc['@id'],
      };
    });
  }

  private findSubTypes(typeId: string): any[] {
    const subTypes: any[] = [];

    for (const [key, value] of this.schemaData.entries()) {
      const types = this.normalizeToArray(value['@type']);
      if (!types.includes('rdfs:Class')) continue;

      const superClasses = this.normalizeToArray(value['rdfs:subClassOf']);
      if (superClasses.some((sc: any) => sc['@id'] === typeId)) {
        subTypes.push({
          name: this.extractLabel(value['rdfs:label']),
          id: value['@id'],
        });
      }
    }

    return subTypes.sort((a, b) => a.name.localeCompare(b.name));
  }

  private formatProperty(prop: any): any {
    const ranges = this.normalizeToArray(prop['schema:rangeIncludes']);
    const label = this.extractLabel(prop['rdfs:label']);
    const comment = this.extractLabel(prop['rdfs:comment']);

    const result: any = {
      name: label,
      description: comment || 'No description available',
      id: prop['@id'],
      expectedTypes: ranges.map((r: any) => {
        const rangeType = this.schemaData.get(r['@id']);
        return this.extractLabel(rangeType?.['rdfs:label']) || r['@id'].replace('schema:', '');
      }),
    };

    // Check for deprecation
    if (prop['schema:supersededBy']) {
      result.deprecated = true;
      result.supersededBy = prop['schema:supersededBy']['@id'].replace('schema:', '');
    }

    return result;
  }

  private generateExampleValue(property: any, style: ExampleStyle): any {
    const primaryType = property.expectedTypes[0];
    const propName = property.name;

    // Check for nested type template
    if (NESTED_TYPE_TEMPLATES[primaryType] && style !== 'minimal') {
      return this.deepResolve({ ...NESTED_TYPE_TEMPLATES[primaryType] });
    }

    switch (primaryType) {
      case 'Text':
        return `Example ${propName}`;
      case 'URL':
        return `https://example.com/${propName.toLowerCase().replace(/\s+/g, '-')}`;
      case 'Date':
        return new Date().toISOString().split('T')[0];
      case 'DateTime':
        return new Date().toISOString();
      case 'Time':
        return '09:00:00';
      case 'Number':
      case 'Integer':
        return 42;
      case 'Float':
        return 3.14;
      case 'Boolean':
        return true;
      case 'Duration':
        return 'PT1H30M';
      case 'Language':
        return 'en';
      case 'Country':
        return 'US';

      // Handle common complex types
      case 'Person':
        return style === 'minimal'
          ? 'John Doe'
          : { '@type': 'Person', name: 'John Doe' };
      case 'Organization':
        return style === 'minimal'
          ? 'Example Organization'
          : { '@type': 'Organization', name: 'Example Organization' };
      case 'Place':
        return style === 'minimal'
          ? 'New York, NY'
          : { '@type': 'Place', name: 'New York, NY', address: this.deepResolve({ ...NESTED_TYPE_TEMPLATES.PostalAddress }) };
      case 'ImageObject':
        return style === 'minimal'
          ? 'https://example.com/image.jpg'
          : this.deepResolve({ ...NESTED_TYPE_TEMPLATES.ImageObject });
      case 'MonetaryAmount':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.MonetaryAmount });
      case 'QuantitativeValue':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.QuantitativeValue });
      case 'PostalAddress':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.PostalAddress });
      case 'GeoCoordinates':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.GeoCoordinates });
      case 'Offer':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.Offer });
      case 'Rating':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.Rating });
      case 'AggregateRating':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.AggregateRating });
      case 'Review':
        return style === 'comprehensive' ? this.deepResolve({ ...NESTED_TYPE_TEMPLATES.Review }) : undefined;
      case 'ContactPoint':
        return this.deepResolve({ ...NESTED_TYPE_TEMPLATES.ContactPoint });

      default:
        // For other types, return a simple string unless comprehensive
        if (style === 'comprehensive' && this.schemaData.has(`schema:${primaryType}`)) {
          return { '@type': primaryType, name: `Example ${primaryType}` };
        }
        return `Example ${propName}`;
    }
  }

  private normalizeToArray(value: any): any[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
}
