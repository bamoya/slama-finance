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
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

FROM nginx:1.27-alpine
COPY ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/ui/dist /usr/share/nginx/html
EXPOSE 8080
