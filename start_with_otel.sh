#!/usr/bin/env sh

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

#   deno run --unstable-otel --allow-net main.ts
#   deno run --unstable-otel -A npm:@react-router/dev@7.6.1 dev

OTEL_DENO=true \
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://logfire-api.pydantic.dev/v1/traces \
  OTEL_EXPORTER_OTLP_HEADERS="Authorization=${LOGFIRE_WRITE_TOKEN}" \
  deno run --allow-env --allow-net --allow-read ./server.ts