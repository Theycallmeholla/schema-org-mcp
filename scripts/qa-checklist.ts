#!/usr/bin/env npx ts-node
/**
 * Post-implementation QA checklist for schema-org-mcp v1.1
 * Tests real behavior, not just code paths
 */

import { SchemaOrgClient } from '../src/schema-org-client.js';
import { CacheManager } from '../src/cache-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.cache', 'schema-org-mcp');

interface QAResult {
  section: string;
  test: string;
  passed: boolean;
  details: string;
  duration?: number;
}

const results: QAResult[] = [];

function log(section: string, test: string, passed: boolean, details: string, duration?: number) {
  const icon = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  const timeStr = duration ? ` (${duration}ms)` : '';
  console.log(`${color}${icon}${reset} [${section}] ${test}${timeStr}`);
  if (!passed) {
    console.log(`   ${details}`);
  }
  results.push({ section, test, passed, details, duration });
}

async function section1_StartupAndCaching() {
  console.log('\n═══════════════════════════════════════════');
  console.log('1. STARTUP AND CACHING');
  console.log('═══════════════════════════════════════════\n');

  // Check if cache exists
  const cacheExists = fs.existsSync(path.join(CACHE_DIR, 'schema-org-data.json'));
  log('Caching', 'Cache directory exists', cacheExists, `Path: ${CACHE_DIR}`);

  // Test warm start (cache hit)
  const client1 = new SchemaOrgClient();
  const start1 = Date.now();
  await client1.getSchemaType('Person');
  const warmTime = Date.now() - start1;
  log('Caching', 'Warm start from cache', warmTime < 500, `First call took ${warmTime}ms (should be <500ms with cache)`, warmTime);

  // Test cache status
  const status = await client1.getCacheStatus();
  log('Caching', 'Cache status reports correctly', status.exists === true, JSON.stringify(status));

  // Test second call (memory cache)
  const start2 = Date.now();
  await client1.getSchemaType('Organization');
  const memTime = Date.now() - start2;
  log('Caching', 'Memory cache fast', memTime < 50, `Second call took ${memTime}ms (should be <50ms)`, memTime);

  // New client instance should still use disk cache
  const client2 = new SchemaOrgClient();
  const start3 = Date.now();
  await client2.getSchemaType('Event');
  const diskTime = Date.now() - start3;
  log('Caching', 'New instance uses disk cache', diskTime < 500, `New instance took ${diskTime}ms`, diskTime);
}

