FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/package.json ui/package.json
COPY api/package.json api/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @slama/ui... --filter @slama/api...
COPY tsconfig.base.json ./
COPY ui ./ui
COPY api/openapi ./api/openapi
COPY api/scripts ./api/scripts
WORKDIR /workspace/ui
RUN pnpm build

FROM nginx:1.27-alpine
RUN apk add --no-cache jq
COPY ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/ui/dist /usr/share/nginx/html
COPY --chmod=755 ui/docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 8080
