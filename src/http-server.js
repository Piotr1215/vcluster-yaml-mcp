#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import express from 'express';
import { requireApiKey } from './middleware/auth.js';

const PORT = process.env.PORT || 3000;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'vcluster-yaml-mcp-server',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint info
app.get('/', (_req, res) => {
  res.json({
    name: 'vcluster-yaml-mcp-server',
    version: '0.1.0',
    description: 'MCP server for querying vCluster YAML configurations',
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    },
    documentation: 'https://github.com/Piotr1215/vcluster-yaml-mcp-server'
  });
});

// MCP endpoint with Streamable HTTP transport
const mcpHandler = async (req, res) => {
  console.log(`MCP ${req.method} request received`);

  // Create new transport per request to prevent ID collisions
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  // Cleanup on connection close
  res.on('close', () => {
    transport.close();
  });

  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
};

// Support both GET and POST for MCP endpoint
app.get('/mcp', REQUIRE_AUTH ? requireApiKey : (req, res, next) => next(), mcpHandler);
app.post('/mcp', REQUIRE_AUTH ? requireApiKey : (req, res, next) => next(), mcpHandler);

app.listen(PORT, () => {
  console.log(`vcluster-yaml-mcp-server HTTP running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Transport: Streamable HTTP (MCP 2025-03-26)`);
});
