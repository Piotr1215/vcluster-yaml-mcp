# Build stage - compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies for tsc)
# Use --ignore-scripts to skip prepare hook (we'll build explicitly after copying source)
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --ignore-scripts

# Copy source and compile
COPY src/ ./src/
RUN npm run build

# Production stage - minimal runtime
FROM node:20-alpine

# Build arguments for version information
ARG IMAGE_VERSION=unknown
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

# OCI labels for image metadata
LABEL org.opencontainers.image.title="vcluster-yaml-mcp-server"
LABEL org.opencontainers.image.description="MCP server for querying vCluster YAML configurations"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.source="https://github.com/Piotr1215/vcluster-yaml-mcp-server"
LABEL org.opencontainers.image.url="https://github.com/Piotr1215/vcluster-yaml-mcp-server"
LABEL org.opencontainers.image.licenses="MIT"

# Set environment variables from build args
ENV IMAGE_VERSION=${IMAGE_VERSION}
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_DATE=${BUILD_DATE}

WORKDIR /app

# Copy package files and install production dependencies only
# Use --ignore-scripts to skip prepare hook (build already done in builder stage)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist/ ./dist/

# Copy changelog for get-changelog tool
COPY CHANGELOG.md ./

# Expose port
EXPOSE 3000

# Health check (using wget since we're in alpine and ES modules don't support require)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run HTTP server with OpenTelemetry instrumentation
CMD ["node", "--import", "./dist/instrumentation.js", "./dist/http-server.js"]