async function section2_LookupResilience() {
  console.log('\n═══════════════════════════════════════════');
  console.log('2. LOOKUP RESILIENCE');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();
  await client.getSchemaType('Thing'); // Initialize

  // Type lookup tests
  console.log('\n--- Type Lookups ---\n');

  // Exact canonical
  try {
    const person = await client.getSchemaType('Person');
    log('Types', 'Exact canonical (Person)', person.name === 'Person', `Got: ${person.name}`);
  } catch (e: any) {
    log('Types', 'Exact canonical (Person)', false, e.message);
  }

  // Lowercase
  try {
    const person = await client.getSchemaType('person');
    log('Types', 'Lowercase (person)', person.name === 'Person', `Got: ${person.name}`);
  } catch (e: any) {
    log('Types', 'Lowercase (person)', false, e.message);
  }

  // Typo with suggestion
  try {
    await client.getSchemaType('Persn');
    log('Types', 'Typo (Persn) gives suggestion', false, 'Should have thrown with suggestion');
  } catch (e: any) {
    const hasSuggestion = e.message.includes('Did you mean');
    log('Types', 'Typo (Persn) gives suggestion', hasSuggestion, e.message);
  }

  // Plural
  try {
    const article = await client.getSchemaType('Articles');
    log('Types', 'Plural (Articles)', article.name === 'Article', `Got: ${article.name}`);
  } catch (e: any) {
    // Might not resolve - check if it suggests
    const suggests = e.message.includes('Article');
    log('Types', 'Plural (Articles)', suggests, e.message);
  }

  // Alias
  try {
    const blog = await client.getSchemaType('blog');
    log('Types', 'Alias (blog → BlogPosting)', blog.name === 'BlogPosting', `Got: ${blog.name}`);
  } catch (e: any) {
    log('Types', 'Alias (blog → BlogPosting)', false, e.message);
  }

  try {
    const faq = await client.getSchemaType('faq');
    log('Types', 'Alias (faq → FAQPage)', faq.name === 'FAQPage', `Got: ${faq.name}`);
  } catch (e: any) {
    log('Types', 'Alias (faq → FAQPage)', false, e.message);
  }

  // Totally invalid
  try {
    await client.getSchemaType('asldkfj');
    log('Types', 'Invalid type fails clearly', false, 'Should have thrown');
  } catch (e: any) {
    const clearFailure = e.message.includes('not found') || e.message.includes('Unknown');
    log('Types', 'Invalid type fails clearly', clearFailure, e.message);
  }

  // Property lookup tests
  console.log('\n--- Property Lookups ---\n');

  try {
    const name = await client.getPropertyDetails('name');
    log('Properties', 'Exact property (name)', name.name === 'name', `Got: ${name.name}`);
  } catch (e: any) {
    log('Properties', 'Exact property (name)', false, e.message);
  }

  try {
    await client.getPropertyDetails('nmae');
    log('Properties', 'Typo (nmae) gives suggestion', false, 'Should have thrown');
  } catch (e: any) {
    const hasSuggestion = e.message.includes('Did you mean') && e.message.includes('name');
    log('Properties', 'Typo (nmae) gives suggestion', hasSuggestion, e.message);
  }
}

async function section3_OutputUsefulness() {
  console.log('\n═══════════════════════════════════════════');
  console.log('3. OUTPUT USEFULNESS');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();

  // Type detail output
  const person = await client.getSchemaType('Person');
  const hasEssentials = person.name && person.description && person.url && person.superTypes;
  log('Output', 'Type detail has essentials', hasEssentials,
    `Keys: ${Object.keys(person).join(', ')}`);

  // Property filtering
  console.log('\n--- Property Filtering ---\n');

  const allProps = await client.getTypeProperties('LocalBusiness', { mode: 'all' });
  const directProps = await client.getTypeProperties('LocalBusiness', { mode: 'direct' });
  const inheritedProps = await client.getTypeProperties('LocalBusiness', { mode: 'inherited' });

  log('Properties', 'All mode returns most', allProps.length > directProps.length,
    `all: ${allProps.length}, direct: ${directProps.length}`);
  log('Properties', 'Direct mode excludes inherited', directProps.every(p => !p.inheritedFrom),
    `Direct props with inheritedFrom: ${directProps.filter(p => p.inheritedFrom).length}`);
  log('Properties', 'Inherited mode only has inherited', inheritedProps.every(p => p.inheritedFrom),
    `All have inheritedFrom: ${inheritedProps.length}`);

  // Deprecated filtering
  const withDep = await client.getTypeProperties('Organization', { includeDeprecated: true });
  const withoutDep = await client.getTypeProperties('Organization', { includeDeprecated: false });
  log('Properties', 'Deprecated filter works', withDep.length >= withoutDep.length,
    `With: ${withDep.length}, Without: ${withoutDep.length}`);

  // Pagination
  console.log('\n--- Pagination ---\n');

  const page1 = await client.getTypeProperties('Person', { limit: 5, offset: 0 });
  const page2 = await client.getTypeProperties('Person', { limit: 5, offset: 5 });
  const page3 = await client.getTypeProperties('Person', { limit: 5, offset: 0 }); // Same as page1

  log('Pagination', 'Limit works', page1.length === 5, `Got ${page1.length} items`);
  log('Pagination', 'Offset works', page1[0].name !== page2[0].name,
    `Page1[0]: ${page1[0].name}, Page2[0]: ${page2[0].name}`);
  log('Pagination', 'Results are stable', page1[0].name === page3[0].name,
    `Repeated call same: ${page1[0].name} === ${page3[0].name}`);
}

