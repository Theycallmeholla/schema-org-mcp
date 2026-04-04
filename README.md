# Schema.org MCP Server

An MCP (Model Context Protocol) server that provides comprehensive access to the schema.org vocabulary for structured data. This server enables AI assistants to explore types, generate JSON-LD examples, validate structured data, and navigate the complete schema.org ontology.

## v1.1.0 Features

- **Persistent Caching**: Schema.org data is cached locally with TTL-based refresh, eliminating cold start delays
- **Fuzzy Matching**: Typo-tolerant lookups with "Did you mean?" suggestions for types and properties
- **Type Aliases**: Natural language shortcuts like "blog" → BlogPosting, "faq" → FAQPage
- **Filtered Property Retrieval**: Get direct-only, inherited-only, or paginated property lists
- **Batch Operations**: Compare types, validate multiple JSON-LD objects, bulk type lookups
- **Dynamic Examples**: Generated examples use current dates and realistic data

## Core Features

- **Get Schema Type**: Retrieve detailed information about any schema.org type, including deprecation status
- **Search Schemas**: Search for schema types by keyword with relevance ranking
- **Type Hierarchy**: Explore inheritance relationships, ancestors, and children
- **Type Properties**: List all properties with expected types, including inherited properties
- **Generate Examples**: Create realistic JSON-LD examples with multiple detail levels
- **Property Details**: Get comprehensive information about specific properties
- **Enumeration Values**: Retrieve all valid values for enumeration types
- **Validate JSON-LD**: Validate structured data against schema.org vocabulary
- **Related Types**: Discover types connected through property relationships

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/schema-org-mcp.git
cd schema-org-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## Usage

### With Claude Desktop

Add this to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "schema-org": {
      "command": "node",
      "args": ["/absolute/path/to/schema-org-mcp/dist/index.js"]
    }
  }
}
```

### With npx (after publishing)

```json
{
  "mcpServers": {
    "schema-org": {
      "command": "npx",
      "args": ["schema-org-mcp"]
    }
  }
}
```

## Available Tools (14 total)

### Operational Tools

#### server_info
Get server version, build info, and runtime fingerprint. **Use this to verify which version is deployed.**

```json
{}
```

**Response includes:**
- `version`, `gitSha`, `gitBranch`, `buildTime`
- `runtime` - Node version, platform, uptime
- `tools` - Count and names of registered tools
- `cache` - Cache status

#### server_stats
Get server performance statistics including cache hit rates, tool invocation counts, and timing.

```json
{}
```

**Response includes:**
- `coldStartMs`, `warmStartMs`
- `cacheHits`, `cacheMisses`, `cacheStaleHits`
- `toolInvocations` - Per-tool count, errors, avgMs
- `uptimeMs`

### Core Tools

#### 1. get_schema_type
Get detailed information about a schema.org type. **Supports fuzzy matching for typos.**

```json
{
  "typeName": "Person"
}
```

Also works with:
- Typos: "Persn" → suggests "Person"
- Aliases: "blog" → BlogPosting, "faq" → FAQPage

**Response includes:**
- `name`, `description`, `id`, `url`
- `superTypes` - Direct parent types
- `category` - core, pending, auto, bib, or health-lifesci
- `deprecated` and `supersededBy` (if applicable)

#### 2. search_schemas
Search for schema types by keyword with relevance-based ranking.

```json
{
  "query": "local business",
  "limit": 10
}
```

#### 3. get_type_hierarchy
Get complete inheritance hierarchy including ancestors and children.

```json
{
  "typeName": "NewsArticle"
}
```

#### 4. get_type_properties
Get all properties available for a type. **Now supports filtering and pagination.**

```json
{
  "typeName": "Organization",
  "mode": "direct",
  "includeDeprecated": false,
  "limit": 20,
  "offset": 0
}
```

**Filter options:**
- `mode`: "all" (default), "direct" (only this type), "inherited" (only from parents)
- `includeDeprecated`: false (default) or true
- `limit`: Maximum properties to return
- `offset`: Skip this many properties (pagination)

#### 5. generate_example
Generate realistic JSON-LD examples. **Now uses dynamic dates.**

```json
{
  "typeName": "LocalBusiness",
  "style": "comprehensive",
  "customProperties": {
    "name": "My Coffee Shop"
  }
}
```

**Style options:**
- `minimal` - Just the name property
- `standard` - Common properties
- `comprehensive` - Many relevant properties with nested types

**Supported domain presets:**
- Person, Organization, LocalBusiness
- Product, Event, Article, BlogPosting
- Recipe, WebSite, FAQPage, Place

#### 6. get_property_details
Get comprehensive information about a specific property. **Supports fuzzy matching.**

```json
{
  "propertyName": "address"
}
```

#### 7. get_enumeration_values
Get all valid values for an enumeration type.

```json
{
  "enumerationType": "DayOfWeek"
}
```

#### 8. validate_jsonld
Validate JSON-LD structured data. **Now provides "Did you mean?" suggestions for typos.**

```json
{
  "jsonld": {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Widget",
    "nmae": "typo"
  }
}
```

**Response includes:**
- `valid` - Boolean validation result
- `errors` - Unknown types or properties (with suggestions)
- `warnings` - Deprecated types/properties, missing context
- `suggestions` - Recommended properties to add

#### 9. get_related_types
Find types connected through property relationships.

```json
{
  "typeName": "Person"
}
```

### Batch Tools (New in v1.1.0)

#### 10. get_multiple_types
Get information about multiple types in a single call.

```json
{
  "typeNames": ["Person", "Organization", "LocalBusiness"]
}
```

#### 11. compare_types
Compare 2-5 schema.org types side by side. **Includes recommendations.**

```json
{
  "typeNames": ["Article", "BlogPosting", "NewsArticle"]
}
```

**Response includes:**
- `types` - Summary of each type
- `sharedProperties` - Properties common to all types
- `uniqueProperties` - Properties unique to each type
- `recommendation` - When to use each type (for common comparisons)

#### 12. validate_jsonld_batch
Validate multiple JSON-LD objects in a single call.

```json
{
  "items": [
    { "@context": "https://schema.org", "@type": "Person", "name": "John" },
    { "@context": "https://schema.org", "@type": "Organization", "name": "Acme" }
  ]
}
```

## Example Workflows

### Finding Types for E-commerce

```
User: "What schema.org types should I use for a product page?"

