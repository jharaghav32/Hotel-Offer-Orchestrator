ARG NODE_VERSION=26.9.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN npm install --global --no-audit --no-fund --loglevel=error yarn@1.22.22

FROM base AS deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=yarn-v1,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --non-interactive

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM base AS prod-deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=yarn-v1,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --non-interactive --production \
 && find node_modules/@temporalio/core-bridge/releases -mindepth 1 -maxdepth 1 \
      ! -name "$(uname -m)-unknown-linux-gnu" -exec rm -rf {} +

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
