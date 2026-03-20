FROM oven/bun:1 AS builder

WORKDIR /app

COPY . .

RUN bun install
RUN bun run build

FROM oven/bun:1 AS runtime

WORKDIR /app

COPY --from=builder /app/apps/backend/dist /app/apps/backend/dist
COPY --from=builder /app/apps/backend/config.json /app/apps/backend/config.json
COPY --from=builder /app/apps/frontend/dist /app/apps/frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIST=/app/apps/frontend/dist

EXPOSE 3000

HEALTHCHECK --interval=1s --timeout=1s --start-period=1s --retries=3 \
  CMD bun -e "const response = await fetch('http://127.0.0.1:${PORT}/api/trpc/health'); if (!response.ok) throw new Error('HTTP ' + response.status)"

CMD ["bun", "/app/apps/backend/dist/index.js"]
