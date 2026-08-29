FROM node:22-alpine AS build

WORKDIR /build
COPY package.json package-lock.json ./
COPY angular-dashboard/package.json angular-dashboard/package-lock.json ./angular-dashboard/
RUN npm ci && npm --prefix angular-dashboard ci

COPY angular-dashboard ./angular-dashboard
RUN npm run build

FROM node:22-alpine

ARG BUILD_VERSION=1.4.5
ARG BUILD_ARCH
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"

ENV NODE_ENV=production PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY defaults ./defaults
COPY --from=build /build/angular-dashboard/dist ./angular-dashboard/dist
COPY run.sh /run.sh
RUN chmod a+x /run.sh

EXPOSE 3000
CMD ["/run.sh"]
