#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SchemaOrgClient } from './schema-org-client.js';
import { BUILD_INFO } from './build-info.js';
import { observability } from './observability.js';

const server = new McpServer({
  name: 'schema-org-mcp',
  version: BUILD_INFO.version,
});

const schemaClient = new SchemaOrgClient();

// Track registered tools for fingerprinting
const registeredTools: string[] = [];

/**
 * Wrapper to add observability to tool handlers
 */
function withObservability<T>(
  toolName: string,
  handler: (args: T) => Promise<{ content: { type: 'text'; text: string }[] }>
): (args: T) => Promise<{ content: { type: 'text'; text: string }[] }> {
  return async (args: T) => {
    const invocation = observability.startTool(toolName);
    try {
      const result = await handler(args);
      observability.endTool(invocation, true);
      return result;
    } catch (error: any) {
      observability.endTool(invocation, false, error.message);
      throw error;
    }
  };
}

/**
 * Register a tool with observability tracking
 */
function registerTool(
  name: string,
  options: { description: string; inputSchema: Record<string, z.ZodTypeAny> },
  handler: (args: any) => Promise<{ content: { type: 'text'; text: string }[] }>
) {
  registeredTools.push(name);
  server.registerTool(name, options as any, withObservability(name, handler) as any);
}

// === Operational Tools ===

