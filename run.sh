#!/usr/bin/env bash
set -euo pipefail

export WILMAI_CONFIG_PATH=/data/wilmai/config.json
SERVICE=$(jq -r '.notify_service' /data/options.json)

DATA=$(wilma summary --all-students --json)
MSG=$(echo "$DATA" | jq -r '.')   # TODO: oikea muotoilu

curl -s -X POST \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg m "$MSG" '{title:"Koulu tänään", message:$m}')" \
  "http://supervisor/core/api/services/notify/$SERVICE"