1. search_schemas: {"query": "product"}
2. compare_types: {"typeNames": ["Product", "Offer", "AggregateOffer"]}
3. get_type_properties: {"typeName": "Product", "mode": "direct", "limit": 15}
4. generate_example: {"typeName": "Product", "style": "comprehensive"}
```

### Article vs BlogPosting Decision

```
User: "Should I use Article or BlogPosting?"

1. compare_types: {"typeNames": ["Article", "BlogPosting"]}
   → Returns recommendation: "Use BlogPosting for blog content with clear publication dates and author. Use Article for general news or editorial content."
```

### Validating Multiple Markup Blocks

```
User: "Validate all my schema markup"

1. validate_jsonld_batch: {"items": [...array of JSON-LD objects...]}
   → Returns per-object validation with suggestions
```

### Handling Typos

```
User: "What properties does a Perosn have?"

1. get_schema_type: {"typeName": "Perosn"}
   → Error: "Type 'Perosn' not found. Did you mean: Person, Physician, Performer?"
```

## How It Works

### Caching
The server fetches the complete schema.org vocabulary and caches it locally:
- **Location**: `~/.cache/schema-org-mcp/schema-org-data.json`
- **TTL**: 24 hours (configurable)
- **Fallback**: Uses stale cache if schema.org is unavailable
- **Memory**: Data is also cached in memory after first load

### Fuzzy Matching
When a type or property isn't found exactly:
1. Check for natural language aliases (blog → BlogPosting)
2. Try case-insensitive and normalized matching
3. Calculate similarity scores using Levenshtein distance
4. Return top 3 suggestions if score > 0.4

### Data Indexed
- ~800+ types (classes)
- ~1400+ properties
- ~80+ enumeration types with their values

## Development

```bash
# Run TypeScript compiler in watch mode
npm run dev

# Run tests (requires network access for first run)
npm test

# Build for production (generates build fingerprint)
npm run build

# Run full QA checklist
npm run qa

# Verify deployment
npm run verify
```

## Deployment

### Build with Fingerprint

Every build embeds version, git SHA, branch, and timestamp:

```bash
npm run build
# Output: Build info generated: v1.1.0 (abc1234)
```

### Verify Deployment

After deploying, verify the correct version is running:

```bash
npm run verify
# Or with explicit version:
npm run verify 1.1.0 abc1234
```

This runs canary checks:
1. Version and git SHA match
2. `compare_types` tool works
3. Fuzzy matching gives suggestions
4. FAQPage examples have mainEntity
5. Cache status is available

### Runtime Fingerprint

On startup, the server logs its fingerprint:

```
═══════════════════════════════════════════
schema-org-mcp v1.1.0 (abc1234)
Built: 2026-04-04T15:00:00.000Z
Branch: main
Node: v22.20.0
Tools: 14 registered
  server_info, server_stats, get_schema_type, ...
═══════════════════════════════════════════
```

Use `server_info` tool to check the running version programmatically.

## Configuration

The client accepts optional configuration:

```typescript
const client = new SchemaOrgClient({
  cacheDir: '/custom/cache/path',    // Default: ~/.cache/schema-org-mcp
  ttlMs: 12 * 60 * 60 * 1000,        // Default: 24 hours
  offline: false,                     // Default: false (fetch from network)
});
```

## Requirements

- Node.js >= 18.0.0
- Network access to fetch schema.org vocabulary (on first use)

## Troubleshooting

### Cold Start Still Slow
If the first request is slow, the cache might have expired. Check:
```bash
ls -la ~/.cache/schema-org-mcp/
```

### Typo Suggestions Not Working
Fuzzy matching requires the schema data to be loaded. Ensure `initialize()` completes before searching.

### Cache Issues
To force a fresh fetch, delete the cache:
```bash
rm -rf ~/.cache/schema-org-mcp/
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
