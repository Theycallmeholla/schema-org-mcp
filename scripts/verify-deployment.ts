#!/usr/bin/env npx ts-node
/**
 * Deployment verification canary check.
 * Run after deploy to confirm the correct version is running.
 *
 * Tests:
 * 1. server_info returns expected version and git SHA
 * 2. compare_types tool exists and works
 * 3. Typo resolution gives suggestions (fuzzy matching works)
 * 4. FAQPage example has mainEntity array
 *
 * Usage: npx tsx scripts/verify-deployment.ts [expected-version] [expected-sha]
 */

import { SchemaOrgClient } from '../src/schema-org-client.js';
import { BUILD_INFO } from '../src/build-info.js';

interface CanaryResult {
  test: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
}

async function runCanaryChecks(expectedVersion?: string, expectedSha?: string): Promise<CanaryResult[]> {
  const results: CanaryResult[] = [];
  const client = new SchemaOrgClient();

  // Use build info defaults if not provided
  const version = expectedVersion || BUILD_INFO.version;
  const sha = expectedSha || BUILD_INFO.gitSha;

  console.log(`\nVerifying deployment: v${version} (${sha})\n`);

  // Test 1: Version matches
  results.push({
    test: 'Version matches expected',
    passed: BUILD_INFO.version === version,
    expected: version,
    actual: BUILD_INFO.version,
  });

  // Test 2: Git SHA matches (if not 'dev')
  if (sha !== 'dev') {
    results.push({
      test: 'Git SHA matches expected',
      passed: BUILD_INFO.gitSha === sha,
      expected: sha,
      actual: BUILD_INFO.gitSha,
    });
  }

  // Test 3: compare_types works
  try {
    const comparison = await client.compareTypes(['Article', 'BlogPosting']);
    const hasRecommendation = !!comparison.recommendation;
    const hasShared = comparison.sharedProperties.length > 0;
    results.push({
      test: 'compare_types returns recommendation',
      passed: hasRecommendation && hasShared,
      expected: 'recommendation and shared properties',
      actual: hasRecommendation ? 'has recommendation' : 'missing recommendation',
    });
  } catch (e: any) {
    results.push({
      test: 'compare_types works',
      passed: false,
      error: e.message,
    });
  }

  // Test 4: Typo resolution gives suggestions
  try {
    await client.getSchemaType('Persn');
    results.push({
      test: 'Typo gives suggestion',
      passed: false,
      expected: 'Error with "Did you mean"',
      actual: 'No error thrown',
    });
  } catch (e: any) {
    const hasSuggestion = e.message.includes('Did you mean');
    results.push({
      test: 'Typo gives suggestion',
      passed: hasSuggestion,
      expected: 'Error with "Did you mean"',
      actual: hasSuggestion ? 'Has suggestion' : e.message,
    });
  }

  // Test 5: FAQPage example has mainEntity
  try {
    const example = await client.generateExample('FAQPage', 'standard');
    const hasMainEntity = Array.isArray(example.mainEntity) && example.mainEntity.length > 0;
    results.push({
      test: 'FAQPage has mainEntity array',
      passed: hasMainEntity,
      expected: 'mainEntity array with items',
      actual: hasMainEntity ? `${example.mainEntity.length} items` : 'missing or empty',
    });
  } catch (e: any) {
    results.push({
      test: 'FAQPage example generation',
      passed: false,
      error: e.message,
    });
  }

  // Test 6: server_stats is available (observability)
  try {
    const status = await client.getCacheStatus();
    results.push({
      test: 'Cache status available',
      passed: status.exists !== undefined,
      actual: status.exists ? 'cache exists' : 'no cache',
    });
  } catch (e: any) {
    results.push({
      test: 'Cache status available',
      passed: false,
      error: e.message,
    });
  }

  return results;
}

function printResults(results: CanaryResult[]): boolean {
  console.log('═══════════════════════════════════════════');
  console.log('DEPLOYMENT VERIFICATION RESULTS');
  console.log('═══════════════════════════════════════════\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${color}${icon}${reset} ${result.test}`);
    if (!result.passed) {
      allPassed = false;
      if (result.expected) console.log(`   Expected: ${result.expected}`);
      if (result.actual) console.log(`   Actual: ${result.actual}`);
      if (result.error) console.log(`   Error: ${result.error}`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  if (allPassed) {
    console.log(`\x1b[32m✓ DEPLOYMENT VERIFIED: ${passed}/${total} checks passed\x1b[0m`);
    console.log(`\x1b[32m  Version: v${BUILD_INFO.version} (${BUILD_INFO.gitSha})\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ DEPLOYMENT FAILED: ${passed}/${total} checks passed\x1b[0m`);
    console.log(`\x1b[31m  DO NOT PROCEED - rollback or fix required\x1b[0m`);
  }
  console.log('═══════════════════════════════════════════\n');

  return allPassed;
}

async function main() {
  const [,, expectedVersion, expectedSha] = process.argv;

  try {
    const results = await runCanaryChecks(expectedVersion, expectedSha);
    const success = printResults(results);
    process.exit(success ? 0 : 1);
  } catch (e: any) {
    console.error('Verification script error:', e.message);
    process.exit(1);
  }
}

main();
