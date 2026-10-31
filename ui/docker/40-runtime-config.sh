#!/bin/sh
set -eu

# JSON encoding prevents environment values from becoming executable JavaScript.
config=$(jq -cn --arg platformDomain "${PLATFORM_DOMAIN:-}" --arg contactEmail "${PUBLIC_CONTACT_EMAIL:-}" --arg whatsappNumber "${PUBLIC_WHATSAPP_NUMBER:-}" '{platformDomain: $platformDomain, contactEmail: $contactEmail, whatsappNumber: $whatsappNumber}')
printf 'window.__SLAMA_CONFIG__ = %s;\n' "$config" > /usr/share/nginx/html/config.js
