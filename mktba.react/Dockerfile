# Frontend SSR server (X-01, #63): react-router-serve on PORT (3000). Build context: mktba.react/.
#   docker build -t mktba-web --build-arg VITE_API_BASE_URL=https://api.mktba.ru mktba.react
# VITE_* values are baked into the browser bundle at build time, so each stand (staging, production)
# gets its own image. API_INTERNAL_URL and PUBLIC_SITE_URL are read when the server starts.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_METRIKA_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_METRIKA_ID=$VITE_METRIKA_ID
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL build argument is required" >&2; exit 1)
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine AS final
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]
