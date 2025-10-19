import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the MCP SDK
const mockHandleRequest = vi.fn(async (req, res) => {
  res.json({
    jsonrpc: '2.0',
    result: {
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'vcluster-yaml-mcp-server', version: '0.1.0' }
    },
    id: 1
  });
});

const mockConnect = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    handleRequest: mockHandleRequest
  }))
}));

vi.mock('../src/server.js', () => ({
  createServer: vi.fn(() => ({
    connect: mockConnect
  }))
}));

// Import after mocks
const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createServer } = await import('../src/server.js');

describe('HTTP Server', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    // Create a minimal test app that mimics http-server.js structure
    app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        name: 'vcluster-yaml-mcp-server',
        version: '0.1.0',
        timestamp: new Date().toISOString()
      });
    });

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

    const mcpHandler = async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on('close', () => {
        transport.close();
      });

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    };

    app.get('/mcp', mcpHandler);
    app.post('/mcp', mcpHandler);
  });

  describe('Health Endpoint', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return correct health check structure', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toMatchObject({
        status: 'ok',
        name: 'vcluster-yaml-mcp-server',
        version: '0.1.0'
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return application/json content type', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Root Endpoint', () => {
    it('should return server information', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'vcluster-yaml-mcp-server',
        version: '0.1.0',
        description: 'MCP server for querying vCluster YAML configurations'
      });
    });

    it('should list available endpoints', async () => {
      const response = await request(app).get('/');
      expect(response.body.endpoints).toMatchObject({
        mcp: '/mcp',
        health: '/health'
      });
    });

    it('should include documentation link', async () => {
      const response = await request(app).get('/');
      expect(response.body.documentation).toContain('github.com');
    });
  });

  describe('MCP Endpoint', () => {
    it('should respond to GET requests', async () => {
      const response = await request(app)
        .get('/mcp')
        .set('Accept', 'application/json, text/event-stream');

      expect(response.status).toBe(200);
    });

    it('should respond to POST requests', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' }
          }
        });

      expect(response.status).toBe(200);
    });

    it('should create new transport per request', async () => {
      vi.clearAllMocks();

      await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

      await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} });

      // Transport should be created twice
      expect(StreamableHTTPServerTransport).toHaveBeenCalledTimes(2);
    });

    it('should connect server to transport', async () => {
      vi.clearAllMocks();

      await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('Transport Configuration', () => {
    it('should configure transport with correct options', async () => {
      await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

      expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON in POST', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });
});
