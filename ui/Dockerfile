FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/package.json ui/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @slama/ui...
COPY tsconfig.base.json ./
COPY ui ./ui
WORKDIR /workspace/ui
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /workspace/ui/dist /usr/share/nginx/html
EXPOSE 80
