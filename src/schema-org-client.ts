import axios from 'axios';

interface SchemaType {
  '@id': string;
  '@type': string | string[];
  'rdfs:label': string;
  'rdfs:comment'?: string;
  'rdfs:subClassOf'?: { '@id': string } | { '@id': string }[];
  [key: string]: any;
}

interface SchemaProperty {
  '@id': string;
  '@type': string;
  'rdfs:label': string;
  'rdfs:comment'?: string;
  'schema:domainIncludes'?: { '@id': string } | { '@id': string }[];
  'schema:rangeIncludes'?: { '@id': string } | { '@id': string }[];
}

export class SchemaOrgClient {
  private schemaData: Map<string, any> = new Map();
  private initialized = false;
  private readonly SCHEMA_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld';

  async initialize() {
    if (this.initialized) return;

    try {
      console.error('Fetching schema.org data...');
      const response = await axios.get(this.SCHEMA_URL);
      const data = response.data;

      // Index all types and properties by their @id
      if (data['@graph']) {
        for (const item of data['@graph']) {
          if (item['@id']) {
            this.schemaData.set(item['@id'], item);
            // Also index by label for easier lookup
            if (item['rdfs:label']) {
              this.schemaData.set(`schema:${item['rdfs:label']}`, item);
            }
          }
        }
      }

      this.initialized = true;
      console.error('Schema.org data loaded successfully');
    } catch (error) {
      console.error('Error loading schema.org data:', error);
      throw error;
    }
  }

