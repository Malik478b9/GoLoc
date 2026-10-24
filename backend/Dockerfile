# Production image for the GoLoc API, background worker and scheduler.
#   docker build -t goloc-api .
#   docker run --env-file ../.env.production goloc-api          # api (default)
#   docker run --env-file ../.env.production goloc-api worker   # Celery worker
#   docker run --env-file ../.env.production goloc-api beat     # Celery beat
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN chmod +x docker-entrypoint.sh \
 && useradd --create-home --uid 1000 goloc \
 && mkdir -p /app/media /app/private_media /app/staticfiles \
 && chown -R goloc /app
USER goloc

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/v1/health/',timeout=4)" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["api"]
