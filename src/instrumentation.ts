// OpenTelemetry instrumentation setup
// This file must be loaded BEFORE the application code

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Configure OTLP exporter
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://opentelemetry-collector.tempo.svc.cluster.local:4317',
});

// Initialize OpenTelemetry SDK with minimal config
// The SDK will automatically detect and set up resource attributes
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'vcluster-yaml-mcp-server',
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable file system instrumentation (too noisy)
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

// Start the SDK
sdk.start();

console.log('OpenTelemetry tracing initialized');
console.log(`  Service: ${process.env.OTEL_SERVICE_NAME || 'vcluster-yaml-mcp-server'}`);
console.log(`  Exporter: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://opentelemetry-collector.tempo.svc.cluster.local:4317'}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down successfully'))
    .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});
