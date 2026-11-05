#!/bin/sh
# One-time setup for a fresh Ubuntu 24.04 VPS (run as root).
#   ssh root@<IP> 'sh -s' < deploy/server-setup.sh
# Installs updates, firewall, fail2ban, Docker and certbot, adds 2 GB swap,
# and issues the Let's Encrypt certificate for goloc.in, www.goloc.in and api.goloc.in.
set -eu
DOMAINS="-d goloc.in -d www.goloc.in -d api.goloc.in"
EMAIL="info@goloc.in"
APP_DIR=/opt/goloc

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw fail2ban unattended-upgrades certbot

# Firewall: SSH, HTTP, HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

# SSH: keys only
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
rm -f /etc/ssh/sshd_config.d/50-cloud-init.conf
systemctl reload ssh

# Swap (helps Docker builds on 8 GB)
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker (official repo)
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p "$APP_DIR"

# TLS certificate (port 80 must be free: run before the stack starts)
if [ ! -d /etc/letsencrypt/live/goloc.in ]; then
  certbot certonly --standalone --non-interactive --agree-tos -m "$EMAIL" --cert-name goloc.in $DOMAINS
fi
# Renewals stop nginx for a few seconds, then reload it with the new cert
mkdir -p /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
printf '#!/bin/sh\ncd %s && docker compose --env-file .env.production stop nginx\n' "$APP_DIR" > /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
printf '#!/bin/sh\ncd %s && docker compose --env-file .env.production start nginx\n' "$APP_DIR" > /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/pre/*.sh /etc/letsencrypt/renewal-hooks/post/*.sh

echo "Server ready."
