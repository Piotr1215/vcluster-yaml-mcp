#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireApiKey } from './middleware/auth.js';
import promClient from 'prom-client';
import { getHealthInfo, getServerInfo } from './server-info.js';

const PORT = process.env.PORT || 3000;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

// Prometheus metrics setup
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const mcpRequestCounter = new promClient.Counter({
  name: 'mcp_requests_total',
  help: 'Total MCP requests',
  labelNames: ['method', 'status'],
  registers: [register]
});

const mcpRequestDuration = new promClient.Histogram({
  name: 'mcp_request_duration_seconds',
  help: 'MCP request duration in seconds',
  labelNames: ['method'],
  registers: [register]
});

const app = express();

// Trust proxy (Cloudflare Tunnel)
// Trust exactly 1 proxy hop (cloudflared)
app.set('trust proxy', 1);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.removeHeader('X-Powered-By');
  next();
});

// Request size limiting
app.use(express.json({
  limit: '1mb',
  strict: true
}));

// Rate limiting for general endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for MCP endpoint (allows for interactive sessions)
const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { error: 'Too many requests to MCP endpoint, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Health check endpoint
app.get('/health', apiLimiter, (_req, res) => {
  res.json(getHealthInfo());
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Root endpoint info
app.get('/', (_req, res) => {
  res.json({
    ...getServerInfo(),
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      metrics: '/metrics'
    }
  });
});

// MCP endpoint with Streamable HTTP transport
const mcpHandler = async (req, res) => {
  const start = Date.now();
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`MCP ${req.method} request from ${clientIp}`);

  try {
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

    mcpRequestCounter.inc({ method: req.method, status: 'success' });
  } catch (error) {
    mcpRequestCounter.inc({ method: req.method, status: 'error' });
    throw error;
  } finally {
    mcpRequestDuration.observe({ method: req.method }, (Date.now() - start) / 1000);
  }
};

// Support both GET and POST for MCP endpoint
app.get('/mcp', mcpLimiter, REQUIRE_AUTH ? requireApiKey : (req, res, next) => next(), mcpHandler);
app.post('/mcp', mcpLimiter, REQUIRE_AUTH ? requireApiKey : (req, res, next) => next(), mcpHandler);

app.listen(PORT, () => {
  console.log(`vcluster-yaml-mcp-server HTTP running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Transport: Streamable HTTP (MCP 2025-03-26)`);
});
