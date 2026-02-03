#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { requireApiKey } from './middleware/auth.js';
import promClient from 'prom-client';
import { getHealthInfo, getServerInfo, checkReadiness } from './server-info.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const PORT = process.env.PORT || 3000;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

// OpenTelemetry tracer
const tracer = trace.getTracer('vcluster-yaml-mcp-server');

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
app.use((_req: Request, res: Response, next: NextFunction) => {
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

// Liveness probe - shallow check
app.get('/health', apiLimiter, (_req: Request, res: Response) => {
  res.json(getHealthInfo());
});

// Readiness probe - validates MCP handler can process requests
app.get('/ready', apiLimiter, async (_req: Request, res: Response) => {
  const result = await checkReadiness(createServer);
  if (result.ready) {
    res.json({ status: 'ready', ...result });
  } else {
    res.status(503).json({ status: 'not ready', ...result });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Root endpoint info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    ...getServerInfo(),
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      ready: '/ready',
      metrics: '/metrics'
    }
  });
});

interface JsonRpcRequest {
  method?: string;
  id?: string | number;
  params?: {
    name?: string;
    uri?: string;
  };
}

// MCP endpoint with Streamable HTTP transport
const mcpHandler = async (req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`MCP ${req.method} request from ${clientIp}`);

  // Extract JSONRPC request details for tracing
  const jsonrpcRequest = req.body as JsonRpcRequest;
  const mcpMethod = jsonrpcRequest?.method || 'unknown';
  const mcpId = jsonrpcRequest?.id;
  const mcpParams = jsonrpcRequest?.params;

  return tracer.startActiveSpan('mcp.request', async (span) => {
    try {
      // Add MCP-specific span attributes
      span.setAttribute('mcp.method', mcpMethod);
      if (mcpId !== undefined) {
        span.setAttribute('mcp.id', String(mcpId));
      }
      span.setAttribute('http.client_ip', String(clientIp));

      // Add tool-specific attributes for tools/call
      if (mcpMethod === 'tools/call' && mcpParams?.name) {
        span.setAttribute('mcp.tool.name', mcpParams.name);
        span.updateName(`mcp.tool.${mcpParams.name}`);
      }

      // Add resource URI for resource operations
      if ((mcpMethod === 'resources/read' || mcpMethod === 'resources/write') && mcpParams?.uri) {
        span.setAttribute('mcp.resource.uri', mcpParams.uri);
      }

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
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      mcpRequestCounter.inc({ method: req.method, status: 'error' });
      const errorMessage = error instanceof Error ? error.message : String(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    } finally {
      mcpRequestDuration.observe({ method: req.method }, (Date.now() - start) / 1000);
      span.end();
    }
  });
};

// Middleware to pass through or require auth
const authMiddleware = REQUIRE_AUTH ? requireApiKey : (_req: Request, _res: Response, next: NextFunction) => next();

// Support both GET and POST for MCP endpoint
app.get('/mcp', mcpLimiter, authMiddleware, mcpHandler);
app.post('/mcp', mcpLimiter, authMiddleware, mcpHandler);

app.listen(PORT, () => {
  console.log(`vcluster-yaml-mcp-server HTTP running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Transport: Streamable HTTP (MCP 2025-03-26)`);
});
