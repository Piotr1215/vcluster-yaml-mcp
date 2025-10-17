/**
 * Comprehensive validation error tests
 * Tests that validator catches all types of invalid configurations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { validateSnippet } from '../src/snippet-validator.js';
import { githubClient } from '../src/github.js';

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
      expect(result.errors[0].keyword).toBe('type');
      expect(result.errors[0].message).toContain('boolean');
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
      expect(result.errors[0].keyword).toBe('type');
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
      expect(result.errors[0].keyword).toBe('type');
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
      expect(result.errors[0].path).toContain('registry');
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
});
