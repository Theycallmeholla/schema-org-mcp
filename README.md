# Schema.org MCP Server

An MCP (Model Context Protocol) server that provides access to schema.org vocabulary for structured data.

## Features

- **Get Schema Type**: Retrieve detailed information about any schema.org type
- **Search Schemas**: Search for schema types by keyword
- **Type Hierarchy**: Explore inheritance relationships between types
- **Type Properties**: List all properties available for a type (including inherited)
- **Generate Examples**: Create example JSON-LD for any schema type

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/schema-org-mcp.git
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

Add this to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "schema-org": {
      "command": "node",
      "args": ["/path/to/schema-org-mcp/dist/index.js"]
    }
  }
}
```

### Available Tools

#### 1. get_schema_type
Get detailed information about a schema.org type.

```json
{
  "typeName": "Person"
}
```

#### 2. search_schemas
Search for schema types by keyword.

```json
{
  "query": "article",
  "limit": 10
}
```

#### 3. get_type_hierarchy
Get the inheritance hierarchy for a type.

```json
{
  "typeName": "NewsArticle"
}
```

#### 4. get_type_properties
Get all properties available for a type.

```json
{
  "typeName": "Organization",
  "includeInherited": true
}
```

#### 5. generate_example
Generate an example JSON-LD for a type.

```json
{
  "typeName": "Recipe",
  "properties": {
    "name": "Chocolate Chip Cookies",
    "prepTime": "PT20M"
  }
}
```

## Development

```bash
# Run TypeScript compiler in watch mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## How It Works

The server downloads and caches the complete schema.org vocabulary in JSON-LD format. It then provides various tools to:

1. Query type definitions and their properties
2. Navigate the type hierarchy
3. Generate valid JSON-LD examples
4. Search through the entire vocabulary

The data is fetched from the official schema.org JSON-LD file and indexed in memory for fast access.

## Examples

### Finding Types for a Website

```
User: "What schema types should I use for a blog post?"

Assistant uses: search_schemas with query "blog"
Then: get_type_hierarchy for "BlogPosting"
Finally: generate_example for "BlogPosting"
```

### Understanding Type Properties

```
User: "What properties can I use for a Product?"

Assistant uses: get_type_properties for "Product" with includeInherited: true
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