async function section4_Workflows() {
  console.log('\n═══════════════════════════════════════════');
  console.log('4. WORKFLOW TESTING');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();

  // Workflow A: Discover and inspect
  console.log('\n--- Workflow A: Discover and Inspect ---\n');

  const searchResults = await client.searchSchemas('event', 5);
  log('Workflow A', 'Search returns results', searchResults.length > 0,
    `Found ${searchResults.length} results`);

  const eventType = await client.getSchemaType(searchResults[0].name);
  log('Workflow A', 'Inspect found type', eventType.name === searchResults[0].name,
    `Inspected: ${eventType.name}`);

  // Note: Some types (like Event) have no direct properties - they inherit everything
  // This is valid behavior, not an error. Test with 'all' mode for workflow continuity.
  const eventProps = await client.getTypeProperties(eventType.name, { mode: 'all', limit: 10 });
  log('Workflow A', 'Get properties (limited)', eventProps.length > 0 && eventProps.length <= 10,
    `Got ${eventProps.length} properties (limit 10)`);

  if (eventProps.length > 0) {
    const propDetail = await client.getPropertyDetails(eventProps[0].name);
    log('Workflow A', 'Inspect property detail', propDetail.name === eventProps[0].name,
      `Property: ${propDetail.name}`);
  }

  // Workflow B: Generate and validate
  console.log('\n--- Workflow B: Generate and Validate ---\n');

  const example = await client.generateExample('Product', 'standard');
  log('Workflow B', 'Generate example', example['@type'] === 'Product',
    `Generated ${example['@type']}`);

  const validation = await client.validateJsonLd(example);
  log('Workflow B', 'Validate generated example', validation.valid,
    `Valid: ${validation.valid}, Errors: ${validation.errors.length}`);

  // Introduce an error
  const badExample = { ...example, nmae: 'typo', unknownField: 'test' };
  delete (badExample as any).name;
  const badValidation = await client.validateJsonLd(badExample);
  log('Workflow B', 'Detect errors in bad example', !badValidation.valid,
    `Errors: ${badValidation.errors.join('; ')}`);

  // Workflow C: Compare types
  console.log('\n--- Workflow C: Compare Types ---\n');

  const comparison = await client.compareTypes(['Article', 'BlogPosting']);
  log('Workflow C', 'Compare returns types', comparison.types.length === 2,
    `Compared ${comparison.types.length} types`);
  log('Workflow C', 'Has shared properties', comparison.sharedProperties.length > 0,
    `${comparison.sharedProperties.length} shared properties`);
  log('Workflow C', 'Has unique properties', Object.keys(comparison.uniqueProperties).length === 2,
    `Unique for each type`);
  log('Workflow C', 'Has recommendation', !!comparison.recommendation,
    `Recommendation: ${comparison.recommendation?.substring(0, 50)}...`);

  // Workflow D: Batch validation
  console.log('\n--- Workflow D: Batch Validation ---\n');

  const batchItems = [
    { '@context': 'https://schema.org', '@type': 'Person', name: 'John Doe' }, // valid
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme Inc' }, // valid
    { '@type': 'Person', nmae: 'typo' }, // invalid - missing context, typo
    { '@context': 'https://schema.org', '@type': 'InvalidType123' }, // invalid type
  ];

  const batchResults = await client.validateJsonLdBatch(batchItems);
  log('Workflow D', 'Batch returns per-item results', batchResults.length === 4,
    `Got ${batchResults.length} results`);
  log('Workflow D', 'Valid items pass', batchResults[0].valid && batchResults[1].valid,
    `Item 0: ${batchResults[0].valid}, Item 1: ${batchResults[1].valid}`);
  log('Workflow D', 'Invalid items fail with errors', !batchResults[2].valid && batchResults[2].errors.length > 0,
    `Item 2 errors: ${batchResults[2].errors.length}`);
  log('Workflow D', 'Results include index', batchResults.every((r, i) => r.index === i),
    'All have correct index');
}

