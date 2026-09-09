# Persistent Baileys worker. Not a Vercel function.
FROM node:22-bookworm-slim
WORKDIR /app
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
RUN mkdir -p /app/data/baileys-auth
VOLUME ["/app/data"]
EXPOSE 8788
HEALTHCHECK --interval=20s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8788/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "worker"]
