#!/bin/sh
set -eu

# JSON encoding prevents environment values from becoming executable JavaScript.
config=$(jq -cn --arg platformDomain "${PLATFORM_DOMAIN:-}" --arg contactEmail "${PUBLIC_CONTACT_EMAIL:-}" --arg whatsappNumber "${PUBLIC_WHATSAPP_NUMBER:-}" '{platformDomain: $platformDomain, contactEmail: $contactEmail, whatsappNumber: $whatsappNumber}')
printf 'window.__SLAMA_CONFIG__ = %s;\n' "$config" > /usr/share/nginx/html/config.js

# Shared proxy networks can hold several stacks that all call their service "api"; each stack sets
# API_UPSTREAM_HOST to its own unique alias so the proxy never reaches another stack's API.
upstream_host="${API_UPSTREAM_HOST:-api}"
case "$upstream_host" in
  ''|*[!a-zA-Z0-9.-]*) echo "API_UPSTREAM_HOST must be a hostname" >&2; exit 1 ;;
esac
sed -i "s|^set \$api_upstream .*|set \$api_upstream http://${upstream_host}:3000;|" /etc/nginx/api-proxy.conf
