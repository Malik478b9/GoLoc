# nginx in front of the API: serves uploaded media, the admin console (/) and the
# agency console (/agency/), the landing page (goloc.in), the web versions of the
# Traveler (app.goloc.in) and Captain (captain.goloc.in) apps, and proxies
# everything API-shaped to gunicorn.
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

# Traveler + Captain apps, exported for the browser (Expo web). npm workspaces: one install for both.
FROM node:22-slim AS mobileweb
WORKDIR /src
COPY package.json package-lock.json ./
COPY mobile-core/package.json mobile-core/
COPY traveler-mob/package.json traveler-mob/
COPY captain-mob/package.json captain-mob/
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY mobile-core/ mobile-core/
COPY traveler-mob/ traveler-mob/
COPY captain-mob/ captain-mob/
ENV EXPO_PUBLIC_API_URL=https://api.goloc.in/api/v1 CI=1
RUN cd traveler-mob && npx expo export --platform web --output-dir /out/traveler
RUN cd captain-mob && npx expo export --platform web --output-dir /out/captain

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin /src/dist /usr/share/nginx/html
COPY --from=agency /src/dist /usr/share/nginx/agency
COPY --from=mobileweb /out/traveler /usr/share/nginx/traveler
COPY --from=mobileweb /out/captain /usr/share/nginx/captain
COPY landing/ /usr/share/nginx/landing/
RUN rm -f /usr/share/nginx/landing/wrangler.jsonc /usr/share/nginx/landing/.assetsignore
