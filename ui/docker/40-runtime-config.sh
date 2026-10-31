#!/bin/sh
set -eu

# JSON encoding prevents environment values from becoming executable JavaScript.
config=$(jq -cn --arg apiBaseUrl "${API_BASE_URL:-https://api-slama-finance.bamoya.com}" --arg contactEmail "${PUBLIC_CONTACT_EMAIL:-}" --arg whatsappNumber "${PUBLIC_WHATSAPP_NUMBER:-}" '{apiBaseUrl: $apiBaseUrl, contactEmail: $contactEmail, whatsappNumber: $whatsappNumber}')
printf 'window.__SLAMA_CONFIG__ = %s;\n' "$config" > /usr/share/nginx/html/config.js
