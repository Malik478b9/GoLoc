# nginx in front of the API: serves uploaded media and the admin console,
# proxies everything API-shaped to gunicorn.
FROM node:22-alpine AS admin
WORKDIR /src
COPY admin-desk/package.json admin-desk/package-lock.json ./
RUN npm ci
COPY admin-desk/ ./
# Same origin as the API, so the console calls /api/v1 directly (no CORS).
ENV VITE_API_BASE_URL=/api/v1
RUN npx vite build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin /src/dist /usr/share/nginx/html
