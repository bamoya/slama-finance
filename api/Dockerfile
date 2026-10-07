FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @slama/api...
COPY tsconfig.base.json ./
COPY api ./api
WORKDIR /workspace/api
RUN pnpm build

FROM build AS release
USER node
CMD ["node", "--import", "tsx", "node_modules/drizzle-kit/bin.cjs", "migrate"]

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/api/node_modules ./api/node_modules
COPY --from=build /workspace/api/dist ./api/dist
COPY --from=build /workspace/api/package.json ./api/package.json
WORKDIR /app/api
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
