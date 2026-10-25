#!/usr/bin/env bash
# ==============================================================================
# Automatic Cloudflare DNS Provisioner for Sheba ERP (Dokploy Stack)
# ==============================================================================
# Creates or updates DNS records for:
#   - v2.shebafi.xyz        (Backend API)
#   - beta.shebafi.xyz      (Frontend Dashboard)
#   - *.beta.shebafi.xyz    (Beta Tenant Wildcards)
#   - *.shebafi.xyz         (Apex Tenant Wildcards)
# ==============================================================================

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-shebafi.xyz}"
SERVER_IP="${SERVER_IP:-}"
CF_API_TOKEN="${CF_API_TOKEN:-}"
PROXIED="${PROXIED:-false}" # Set to true for Cloudflare Orange Cloud (CDN/DDoS)

if [ -z "$CF_API_TOKEN" ]; then
    read -rp "Enter your Cloudflare API Token (Zone.DNS Edit permission): " CF_API_TOKEN
fi

if [ -z "$SERVER_IP" ]; then
    read -rp "Enter your Dokploy VPS Public IP: " SERVER_IP
fi

echo "==> Fetching Zone ID for '$ZONE_NAME' from Cloudflare..."
ZONE_RESP=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")

SUCCESS=$(echo "$ZONE_RESP" | grep -o '"success":true' || true)
if [ -z "$SUCCESS" ]; then
    echo "ERROR: Failed to fetch Zone ID. Response:"
    echo "$ZONE_RESP"
    exit 1
fi

ZONE_ID=$(echo "$ZONE_RESP" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "==> Found Zone ID: $ZONE_ID"

RECORDS=(
    "@"
    "www"
    "admin"
    "app"
    "api"
    "*"
)

create_or_update_record() {
    local record_name="$1"
    local full_name="${record_name}.${ZONE_NAME}"
    if [ "$record_name" = "@" ] || [ "$record_name" = "" ]; then
        full_name="${ZONE_NAME}"
    fi

    echo "==> Processing DNS record: $full_name -> $SERVER_IP (proxied: $PROXIED)..."

    # Check if record exists
    local search_resp
    search_resp=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A&name=${full_name}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json")

    local existing_id
    existing_id=$(echo "$search_resp" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4 || true)

    if [ -n "$existing_id" ]; then
        echo "    Existing record found ($existing_id). Updating..."
        local update_resp
        update_resp=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${existing_id}" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "{\"type\":\"A\",\"name\":\"${full_name}\",\"content\":\"${SERVER_IP}\",\"ttl\":1,\"proxied\":${PROXIED}}")
        echo "    Result: $(echo "$update_resp" | grep -o '"success":[^,}]*')"
    else
        echo "    Creating new A record..."
        local create_resp
        create_resp=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "{\"type\":\"A\",\"name\":\"${full_name}\",\"content\":\"${SERVER_IP}\",\"ttl\":1,\"proxied\":${PROXIED}}")
        echo "    Result: $(echo "$create_resp" | grep -o '"success":[^,}]*')"
    fi
}

for rec in "${RECORDS[@]}"; do
    create_or_update_record "$rec"
done

echo ""
echo "=============================================================================="
echo " [SUCCESS] Cloudflare DNS records created successfully!"
echo "   - ${ZONE_NAME}          -> ${SERVER_IP} (Homepage)"
echo "   - www.${ZONE_NAME}      -> ${SERVER_IP} (Homepage WWW)"
echo "   - admin.${ZONE_NAME}    -> ${SERVER_IP} (SaaS Control Plane)"
echo "   - app.${ZONE_NAME}      -> ${SERVER_IP} (ISP / Org Admin)"
echo "   - api.${ZONE_NAME}      -> ${SERVER_IP} (Backend API)"
echo "   - *.${ZONE_NAME}        -> ${SERVER_IP} (Tenant Portals)"
echo "=============================================================================="
