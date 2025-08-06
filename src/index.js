#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// Create server (no config path needed - uses GitHub)
const server = createServer();

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);