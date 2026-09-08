# Persistent Baileys worker — do not run this as a Vercel Serverless Function.
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
EXPOSE 8788
CMD ["npm", "run", "worker"]