  async getSchemaType(typeName: string): Promise<any> {
    await this.initialize();

    const typeId = typeName.startsWith('schema:') ? typeName : `schema:${typeName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    // Clean up the response
    return {
      name: type['rdfs:label'] || typeName,
      description: type['rdfs:comment'] || 'No description available',
      id: type['@id'],
      type: type['@type'],
      superTypes: this.extractSuperTypes(type),
      url: `https://schema.org/${type['rdfs:label'] || typeName}`,
    };
  }

  async searchSchemas(query: string, limit: number = 10): Promise<any[]> {
    await this.initialize();

    const results: any[] = [];
    const queryLower = query.toLowerCase();

    for (const [key, value] of this.schemaData.entries()) {
      if (!value['@type'] || !Array.isArray(value['@type'])) continue;
      if (!value['@type'].includes('rdfs:Class')) continue;

      const label = value['rdfs:label']?.toLowerCase() || '';
      const comment = value['rdfs:comment']?.toLowerCase() || '';

      if (label.includes(queryLower) || comment.includes(queryLower)) {
        results.push({
          name: value['rdfs:label'],
          description: value['rdfs:comment'] || 'No description available',
          id: value['@id'],
          url: `https://schema.org/${value['rdfs:label']}`,
          relevance: label.includes(queryLower) ? 2 : 1,
        });
      }

      if (results.length >= limit * 2) break; // Get more to sort by relevance
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(({ relevance, ...rest }) => rest);
  }

  async getTypeHierarchy(typeName: string): Promise<any> {
    await this.initialize();

    const typeId = typeName.startsWith('schema:') ? typeName : `schema:${typeName}`;
    const type = this.schemaData.get(typeId);

    if (!type) {
      throw new Error(`Type '${typeName}' not found in schema.org`);
    }

    const hierarchy = {
      name: type['rdfs:label'] || typeName,
      id: type['@id'],
      parents: this.extractSuperTypes(type),
      children: this.findSubTypes(typeId),
    };

    return hierarchy;
  }

  async getTypeProperties(typeName: string, includeInherited: boolean = true): Promise<any[]> {
    await this.initialize();

    const typeId = typeName.startsWith('schema:') ? typeName : `schema:${typeName}`;
    const properties: any[] = [];
    const processedProps = new Set<string>();

    // Get direct properties
    for (const [key, value] of this.schemaData.entries()) {
      if (!value['@type'] || !value['@type'].includes('rdf:Property')) continue;

      const domains = this.normalizeToArray(value['schema:domainIncludes']);
      if (domains.some((d: any) => d['@id'] === typeId)) {
        if (!processedProps.has(value['@id'])) {
          processedProps.add(value['@id']);
          properties.push(this.formatProperty(value));
        }
      }
    }

    // Get inherited properties if requested
    if (includeInherited) {
      const type = this.schemaData.get(typeId);
      if (type) {
        const superTypes = this.extractSuperTypes(type);
        for (const superType of superTypes) {
          const superTypeId = superType.id;
          for (const [key, value] of this.schemaData.entries()) {
            if (!value['@type'] || !value['@type'].includes('rdf:Property')) continue;

            const domains = this.normalizeToArray(value['schema:domainIncludes']);
            if (domains.some((d: any) => d['@id'] === superTypeId)) {
              if (!processedProps.has(value['@id'])) {
                processedProps.add(value['@id']);
                properties.push({
                  ...this.formatProperty(value),
                  inheritedFrom: superType.name,
                });
              }
            }
          }
        }
      }
    }

    return properties.sort((a, b) => a.name.localeCompare(b.name));
  }

  async generateExample(typeName: string, customProperties?: Record<string, any>): Promise<any> {
    await this.initialize();

    const type = await this.getSchemaType(typeName);
    const properties = await this.getTypeProperties(typeName, false);

    const example: any = {
      '@context': 'https://schema.org',
      '@type': type.name,
    };

    // Add common properties
    const commonProps = ['name', 'description', 'url', 'identifier', 'image'];
    
    for (const prop of properties) {
      if (commonProps.includes(prop.name)) {
        example[prop.name] = this.generateExampleValue(prop);
      }
    }

    // Add custom properties
    if (customProperties) {
      Object.assign(example, customProperties);
    }

    return example;
  }

  private extractSuperTypes(type: any): any[] {
    const superClasses = this.normalizeToArray(type['rdfs:subClassOf']);
    return superClasses.map((sc: any) => {
      const superType = this.schemaData.get(sc['@id']);
      return {
        name: superType?.['rdfs:label'] || sc['@id'].replace('schema:', ''),
        id: sc['@id'],
      };
    });
  }

  private findSubTypes(typeId: string): any[] {
    const subTypes: any[] = [];

    for (const [key, value] of this.schemaData.entries()) {
      if (!value['@type'] || !Array.isArray(value['@type'])) continue;
      if (!value['@type'].includes('rdfs:Class')) continue;

      const superClasses = this.normalizeToArray(value['rdfs:subClassOf']);
      if (superClasses.some((sc: any) => sc['@id'] === typeId)) {
        subTypes.push({
          name: value['rdfs:label'],
          id: value['@id'],
        });
      }
    }

    return subTypes;
  }

  private formatProperty(prop: any): any {
    const ranges = this.normalizeToArray(prop['schema:rangeIncludes']);
    
    return {
      name: prop['rdfs:label'],
      description: prop['rdfs:comment'] || 'No description available',
      id: prop['@id'],
      expectedTypes: ranges.map((r: any) => {
        const rangeType = this.schemaData.get(r['@id']);
        return rangeType?.['rdfs:label'] || r['@id'].replace('schema:', '');
      }),
    };
  }

  private generateExampleValue(property: any): any {
    const type = property.expectedTypes[0];
    
    switch (type) {
      case 'Text':
        return `Example ${property.name}`;
      case 'URL':
        return 'https://example.com';
      case 'Date':
        return '2024-01-01';
      case 'DateTime':
        return '2024-01-01T12:00:00Z';
      case 'Number':
      case 'Integer':
        return 42;
      case 'Boolean':
        return true;
      case 'ImageObject':
        return {
          '@type': 'ImageObject',
          url: 'https://example.com/image.jpg',
          contentUrl: 'https://example.com/image.jpg',
        };
      default:
        return `Example ${property.name}`;
    }
  }

  private normalizeToArray(value: any): any[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
}
