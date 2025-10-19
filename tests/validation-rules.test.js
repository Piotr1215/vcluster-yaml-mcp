import { describe, it, expect } from 'vitest';
import { extractValidationRulesFromComments } from '../src/validation-rules.js';

describe('Validation Rules Extraction', () => {
  describe('extractValidationRulesFromComments', () => {
    it('should extract enum values from comments', () => {
      const yaml = `# Valid values: k3s, k8s, k0s
distro: k3s`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.enums).toHaveProperty('distro');
      expect(result.enums.distro).toEqual(['k3s', 'k8s', 'k0s']);
    });

    it('should extract validation rules from comments', () => {
      const yaml = `# This field must be greater than 0
replicas: 3`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.rules.length).toBeGreaterThan(0);
      const rule = result.rules.find(r => r.path === 'replicas');
      expect(rule).toBeDefined();
      expect(rule.instructions).toContain('This field must be greater than 0');
    });

    it('should extract dependencies', () => {
      const yaml = `backup:
  # Requires etcd to be enabled
  enabled: true`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.dependencies.length).toBeGreaterThan(0);
      expect(result.dependencies[0]).toContain('backup.enabled');
      expect(result.dependencies[0]).toContain('Requires etcd');
    });

    it('should extract defaults', () => {
      const yaml = `# Default: true
enabled: true`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.defaults).toHaveProperty('enabled');
      expect(result.defaults.enabled).toBe('true');
    });

    it('should handle nested paths correctly', () => {
      const yaml = `controlPlane:
  # This enables the control plane
  enabled: true
  # Valid values: k3s, k8s
  distro: k3s`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.enums).toHaveProperty('controlPlane.distro');
      expect(result.enums['controlPlane.distro']).toEqual(['k3s', 'k8s']);
    });

    it('should filter by section when specified', () => {
      const yaml = `controlPlane:
  # Must be a boolean value
  enabled: true
  # Replicas must be positive
  replicas: 3
sync:
  # This field is required
  enabled: false`;

      const result = extractValidationRulesFromComments(yaml, 'controlPlane');

      // Should have rules for controlPlane section
      const hasControlPlaneRules = result.rules.some(r => r.path.startsWith('controlPlane'));
      // Should NOT have rules for sync section
      const hasSyncRules = result.rules.some(r => r.path.startsWith('sync'));

      expect(hasControlPlaneRules).toBe(true);
      expect(hasSyncRules).toBe(false);
    });

    it('should extract warnings from comments', () => {
      const yaml = `# Warning: This is deprecated
oldFeature: true`;

      const result = extractValidationRulesFromComments(yaml);

      const rule = result.rules.find(r => r.path === 'oldFeature');
      expect(rule).toBeDefined();
      expect(rule.instructions.some(i => i.startsWith('⚠️'))).toBe(true);
    });

    it('should generate AI validation instructions', () => {
      const yaml = `# Valid values: k3s, k8s
# Default: k3s
# Requires license for k8s
distro: k3s`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.instructions).toBeDefined();
      expect(result.instructions).toContain('AI Validation Instructions');
      expect(result.instructions).toContain('Enumeration Constraints');
      expect(result.instructions).toContain('Dependencies');
    });

    it('should return summary with rule count', () => {
      const yaml = `# Must be positive
# Default: 1
replicas: 1
# Valid values: true, false
enabled: true`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('validation rules');
    });

    it('should handle multiple comment lines for same field', () => {
      const yaml = `# This is a complex field
# It requires careful configuration
# Valid values: option1, option2
# Default: option1
field: option1`;

      const result = extractValidationRulesFromComments(yaml);

      const rule = result.rules.find(r => r.path === 'field');
      expect(rule).toBeDefined();
      expect(rule.originalComments.length).toBeGreaterThan(1);
    });

    it('should skip empty lines', () => {
      const yaml = `# Comment

# Another comment
field: value`;

      const result = extractValidationRulesFromComments(yaml);

      // Should not error, should process normally
      expect(result).toBeDefined();
    });

    it('should handle deeply nested paths', () => {
      const yaml = `level1:
  level2:
    level3:
      # Must be configured
      field: value`;

      const result = extractValidationRulesFromComments(yaml);

      const rule = result.rules.find(r => r.path === 'level1.level2.level3.field');
      expect(rule).toBeDefined();
    });

    it('should extract alternative enum patterns', () => {
      const yaml = `# Options: A, B, C
field1: A
# Choices: X, Y, Z
field2: X
# Possible values: 1, 2, 3
field3: 1`;

      const result = extractValidationRulesFromComments(yaml);

      expect(result.enums).toHaveProperty('field1');
      expect(result.enums).toHaveProperty('field2');
      expect(result.enums).toHaveProperty('field3');
    });
  });
});
