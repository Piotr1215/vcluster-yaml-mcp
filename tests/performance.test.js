/**
 * Performance tests for smart-query
 * Run with: npm run test:perf
 */

import { describe, it, beforeAll } from 'vitest';
import { createServer } from '../dist/server.js';

describe('Smart Query Performance Tests', () => {
  let server;
  let smartQueryTool;

  beforeAll(() => {
    server = createServer();
    // New SDK uses _registeredTools object with tool handlers
    smartQueryTool = server._registeredTools['smart-query'];
  });

  async function measureQuery(query, version = 'main') {
    const startTotal = Date.now();

    // Call the tool handler directly with arguments
    const response = await smartQueryTool.handler({ query, version });
    const totalTime = Date.now() - startTotal;

    const text = response.content[0].text;
    const resultCount = (text.match(/\n/g) || []).length;
    const outputSize = text.length;

    return {
      query,
      version,
      totalTime,
      resultCount,
      outputSize,
      response: text.substring(0, 200) // First 200 chars for inspection
    };
  }

  it('Test 1: Cold cache - First query (etcd)', async () => {
    console.log('\n=== Test 1: Cold Cache Performance ===');
    const result = await measureQuery('etcd', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');

    // No assertion, just measurements
  }, 60000); // 60s timeout

  it('Test 2: Warm cache - Repeated query (replicas)', async () => {
    console.log('\n=== Test 2: Warm Cache Performance ===');

    // First call to warm cache
    await measureQuery('replicas', 'v0.24.0');

    // Second call - should be faster
    const result = await measureQuery('replicas', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

  it('Test 3: Large result set (enabled)', async () => {
    console.log('\n=== Test 3: Large Result Set ===');
    const result = await measureQuery('enabled', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

  it('Test 4: Specific path query (controlPlane.replicas)', async () => {
    console.log('\n=== Test 4: Specific Path Query ===');
    const result = await measureQuery('controlPlane.replicas', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

  it('Test 5: Natural language query (high availability)', async () => {
    console.log('\n=== Test 5: Natural Language Query ===');
    const result = await measureQuery('high availability', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

  it('Test 6: Same version, different query (k3s)', async () => {
    console.log('\n=== Test 6: Same Version, Different Query ===');
    const result = await measureQuery('k3s', 'v0.24.0');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

  it('Test 7: Different version (main)', async () => {
    console.log('\n=== Test 7: Different Version ===');
    const result = await measureQuery('etcd', 'main');

    console.log(`Query: "${result.query}"`);
    console.log(`Version: ${result.version}`);
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Result lines: ${result.resultCount}`);
    console.log(`Output size: ${result.outputSize} chars`);
    console.log(`Preview: ${result.response}...`);
    console.log('');
  }, 60000);

});
