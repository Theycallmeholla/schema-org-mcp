#!/usr/bin/env node

/**
 * Example script showing how to interact with the schema.org MCP server
 * This demonstrates the tool calls that an AI assistant would make
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  // Start the MCP server
  const serverPath = new URL('../dist/index.js', import.meta.url).pathname;
  const server = spawn('node', [serverPath]);

  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client({
    name: 'schema-org-example-client',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  console.log('Connected to schema.org MCP server\n');

  // Example 1: Get information about the Person type
  console.log('Example 1: Getting Person schema type...');
  const personResult = await client.callTool('get_schema_type', {
    typeName: 'Person'
  });
  console.log(JSON.stringify(personResult, null, 2));
  console.log('\n---\n');

  // Example 2: Search for article-related schemas
  console.log('Example 2: Searching for article schemas...');
  const searchResult = await client.callTool('search_schemas', {
    query: 'article',
    limit: 5
  });
  console.log(JSON.stringify(searchResult, null, 2));
  console.log('\n---\n');

  // Example 3: Get hierarchy for NewsArticle
  console.log('Example 3: Getting NewsArticle hierarchy...');
  const hierarchyResult = await client.callTool('get_type_hierarchy', {
    typeName: 'NewsArticle'
  });
  console.log(JSON.stringify(hierarchyResult, null, 2));
  console.log('\n---\n');

  // Example 4: Get properties for Organization
  console.log('Example 4: Getting Organization properties...');
  const propertiesResult = await client.callTool('get_type_properties', {
    typeName: 'Organization',
    includeInherited: true
  });
  console.log(`Found ${propertiesResult.length} properties for Organization`);
  console.log('First 5 properties:', propertiesResult.slice(0, 5));
  console.log('\n---\n');

  // Example 5: Generate example for Recipe
  console.log('Example 5: Generating Recipe example...');
  const exampleResult = await client.callTool('generate_example', {
    typeName: 'Recipe',
    properties: {
      name: 'Chocolate Chip Cookies',
      prepTime: 'PT20M',
      cookTime: 'PT15M',
      recipeYield: '24 cookies'
    }
  });
  console.log(JSON.stringify(exampleResult, null, 2));

  await transport.close();
  server.kill();
}

main().catch(console.error);