// Tool: Server info (runtime fingerprint)
registerTool(
  'server_info',
  {
    description: 'Get server version, build info, and runtime fingerprint. Use this to verify which version is deployed.',
    inputSchema: {},
  },
  async () => {
    const cacheStatus = await schemaClient.getCacheStatus();
    const result = {
      server: 'schema-org-mcp',
      version: BUILD_INFO.version,
      build: {
        gitSha: BUILD_INFO.gitSha,
        gitBranch: BUILD_INFO.gitBranch,
        buildTime: BUILD_INFO.buildTime,
        nodeVersion: BUILD_INFO.nodeVersion,
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.round(process.uptime()),
      },
      tools: {
        count: registeredTools.length,
        names: registeredTools,
      },
      cache: cacheStatus,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Server stats (observability)
registerTool(
  'server_stats',
  {
    description: 'Get server performance statistics including cache hit rates, tool invocation counts, and timing.',
    inputSchema: {},
  },
  async () => {
    const stats = observability.getStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
    };
  }
);

// === Core Tools ===

// Tool: Get schema type information
registerTool(
  'get_schema_type',
  {
    description: 'Get detailed information about a schema.org type including description, parent types, and documentation URL',
    inputSchema: {
      typeName: z.string().describe('The name of the schema.org type (e.g., "Person", "Organization", "Article", "Event"). Supports fuzzy matching for typos.'),
    },
  },
  async ({ typeName }) => {
    const result = await schemaClient.getSchemaType(typeName);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Search schema types
registerTool(
  'search_schemas',
  {
    description: 'Search for schema.org types by keyword. Searches type names and descriptions.',
    inputSchema: {
      query: z.string().describe('Search query to find relevant schema types (e.g., "business", "event", "product")'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    },
  },
  async ({ query, limit }) => {
    const result = await schemaClient.searchSchemas(query, limit);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get type hierarchy
registerTool(
  'get_type_hierarchy',
  {
    description: 'Get the inheritance hierarchy for a schema.org type, showing parent types and child types',
    inputSchema: {
      typeName: z.string().describe('The name of the schema.org type'),
    },
  },
  async ({ typeName }) => {
    const result = await schemaClient.getTypeHierarchy(typeName);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get type properties with filtering
registerTool(
  'get_type_properties',
  {
    description: 'Get all properties available for a schema.org type, with expected value types. Supports filtering by mode, pagination, and deprecation status.',
    inputSchema: {
      typeName: z.string().describe('The name of the schema.org type'),
      mode: z.enum(['all', 'direct', 'inherited']).optional().default('all')
        .describe('Filter mode: all (default), direct (only this type), inherited (only from parent types)'),
      includeDeprecated: z.boolean().optional().default(false)
        .describe('Include deprecated properties (default: false)'),
      limit: z.number().optional().describe('Maximum number of properties to return'),
      offset: z.number().optional().default(0).describe('Skip this many properties (for pagination)'),
    },
  },
  async ({ typeName, mode, includeDeprecated, limit, offset }) => {
    const result = await schemaClient.getTypeProperties(typeName, {
      mode,
      includeDeprecated,
      limit,
      offset,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Generate JSON-LD example
registerTool(
  'generate_example',
  {
    description: 'Generate a comprehensive JSON-LD example for a schema.org type with realistic sample data',
    inputSchema: {
      typeName: z.string().describe('The name of the schema.org type'),
      style: z.enum(['minimal', 'standard', 'comprehensive']).optional().default('standard')
        .describe('Example detail level: minimal (just required), standard (common properties), comprehensive (many properties)'),
      customProperties: z.record(z.any()).optional().describe('Custom property values to include in the example'),
    },
  },
  async ({ typeName, style, customProperties }) => {
    const result = await schemaClient.generateExample(typeName, style, customProperties);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get property details
registerTool(
  'get_property_details',
  {
    description: 'Get detailed information about a specific schema.org property',
    inputSchema: {
      propertyName: z.string().describe('The name of the property (e.g., "name", "address", "offers"). Supports fuzzy matching.'),
    },
  },
  async ({ propertyName }) => {
    const result = await schemaClient.getPropertyDetails(propertyName);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get enumeration values
registerTool(
  'get_enumeration_values',
  {
    description: 'Get all valid values for a schema.org enumeration type (e.g., DayOfWeek, EventStatusType)',
    inputSchema: {
      enumerationType: z.string().describe('The name of the enumeration type'),
    },
  },
  async ({ enumerationType }) => {
    const result = await schemaClient.getEnumerationValues(enumerationType);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Validate JSON-LD
registerTool(
  'validate_jsonld',
  {
    description: 'Validate a JSON-LD object against schema.org vocabulary. Checks types, properties, and expected value types.',
    inputSchema: {
      jsonld: z.record(z.any()).describe('The JSON-LD object to validate'),
    },
  },
  async ({ jsonld }) => {
    const result = await schemaClient.validateJsonLd(jsonld);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get related types
registerTool(
  'get_related_types',
  {
    description: 'Find types related to a given type through properties (types that can be values of its properties, or types that have properties pointing to it)',
    inputSchema: {
      typeName: z.string().describe('The name of the schema.org type'),
    },
  },
  async ({ typeName }) => {
    const result = await schemaClient.getRelatedTypes(typeName);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// === Batch Operations ===

// Tool: Get multiple types at once
registerTool(
  'get_multiple_types',
  {
    description: 'Get information about multiple schema.org types in a single call. Useful for comparison or bulk lookups.',
    inputSchema: {
      typeNames: z.array(z.string()).describe('Array of type names to retrieve (e.g., ["Person", "Organization", "LocalBusiness"])'),
    },
  },
  async ({ typeNames }) => {
    const result = await schemaClient.getMultipleTypes(typeNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Compare types
registerTool(
  'compare_types',
  {
    description: 'Compare 2-5 schema.org types side by side. Shows shared properties, unique properties, and recommendations for when to use each.',
    inputSchema: {
      typeNames: z.array(z.string()).min(2).max(5)
        .describe('Array of 2-5 type names to compare (e.g., ["Article", "BlogPosting", "NewsArticle"])'),
    },
  },
  async ({ typeNames }) => {
    const result = await schemaClient.compareTypes(typeNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Validate multiple JSON-LD objects
registerTool(
  'validate_jsonld_batch',
  {
    description: 'Validate multiple JSON-LD objects in a single call. Returns validation results for each object.',
    inputSchema: {
      items: z.array(z.record(z.any())).describe('Array of JSON-LD objects to validate'),
    },
  },
  async ({ items }) => {
    const result = await schemaClient.validateJsonLdBatch(items);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Print runtime fingerprint
  console.error('═══════════════════════════════════════════');
  console.error(`schema-org-mcp v${BUILD_INFO.version} (${BUILD_INFO.gitSha})`);
  console.error(`Built: ${BUILD_INFO.buildTime}`);
  console.error(`Branch: ${BUILD_INFO.gitBranch}`);
  console.error(`Node: ${process.version}`);
  console.error(`Tools: ${registeredTools.length} registered`);
  console.error(`  ${registeredTools.join(', ')}`);
  console.error('═══════════════════════════════════════════');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
