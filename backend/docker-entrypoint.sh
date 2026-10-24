#!/bin/sh
# One image, three roles:  api (default) · worker · beat
set -e

case "${1:-api}" in
  api)
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput
    exec gunicorn goloc.wsgi:application \
      --bind "0.0.0.0:${PORT:-8000}" \
      --worker-class gthread \
      --workers "${WEB_CONCURRENCY:-3}" \
      --threads "${GUNICORN_THREADS:-4}" \
      --timeout 60 \
      --keep-alive 5 \
      --max-requests 2000 --max-requests-jitter 200 \
      --access-logfile -
    ;;
  worker)
    exec celery -A goloc worker --loglevel=INFO --concurrency "${CELERY_CONCURRENCY:-4}"
    ;;
  beat)
    exec celery -A goloc beat --loglevel=INFO --schedule /tmp/celerybeat-schedule
    ;;
  *)
    exec "$@"
    ;;
esac
