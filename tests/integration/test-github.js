#!/usr/bin/env node

import { githubClient } from './src/github.js';

async function testGitHub() {
  console.log('Testing GitHub integration...\n');

  try {
    // Test 1: Get tags
    console.log('1. Fetching vcluster versions (tags)...');
    const tags = await githubClient.getTags();
    console.log(`   Found ${tags.length} tags`);
    console.log(`   Latest 5: ${tags.slice(0, 5).join(', ')}\n`);

    // Test 2: Get branches
    console.log('2. Fetching branches...');
    const branches = await githubClient.getBranches();
    console.log(`   Found ${branches.length} branches: ${branches.join(', ')}\n`);

    // Test 3: Get config/values.yaml
    console.log('3. Fetching config/values.yaml from main branch...');
    const valuesYaml = await githubClient.getYamlContent('config/values.yaml', 'main');
    console.log(`   Successfully loaded YAML with ${Object.keys(valuesYaml).length} top-level keys`);
    console.log(`   Keys: ${Object.keys(valuesYaml).slice(0, 10).join(', ')}...\n`);

    // Test 4: Search for namespace
    console.log('4. Searching for "namespace" in values.yaml...');
    function findNamespaces(obj, path = '') {
      const results = [];
      for (const [key, value] of Object.entries(obj || {})) {
        const currentPath = path ? `${path}.${key}` : key;
        if (key.toLowerCase().includes('namespace')) {
          results.push({ path: currentPath, value });
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          results.push(...findNamespaces(value, currentPath));
        }
      }
      return results;
    }
    
    const namespaceResults = findNamespaces(valuesYaml);
    console.log(`   Found ${namespaceResults.length} namespace-related configurations:`);
    namespaceResults.slice(0, 5).forEach(r => {
      console.log(`   - ${r.path}: ${JSON.stringify(r.value).substring(0, 50)}...`);
    });

    console.log('\n✅ GitHub integration is working correctly!');
    console.log('The server can now fetch vcluster configurations directly from GitHub.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure you have internet access to reach GitHub.');
  }
}

testGitHub();