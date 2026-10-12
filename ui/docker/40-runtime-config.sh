#!/bin/sh
set -eu

# JSON encoding prevents environment values from becoming executable JavaScript.
config=$(jq -cn --arg apiBaseUrl "${API_BASE_URL:-https://api-slama-finance.bamoya.com}" '{apiBaseUrl: $apiBaseUrl}')
printf 'window.__SLAMA_CONFIG__ = %s;\n' "$config" > /usr/share/nginx/html/config.js
