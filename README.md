<div align="center">

# Schema.org MCP Server

**A Model Context Protocol server for the complete schema.org vocabulary**

[![npm version](https://img.shields.io/npm/v/schema-org-mcp?style=flat-square)](https://www.npmjs.com/package/schema-org-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple?style=flat-square)](https://modelcontextprotocol.io)

Empower AI assistants to explore schema.org types, generate JSON-LD examples, validate structured data, and navigate the complete ontology with intelligent fuzzy matching and persistent caching.

[Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Documentation](#available-tools) · [Contributing](#contributing)

</div>

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
  - [Operational Tools](#operational-tools)
  - [Core Tools](#core-tools)
  - [Batch Tools](#batch-tools)
- [Example Workflows](#example-workflows)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### v1.1.0 Highlights

| Feature | Description |
|---------|-------------|
| **Persistent Caching** | Schema.org data cached locally with TTL-based refresh—no cold start delays |
| **Fuzzy Matching** | Typo-tolerant lookups with intelligent "Did you mean?" suggestions |
| **Type Aliases** | Natural language shortcuts: `blog` → BlogPosting, `faq` → FAQPage |
| **Filtered Properties** | Get direct-only, inherited-only, or paginated property lists |
| **Batch Operations** | Compare types, validate multiple JSON-LD objects, bulk lookups |
| **Dynamic Examples** | Generated examples use current dates and realistic data |

### Core Capabilities

- **Type Exploration** — Detailed information about any schema.org type with deprecation status
- **Smart Search** — Keyword search with relevance-based ranking
- **Hierarchy Navigation** — Explore inheritance relationships, ancestors, and descendants
- **Property Discovery** — List all properties with expected types, including inherited ones
- **JSON-LD Generation** — Create realistic examples at minimal, standard, or comprehensive detail levels
- **Validation** — Check structured data against the schema.org vocabulary with actionable feedback
- **Relationship Mapping** — Discover types connected through property relationships

---

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/your-org/schema-org-mcp.git
cd schema-org-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Verify the installation
npm start
```

### Install via npm (after publishing)

```bash
npm install -g schema-org-mcp
```

---

## Quick Start

### Integration with Claude Desktop

Add the server to your Claude Desktop configuration:

<table>
<tr>
<td><strong>Platform</strong></td>
<td><strong>Configuration Path</strong></td>
</tr>
<tr>
<td>macOS</td>
<td><code>~/Library/Application Support/Claude/claude_desktop_config.json</code></td>
</tr>
<tr>
<td>Windows</td>
<td><code>%APPDATA%\Claude\claude_desktop_config.json</code></td>
</tr>
</table>

**Local Installation:**

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

**Via npx:**

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

---

## Available Tools

The server provides **14 tools** organized into three categories.

### Operational Tools

#### `server_info`

Returns server version, build metadata, and runtime information. Use this to verify which version is deployed.

```json
{}
```

**Response:**
- `version`, `gitSha`, `gitBranch`, `buildTime`
- `runtime` — Node version, platform, uptime
- `tools` — Count and names of registered tools
- `cache` — Cache status

---

#### `server_stats`

Returns performance statistics including cache hit rates, tool invocation counts, and timing metrics.

```json
{}
```

**Response:**
- `coldStartMs`, `warmStartMs`
- `cacheHits`, `cacheMisses`, `cacheStaleHits`
- `toolInvocations` — Per-tool count, errors, average duration
- `uptimeMs`

---

### Core Tools

#### `get_schema_type`

Retrieve detailed information about a schema.org type. Supports fuzzy matching for typos and natural aliases.

```json
{
  "typeName": "Person"
}
```

**Also accepts:**
- Typos: `"Persn"` → suggests `Person`
- Aliases: `"blog"` → `BlogPosting`, `"faq"` → `FAQPage`

**Response:**
- `name`, `description`, `id`, `url`
- `superTypes` — Direct parent types
- `category` — `core`, `pending`, `auto`, `bib`, or `health-lifesci`
- `deprecated` and `supersededBy` (if applicable)

---

#### `search_schemas`

Search for schema types by keyword with relevance-based ranking.

```json
{
  "query": "local business",
  "limit": 10
}
```

---

#### `get_type_hierarchy`

Get complete inheritance hierarchy including ancestors and children.

```json
{
  "typeName": "NewsArticle"
}
```

---

#### `get_type_properties`

List all properties available for a type with filtering and pagination support.

```json
{
  "typeName": "Organization",
  "mode": "direct",
  "includeDeprecated": false,
  "limit": 20,
  "offset": 0
}
```

| Parameter | Options | Default |
|-----------|---------|---------|
| `mode` | `all`, `direct`, `inherited` | `all` |
| `includeDeprecated` | `true`, `false` | `false` |
| `limit` | Number | — |
| `offset` | Number | `0` |

---

#### `generate_example`

Generate realistic JSON-LD examples with dynamic dates and nested types.

```json
{
  "typeName": "LocalBusiness",
  "style": "comprehensive",
  "customProperties": {
    "name": "My Coffee Shop"
  }
}
```

| Style | Description |
|-------|-------------|
| `minimal` | Name property only |
| `standard` | Common properties |
| `comprehensive` | Full property set with nested types |

**Supported domain presets:** Person, Organization, LocalBusiness, Product, Event, Article, BlogPosting, Recipe, WebSite, FAQPage, Place

---

#### `get_property_details`

Get comprehensive information about a specific property. Supports fuzzy matching.

```json
{
  "propertyName": "address"
}
```

---

#### `get_enumeration_values`

Retrieve all valid values for an enumeration type.

```json
{
  "enumerationType": "DayOfWeek"
}
```

---

#### `validate_jsonld`

Validate JSON-LD structured data with intelligent suggestions for typos.

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

**Response:**
- `valid` — Boolean result
- `errors` — Unknown types or properties with suggestions
- `warnings` — Deprecated items, missing context
- `suggestions` — Recommended properties to add

---

#### `get_related_types`

Discover types connected through property relationships.

```json
{
  "typeName": "Person"
}
```

---

### Batch Tools

#### `get_multiple_types`

Retrieve information about multiple types in a single call.

```json
{
  "typeNames": ["Person", "Organization", "LocalBusiness"]
}
```

---

#### `compare_types`

Compare 2–5 schema.org types side by side with usage recommendations.

```json
{
  "typeNames": ["Article", "BlogPosting", "NewsArticle"]
}
```

**Response:**
- `types` — Summary of each type
- `sharedProperties` — Properties common to all
- `uniqueProperties` — Properties unique to each
- `recommendation` — When to use each type

---

#### `validate_jsonld_batch`

Validate multiple JSON-LD objects in a single call.

```json
{
  "items": [
    { "@context": "https://schema.org", "@type": "Person", "name": "John" },
    { "@context": "https://schema.org", "@type": "Organization", "name": "Acme" }
  ]
}
```

---

## Example Workflows

### E-commerce Product Page

```
1. search_schemas      → {"query": "product"}
2. compare_types       → {"typeNames": ["Product", "Offer", "AggregateOffer"]}
3. get_type_properties → {"typeName": "Product", "mode": "direct", "limit": 15}
4. generate_example    → {"typeName": "Product", "style": "comprehensive"}
```

### Article vs BlogPosting Decision

```
1. compare_types → {"typeNames": ["Article", "BlogPosting"]}

   Response includes recommendation:
   "Use BlogPosting for blog content with clear publication dates and author.
    Use Article for general news or editorial content."
```

### Bulk Markup Validation

```
1. validate_jsonld_batch → {"items": [...array of JSON-LD objects...]}

   Returns per-object validation with actionable suggestions
```

### Typo Recovery

```
1. get_schema_type → {"typeName": "Perosn"}

   Error: "Type 'Perosn' not found. Did you mean: Person, Physician, Performer?"
```

---

## How It Works

### Caching Architecture

The server fetches the complete schema.org vocabulary and implements a multi-layer cache:

| Layer | Location | Behavior |
|-------|----------|----------|
| Memory | Runtime | Instant access after first load |
| Disk | `~/.cache/schema-org-mcp/schema-org-data.json` | Persists across restarts |

- **TTL:** 24 hours (configurable)
- **Fallback:** Uses stale cache if schema.org is unavailable

### Fuzzy Matching Pipeline

1. Check natural language aliases (`blog` → `BlogPosting`)
2. Attempt case-insensitive and normalized matching
3. Calculate similarity scores using Levenshtein distance
4. Return top 3 suggestions if score > 0.4

### Indexed Data

| Category | Count |
|----------|-------|
| Types (classes) | ~800+ |
| Properties | ~1,400+ |
| Enumeration types | ~80+ |

---

## Configuration

The client accepts optional configuration parameters:

```typescript
const client = new SchemaOrgClient({
  cacheDir: '/custom/cache/path',    // Default: ~/.cache/schema-org-mcp
  ttlMs: 12 * 60 * 60 * 1000,        // Default: 24 hours
  offline: false,                     // Default: false
});
```

---

## Development

```bash
# Watch mode for development
npm run dev

# Run the test suite
npm test

# Build for production (generates build fingerprint)
npm run build

# Run full QA checklist
npm run qa

# Verify deployment
npm run verify
```

---

## Deployment

### Build with Fingerprint

Every build embeds version metadata for traceability:

```bash
npm run build
# Output: Build info generated: v1.1.0 (abc1234)
```

### Verify Deployment

Confirm the correct version is running:

```bash
npm run verify

# Or with explicit version:
npm run verify 1.1.0 abc1234
```

**Verification checks:**
1. Version and git SHA match
2. `compare_types` tool responds correctly
3. Fuzzy matching returns suggestions
4. FAQPage examples include `mainEntity`
5. Cache status is available

### Runtime Fingerprint

On startup, the server logs its identity:

```
═══════════════════════════════════════════
schema-org-mcp v1.1.0 (abc1234)
Built: 2025-04-04T15:00:00.000Z
Branch: main
Node: v22.20.0
Tools: 14 registered
  server_info, server_stats, get_schema_type, ...
═══════════════════════════════════════════
```

Use the `server_info` tool to check the running version programmatically.

---

## Troubleshooting

### Slow Cold Start

If the first request is slow, the cache may have expired:

```bash
ls -la ~/.cache/schema-org-mcp/
```

### Fuzzy Suggestions Not Appearing

Ensure schema data is fully loaded. The `initialize()` method must complete before fuzzy matching works.

### Force Cache Refresh

Delete the cache directory to fetch fresh data:

```bash
rm -rf ~/.cache/schema-org-mcp/
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure all tests pass before submitting.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[Back to Top](#schema-org-mcp-server)**

</div>
