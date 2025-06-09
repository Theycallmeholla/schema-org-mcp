#!/bin/bash

echo "🚀 Setting up Schema.org MCP Server..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

echo "✅ Setup complete!"
echo ""
echo "To use with Claude Desktop:"
echo "1. Add the following to your Claude Desktop config:"
echo "   Location: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo ""
echo "{"
echo "  \"mcpServers\": {"
echo "    \"schema-org\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$(pwd)/dist/index.js\"]"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "2. Restart Claude Desktop"
echo ""
echo "To test the server directly:"
echo "npm start"
