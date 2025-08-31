RUN echo '#!/bin/sh' > /usr/src/app/start.sh && \
    echo 'echo "TRACES_ENDPOINT: $TRACES_ENDPOINT"' >> /usr/src/app/start.sh && \
    echo 'echo "LOGS_ENDPOINT: $LOGS_ENDPOINT"' >> /usr/src/app/start.sh && \
    echo 'echo "ENABLE_OPENTELEMETRY: $ENABLE_OPENTELEMETRY"' >> /usr/src/app/start.sh && \
    echo 'echo "Checking trace endpoint connectivity..."' >> /usr/src/app/start.sh && \
    echo 'bun --eval "fetch(\"$TRACES_ENDPOINT\").then(r => console.log(\"Trace endpoint status:\", r.status)).catch(e => console.error(\"Trace endpoint error:\", e))"' >> /usr/src/app/start.sh && \
    echo 'echo "Checking log endpoint connectivity..."' >> /usr/src/app/start.sh && \
    echo 'bun --eval "fetch(\"$LOGS_ENDPOINT\").then(r => console.log(\"Log endpoint status:\", r.status)).catch(e => console.error(\"Log endpoint error:\", e))"' >> /usr/src/app/start.sh && \
    echo 'exec bun run --preload /usr/src/app/set-global.js dist/index.js' >> /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh