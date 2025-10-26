// OpenTelemetry instrumentation setup
// This file must be loaded BEFORE the application code

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable diagnostic logging (set to DiagLogLevel.DEBUG for troubleshooting)
const logLevel = process.env.OTEL_LOG_LEVEL === 'debug' ? DiagLogLevel.DEBUG : DiagLogLevel.INFO;
diag.setLogger(new DiagConsoleLogger(), logLevel);

// Configure OTLP exporter
const traceExporter = new OTLPTraceExporter({
  // OTel Collector endpoint (can be overridden via env var)
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://opentelemetry-collector.tempo.svc.cluster.local:4317',
  // Use gRPC protocol
  // No TLS needed for in-cluster communication
});

// Configure service resource
const resource = Resource.default().merge(
  new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'vcluster-yaml-mcp-server',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    // Add custom attributes
    'deployment.environment': process.env.NODE_ENV || 'production',
    'service.namespace': 'default',
  })
);

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Auto-instrument Express, HTTP, and other common libraries
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation (too noisy)
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        // Add request/response headers to spans
        requestHook: (span, request) => {
          span.setAttribute('http.client_ip', request.headers['x-forwarded-for'] || request.connection.remoteAddress);
        },
      },
    }),
  ],
});

// Start the SDK
sdk.start();

console.log('OpenTelemetry tracing initialized');
console.log(`  Service: ${resource.attributes[ATTR_SERVICE_NAME]}`);
console.log(`  Version: ${resource.attributes[ATTR_SERVICE_VERSION]}`);
console.log(`  Exporter: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://opentelemetry-collector.tempo.svc.cluster.local:4317'}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down successfully'))
    .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});
