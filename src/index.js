#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// Get config file path from command line args or use default
const configPath = process.argv[2] || '/home/decoder/loft/vcluster-config';

const server = createServer(configPath);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);