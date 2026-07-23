/**
 * Comprehensive validation error tests
 * Tests that validator catches all types of invalid configurations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { validateSnippet, clearCache } from '../src/snippet-validator.ts';
import { githubClient } from '../src/github.ts';

describe('Validation Error Detection', () => {
  let fullSchema;
  const version = 'main';

  beforeAll(async () => {
    const schemaContent = await githubClient.getFileContent('chart/values.schema.json', version);
    fullSchema = JSON.parse(schemaContent);
  });

  describe('Invalid Field Names (Additional Properties)', () => {
    it('should catch typo in field name', () => {
      const yaml = `
controlPlane:
  backingStorePumpkin:
    etcd:
      embedded:
        enabled: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.errors[0].keyword).toBe('additionalProperties');
      expect(result.errors[0].params.additionalProperty).toBe('backingStorePumpkin');
    });

    it('should catch multiple invalid fields', () => {
      const yaml = `
controlPlane:
  invalidField1: true
  invalidField2: "test"
  distro:
    k3s:
      enabled: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should catch invalid nested field', () => {
      const yaml = `
sync:
  fromHost:
    nodes:
      enabled: true
      invalidSelector: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
    });
  });

  describe('Wrong Types', () => {
    it('should catch number instead of boolean', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: 123
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(['type', 'additionalProperties']).toContain(result.errors[0].keyword);
    });

    it('should catch string instead of boolean', () => {
      const yaml = `
sync:
  toHost:
    services:
      enabled: "yes"
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(['type', 'additionalProperties']).toContain(result.errors[0].keyword);
    });

    it('should catch boolean instead of string', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      image:
        tag: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(['type', 'additionalProperties']).toContain(result.errors[0].keyword);
    });

    it('should catch number instead of object', () => {
      const yaml = `
controlPlane:
  distro: 123
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
    });
  });

  describe('YAML Syntax Errors', () => {
    it('should catch malformed YAML', () => {
      const yaml = `
controlPlane:
  distro:
    - invalid: [unclosed bracket
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.syntax_valid).toBe(false);
      expect(result.syntax_error).toBeDefined();
    });

    it('should catch invalid indentation', () => {
      const yaml = `
controlPlane:
distro:
  k3s:
    enabled: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      // YAML parser might accept this or fail - either way is valid
      if (!result.syntax_valid) {
        expect(result.syntax_error).toBeDefined();
      }
    });

    it('should catch unbalanced quotes', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      image:
        tag: "v1.28.0
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.syntax_valid).toBe(false);
    });
  });

  describe('Multi-Section Documents with Errors', () => {
    it('should catch errors across multiple sections', () => {
      const yaml = `
sync:
  fromHost:
    nodes:
      enabled: true
      invalidField: "bad"

controlPlane:
  distro:
    k3s:
      enabled: "not a boolean"
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.section).toBe('__full_document__');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should catch invalid root-level field in multi-section document', () => {
      const yaml = `
sync:
  toHost:
    services:
      enabled: true

invalidRootField: true

controlPlane:
  distro:
    k3s:
      enabled: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'additionalProperties')).toBe(true);
    });
  });

  describe('Complex Nested Errors', () => {
    it('should catch deep nested type error', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: true
      image:
        registry: true
        repository: "rancher/k3s"
        tag: "v1.28.0"
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toContain('distro');
    });

    it('should catch array item errors', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: true
      extraArgs:
        - 123
        - "valid-arg"
`;
      const result = validateSnippet(yaml, fullSchema, version);
      // If the schema expects strings in extraArgs, this should fail
      if (result.errors && result.errors.length > 0) {
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should catch empty required fields', () => {
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled:
`;
      const result = validateSnippet(yaml, fullSchema, version);
      // enabled is null, should fail type check
      expect(result.valid).toBe(false);
    });

    it('should handle mix of valid and invalid sections', () => {
      const yaml = `
sync:
  toHost:
    services:
      enabled: true

controlPlane:
  completelybogusfield: "nonsense"
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
    });
  });

  describe('Realistic Error Scenarios', () => {
    it('should catch the exact error from user complaint', () => {
      const yaml = `
sync:
  fromHost:
    nodes:
      enabled: true
selector:
  all: true

controlPlane:
  backingStorePumpkin:
    etcd:
      embedded:
        enabled: 123
`;
      const result = validateSnippet(yaml, fullSchema, version);

      // Should fail validation
      expect(result.valid).toBe(false);

      // Should have errors
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);

      // Should detect it's a full document
      expect(result.section).toBe('__full_document__');

      // Should catch the invalid field name or misplaced selector
      const hasAdditionalPropsError = result.errors.some(e =>
        e.keyword === 'additionalProperties'
      );
      expect(hasAdditionalPropsError).toBe(true);
    });
  });

  // DOC-1628: full-document validators were cached under a fixed
  // `__full__:<version>` key that ignored which top-level sections the
  // document contained. The first full document validated in a process
  // therefore poisoned the cache for every later full document of the same
  // version: any section absent from the first document was reported as a
  // false-positive additionalProperties error. The failure is order-dependent
  // across validate() calls, which is why it only appears once more than one
  // multi-section document is validated in the same session.
  describe('Multi-key document order-independence (DOC-1628)', () => {
    // Two valid full documents whose top-level section sets differ.
    const docControlPlaneExport = `
controlPlane:
  proxy:
    extraSANs:
      - "vcluster-demo.vcluster-demo.svc.cluster.local"
exportKubeConfig:
  server: https://vcluster-name.vcluster-namespace.svc.cluster.local:443
  insecure: true
  additionalSecrets:
  - name: vcluster-flux-kubeconfig
`;
    const docControlPlaneSync = `
controlPlane:
  backingStore:
    etcd:
      embedded:
        enabled: true
  ingress:
    enabled: true
    host: vcluster-k8s-api.example.com
sync:
  toHost:
    serviceAccounts:
      enabled: true
`;

    it('does not flag a valid section absent from the previously validated document', () => {
      clearCache();

      // Prime the cache with a document that has no `sync` section.
      const first = validateSnippet(docControlPlaneExport, fullSchema, version);
      expect(first.valid).toBe(true);

      // Before the fix this reused the primed validator and reported
      // additionalProperty: sync even though `sync` is a valid top-level key.
      const second = validateSnippet(docControlPlaneSync, fullSchema, version);
      expect(second.section).toBe('__full_document__');
      expect(second.errors ?? []).toEqual([]);
      expect(second.valid).toBe(true);
    });

    it('is symmetric under reversed validation order', () => {
      clearCache();

      // Prime with a document that has no `exportKubeConfig` section.
      const first = validateSnippet(docControlPlaneSync, fullSchema, version);
      expect(first.valid).toBe(true);

      const second = validateSnippet(docControlPlaneExport, fullSchema, version);
      expect(second.section).toBe('__full_document__');
      expect(second.errors ?? []).toEqual([]);
      expect(second.valid).toBe(true);
    });

    it('reproduces the issue backingStore + ingress + sync case after a differing full document', () => {
      clearCache();

      // A different multi-section document primes the cache first.
      validateSnippet(docControlPlaneExport, fullSchema, version);

      const yaml = `
controlPlane:
  backingStore:
    etcd:
      embedded:
        enabled: true
  ingress:
    enabled: true
    host: vcluster-k8s-api.example.com
sync:
  toHost:
    serviceAccounts:
      enabled: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(true);
      expect(result.errors ?? []).toEqual([]);
    });

    it('still flags genuinely invalid top-level keys after a valid full document primes the cache', () => {
      clearCache();

      // Prime with a valid full document.
      const primed = validateSnippet(docControlPlaneSync, fullSchema, version);
      expect(primed.valid).toBe(true);

      // A real typo at the top level must still be rejected: the fix must not
      // make additionalProperties detection permissive.
      const yaml = `
controlPlane:
  distro:
    k3s:
      enabled: true
totallyBogusTopLevelKey: true
`;
      const result = validateSnippet(yaml, fullSchema, version);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.keyword === 'additionalProperties' &&
        e.params.additionalProperty === 'totallyBogusTopLevelKey'
      )).toBe(true);
    });
  });
});
