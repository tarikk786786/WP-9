# Persistent Baileys worker. Not a Vercel function.
FROM node:22-bookworm-slim
ARG TARGETARCH
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && CF_ARCH="$(if [ "$TARGETARCH" = "arm64" ]; then echo arm64; else echo amd64; fi)" \
  && curl -fsSL -o /usr/local/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
  && chmod +x /usr/local/bin/cloudflared \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/bot-engine/package.json packages/bot-engine/
COPY packages/database/package.json packages/database/
RUN npm install --workspace=worker --include-workspace-root
COPY packages packages
COPY apps/worker apps/worker
ENV NODE_ENV=production
ENV WORKER_PORT=8788
ENV BAILEYS_AUTH_DIR=/app/data/baileys-auth
ENV CLOUDFLARED_BIN=/usr/local/bin/cloudflared
RUN mkdir -p /app/data/baileys-auth
VOLUME ["/app/data"]
EXPOSE 8788
HEALTHCHECK --interval=20s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "const p=process.env.PORT||process.env.WORKER_PORT||8788; fetch('http://127.0.0.1:'+p+'/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "worker"]