async function section5_ExampleQuality() {
  console.log('\n═══════════════════════════════════════════');
  console.log('5. EXAMPLE QUALITY');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();
  const currentYear = new Date().getFullYear();
  const typesToTest = ['Organization', 'Person', 'Product', 'Event', 'FAQPage', 'BlogPosting', 'LocalBusiness'];

  for (const typeName of typesToTest) {
    const example = await client.generateExample(typeName, 'standard');

    // Basic structure
    const hasContext = example['@context'] === 'https://schema.org';
    const hasType = example['@type'] === typeName;
    const hasName = !!example.name;

    log('Examples', `${typeName} has proper structure`, hasContext && hasType && hasName,
      `context: ${hasContext}, type: ${hasType}, name: ${hasName}`);

    // Check for dynamic dates where applicable
    if (typeName === 'Event') {
      const hasCurrentYear = JSON.stringify(example).includes(String(currentYear));
      log('Examples', `${typeName} has dynamic dates`, hasCurrentYear,
        `Contains ${currentYear}: ${hasCurrentYear}`);
    }

    // Check nested types
    if (typeName === 'LocalBusiness' || typeName === 'Organization') {
      const hasNestedAddress = example.address && typeof example.address === 'object' && example.address['@type'];
      log('Examples', `${typeName} has nested address`, !!hasNestedAddress,
        `Address type: ${example.address?.['@type'] || 'none'}`);
    }

    // FAQPage specific
    if (typeName === 'FAQPage') {
      const hasMainEntity = Array.isArray(example.mainEntity) && example.mainEntity.length > 0;
      log('Examples', `${typeName} has mainEntity array`, hasMainEntity,
        `mainEntity count: ${example.mainEntity?.length || 0}`);
    }
  }
}

async function section6_ErrorQuality() {
  console.log('\n═══════════════════════════════════════════');
  console.log('6. ERROR QUALITY');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();
  await client.getSchemaType('Person'); // Initialize

  const errorTests = [
    { name: 'Type not found', fn: () => client.getSchemaType('NotARealType123'),
      expect: 'not found' },
    { name: 'Property not found', fn: () => client.getPropertyDetails('notarealprop'),
      expect: 'not found' },
    { name: 'Compare too few types', fn: () => client.compareTypes(['Person']),
      expect: 'at least 2' },
    { name: 'Compare too many types', fn: () => client.compareTypes(['A', 'B', 'C', 'D', 'E', 'F']),
      expect: 'at most 5' },
    { name: 'Non-enumeration type', fn: () => client.getEnumerationValues('Person'),
      expect: 'not an enumeration' },
  ];

  for (const test of errorTests) {
    try {
      await test.fn();
      log('Errors', test.name, false, 'Should have thrown');
    } catch (e: any) {
      const hasExpected = e.message.toLowerCase().includes(test.expect.toLowerCase());
      log('Errors', test.name, hasExpected, e.message);
    }
  }

  // Validation errors
  console.log('\n--- Validation Errors ---\n');

  const validationTests = [
    { name: 'Missing @type', input: { '@context': 'https://schema.org', name: 'Test' },
      expectError: '@type' },
    { name: 'Missing @context warns', input: { '@type': 'Person', name: 'Test' },
      expectWarning: '@context' },
    { name: 'Unknown property suggests', input: { '@context': 'https://schema.org', '@type': 'Person', nmae: 'Test' },
      expectError: 'Did you mean' },
  ];

  for (const test of validationTests) {
    const result = await client.validateJsonLd(test.input);

    if (test.expectError) {
      const hasError = result.errors.some(e => e.includes(test.expectError));
      log('Validation', test.name, hasError, `Errors: ${result.errors.join('; ')}`);
    }
    if (test.expectWarning) {
      const hasWarning = result.warnings.some(w => w.includes(test.expectWarning));
      log('Validation', test.name, hasWarning, `Warnings: ${result.warnings.join('; ')}`);
    }
  }
}

