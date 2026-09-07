FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
COPY zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    NPM_CONFIG_CAFILE=/etc/ssl/certs/ca-certificates.crt \
    CHOKIDAR_USEPOLLING=true
WORKDIR /app
# Only package.json needed to install JS deps; --ignore-scripts skips the
# native electron-rebuild (not needed for a web preview of the renderer).
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
CMD ["npx","vite","--config",".preview/vite.preview.config.ts"]
