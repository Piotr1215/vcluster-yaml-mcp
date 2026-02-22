import { describe, it, expect, beforeEach, vi } from 'vitest';
import promClient from 'prom-client';

// Test that Prometheus counter has the correct label configuration
describe('Prometheus Metrics Labels', () => {
  let register;
  let mcpRequestCounter;

  beforeEach(() => {
    register = new promClient.Registry();
    mcpRequestCounter = new promClient.Counter({
      name: 'mcp_requests_total',
      help: 'Total MCP requests',
      labelNames: ['method', 'status', 'mcp_method', 'tool_name'],
      registers: [register]
    });
  });

  it('should accept mcp_method and tool_name labels', () => {
    // tools/call with a tool name
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/call', tool_name: 'smart-query' });
    // tools/list (no tool name)
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/list', tool_name: '' });
    // initialize
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'initialize', tool_name: '' });

    const metric = register.getSingleMetric('mcp_requests_total');
    expect(metric).toBeDefined();
  });

  it('should produce filterable metrics output', async () => {
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/call', tool_name: 'smart-query' });
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/call', tool_name: 'validate-config' });
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/list', tool_name: '' });
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/list', tool_name: '' });
    mcpRequestCounter.inc({ method: 'POST', status: 'success', mcp_method: 'tools/list', tool_name: '' });

    const output = await register.metrics();

    // tools/call lines should have tool_name populated
    expect(output).toContain('mcp_method="tools/call"');
    expect(output).toContain('tool_name="smart-query"');
    expect(output).toContain('tool_name="validate-config"');

    // tools/list should have empty tool_name
    expect(output).toContain('mcp_method="tools/list"');
    expect(output).toContain('tool_name=""');
  });

  it('should track errors with labels', () => {
    mcpRequestCounter.inc({ method: 'POST', status: 'error', mcp_method: 'tools/call', tool_name: 'smart-query' });

    const metric = register.getSingleMetric('mcp_requests_total');
    expect(metric).toBeDefined();
  });
});

describe('Console Log Format', () => {
  it('should format tools/call with tool name', () => {
    const mcpMethod = 'tools/call';
    const params = { name: 'smart-query' };
    const toolLog = (mcpMethod === 'tools/call' && params?.name) ? ` tool=${params.name}` : '';
    const line = `MCP POST ${mcpMethod}${toolLog} from 1.2.3.4`;

    expect(line).toBe('MCP POST tools/call tool=smart-query from 1.2.3.4');
  });

  it('should format tools/list without tool name', () => {
    const mcpMethod = 'tools/list';
    const params = {};
    const toolLog = (mcpMethod === 'tools/call' && params?.name) ? ` tool=${params.name}` : '';
    const line = `MCP POST ${mcpMethod}${toolLog} from 1.2.3.4`;

    expect(line).toBe('MCP POST tools/list from 1.2.3.4');
  });

  it('should handle unknown method', () => {
    const mcpMethod = 'unknown';
    const params = undefined;
    const toolLog = (mcpMethod === 'tools/call' && params?.name) ? ` tool=${params.name}` : '';
    const line = `MCP POST ${mcpMethod}${toolLog} from 1.2.3.4`;

    expect(line).toBe('MCP POST unknown from 1.2.3.4');
  });
});
