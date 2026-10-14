ARG WILMA_CLI_VERSION=2.1.2

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
ARG WILMA_CLI_VERSION
RUN apk add --no-cache tini \
 && npm i -g "@wilm-ai/wilma-cli@${WILMA_CLI_VERSION}" \
 && npm cache clean --force
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production \
    WILMAI_CONFIG_PATH=/data/wilmai/config.json \
    WILMAI_NO_UPDATE_CHECK=1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
