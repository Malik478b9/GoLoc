# nginx in front of the API: serves uploaded media, the admin console (/) and the
# agency console (/agency/), proxies everything API-shaped to gunicorn.
FROM node:22-alpine AS admin
WORKDIR /src
COPY admin-desk/package.json admin-desk/package-lock.json ./
RUN npm ci
COPY admin-desk/ ./
# Same origin as the API, so the console calls /api/v1 directly (no CORS).
ENV VITE_API_BASE_URL=/api/v1
RUN npx vite build

FROM node:22-alpine AS agency
WORKDIR /src
COPY agency-desk/package.json agency-desk/package-lock.json ./
RUN npm ci
COPY agency-desk/ ./
ENV VITE_API_BASE_URL=/api/v1 VITE_BASE=/agency/
RUN npx vite build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin /src/dist /usr/share/nginx/html
COPY --from=agency /src/dist /usr/share/nginx/agency