async function section7_Determinism() {
  console.log('\n═══════════════════════════════════════════');
  console.log('7. DETERMINISM AND CONSISTENCY');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();

  // Same input, same output
  const type1 = await client.getSchemaType('Person');
  const type2 = await client.getSchemaType('Person');
  log('Determinism', 'Type lookup consistent', JSON.stringify(type1) === JSON.stringify(type2),
    'Same type returns identical result');

  // Pagination stability
  const props1 = await client.getTypeProperties('Organization', { limit: 10, offset: 0 });
  const props2 = await client.getTypeProperties('Organization', { limit: 10, offset: 0 });
  log('Determinism', 'Pagination stable',
    props1.map(p => p.name).join(',') === props2.map(p => p.name).join(','),
    'Same pagination returns same order');

  // Compare stability
  const compare1 = await client.compareTypes(['Article', 'BlogPosting']);
  const compare2 = await client.compareTypes(['Article', 'BlogPosting']);
  log('Determinism', 'Compare stable',
    compare1.sharedProperties.length === compare2.sharedProperties.length,
    `Shared props: ${compare1.sharedProperties.length} vs ${compare2.sharedProperties.length}`);

  // Fuzzy matching stability
  try {
    await client.getSchemaType('Persn');
  } catch (e1: any) {
    try {
      await client.getSchemaType('Persn');
    } catch (e2: any) {
      log('Determinism', 'Fuzzy suggestions stable', e1.message === e2.message,
        'Same typo gives same suggestions');
    }
  }
}

async function section8_BackwardCompatibility() {
  console.log('\n═══════════════════════════════════════════');
  console.log('8. BACKWARD COMPATIBILITY');
  console.log('═══════════════════════════════════════════\n');

  const client = new SchemaOrgClient();

  // Boolean parameter still works
  const withInherited = await client.getTypeProperties('LocalBusiness', true);
  const withoutInherited = await client.getTypeProperties('LocalBusiness', false);

  log('Compat', 'Boolean param (true) works', withInherited.length > 0,
    `Got ${withInherited.length} properties with inherited`);
  log('Compat', 'Boolean param (false) works', withoutInherited.length > 0,
    `Got ${withoutInherited.length} properties without inherited`);
  log('Compat', 'Boolean true > false', withInherited.length > withoutInherited.length,
    `${withInherited.length} > ${withoutInherited.length}`);
}

async function printSummary() {
  console.log('\n═══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total} tests`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  console.log(`Pass rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n--- Failed Tests ---\n');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`✗ [${r.section}] ${r.test}`);
      console.log(`   ${r.details}`);
    });
  }

  // Category breakdown
  console.log('\n--- By Category ---\n');
  const bySection: Record<string, { passed: number; total: number }> = {};
  results.forEach(r => {
    if (!bySection[r.section]) bySection[r.section] = { passed: 0, total: 0 };
    bySection[r.section].total++;
    if (r.passed) bySection[r.section].passed++;
  });

  Object.entries(bySection).forEach(([section, stats]) => {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    const icon = stats.passed === stats.total ? '✓' : '○';
    console.log(`${icon} ${section}: ${stats.passed}/${stats.total} (${pct}%)`);
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  schema-org-mcp v1.1 QA Checklist         ║');
  console.log('╚═══════════════════════════════════════════╝');

  try {
    await section1_StartupAndCaching();
    await section2_LookupResilience();
    await section3_OutputUsefulness();
    await section4_Workflows();
    await section5_ExampleQuality();
    await section6_ErrorQuality();
    await section7_Determinism();
    await section8_BackwardCompatibility();
    await printSummary();
  } catch (e) {
    console.error('QA script error:', e);
    process.exit(1);
  }
}

main();
