#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Consumption Dashboard — Teardown / Uninstall
# ─────────────────────────────────────────────────────────────────────────────
# Removes all GCP resources created by deploy.sh.
# Your BigQuery data is preserved by default (pass --delete-data to remove it).
#
# Usage:
#   bash teardown.sh              # Remove infra, keep data
#   bash teardown.sh --delete-data  # Remove everything including BQ data
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly CONFIG_FILE="${SCRIPT_DIR}/config.env"
readonly SERVICE_NAME="agy-consumption-dashboard"
readonly SA_NAME="agy-dashboard-runner"

DELETE_DATA=false
if [[ "${1:-}" == "--delete-data" ]]; then
  DELETE_DATA=true
fi

# ── Colors & Logging ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "[$(date +'%H:%M:%S')] $1"; }
log_ok()  { echo -e "  ${GREEN}✔${NC} $1"; }
log_skip(){ echo -e "  ${YELLOW}⏭${NC} $1"; }
log_warn(){ echo -e "  ${YELLOW}⚠${NC} $1"; }
die()     { echo -e "  ${RED}✘${NC} $1" >&2; exit 1; }

# ── Load Configuration ──────────────────────────────────────────────────────
if [[ ! -f "${CONFIG_FILE}" ]]; then
  die "config.env not found. Cannot determine which resources to remove."
fi

# shellcheck source=/dev/null
source "${CONFIG_FILE}"
REGION="${REGION:-us-central1}"
DATASET_LOCATION="${DATASET_LOCATION:-US}"
DATASET_ID="${DATASET_ID:-agy_consumption}"

# ── Safety Check ─────────────────────────────────────────────────────────────
echo ""
echo -e "${RED}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}${BOLD}  WARNING: This will delete all dashboard resources${NC}"
echo -e "${RED}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Project:   ${PROJECT_ID}"
echo "  Region:    ${REGION}"
if [[ "${DELETE_DATA}" == "true" ]]; then
  echo -e "  Data:      ${RED}WILL BE DELETED${NC} (--delete-data flag set)"
else
  echo "  Data:      BigQuery dataset '${DATASET_ID}' will be PRESERVED"
fi
echo ""
echo "  Resources to delete:"
echo "    • Cloud Run service: ${SERVICE_NAME}"
echo "    • Load balancer: IP, NEG, backend, SSL cert, forwarding rules"
echo "    • IAP configuration"
echo "    • Service account: ${SA_NAME}"
echo "    • Scheduled query: Hourly Usage Aggregation"
if [[ "${DELETE_DATA}" == "true" ]]; then
  echo "    • BigQuery dataset: ${DATASET_ID} (ALL TABLES AND DATA)"
fi
echo ""

read -rp "Type 'yes' to confirm deletion: " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
log "Starting teardown..."

# Helper: silently delete, skip if not found
safe_delete() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    log_ok "Deleted: ${desc}"
  else
    log_skip "Not found: ${desc}"
  fi
}

# ── 1. Load Balancer (reverse order of creation) ────────────────────────────
log "Removing load balancer resources..."

safe_delete "HTTP redirect forwarding rule" \
  gcloud compute forwarding-rules delete agy-dashboard-http-redirect-rule \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "HTTP redirect proxy" \
  gcloud compute target-http-proxies delete agy-dashboard-http-redirect-proxy \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "HTTP redirect URL map" \
  gcloud compute url-maps delete agy-dashboard-redirect \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "HTTPS forwarding rule" \
  gcloud compute forwarding-rules delete agy-dashboard-forwarding-rule \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "HTTPS proxy" \
  gcloud compute target-https-proxies delete agy-dashboard-https-proxy \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "URL map" \
  gcloud compute url-maps delete agy-dashboard-url-map \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "SSL certificate" \
  gcloud compute ssl-certificates delete agy-dashboard-cert \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "Backend service" \
  gcloud compute backend-services delete agy-dashboard-backend \
    --global --project="${PROJECT_ID}" --quiet

safe_delete "Serverless NEG" \
  gcloud compute network-endpoint-groups delete agy-dashboard-neg \
    --region="${REGION}" --project="${PROJECT_ID}" --quiet

safe_delete "Static IP" \
  gcloud compute addresses delete agy-dashboard-ip \
    --global --project="${PROJECT_ID}" --quiet

# ── 2. Cloud Run ────────────────────────────────────────────────────────────
log "Removing Cloud Run service..."
safe_delete "Cloud Run service '${SERVICE_NAME}'" \
  gcloud run services delete "${SERVICE_NAME}" \
    --region="${REGION}" --project="${PROJECT_ID}" --quiet

# ── 3. Scheduled Query ─────────────────────────────────────────────────────
log "Removing scheduled query..."
local_transfer_id=$(bq ls --transfer_config --transfer_location="${DATASET_LOCATION}" \
  --project_id="${PROJECT_ID}" --format=json 2>/dev/null \
  | python3 -c "
import sys, json
configs = json.load(sys.stdin)
for c in configs:
    if c.get('displayName') == 'Hourly Usage Aggregation':
        print(c['name'])
        break
" 2>/dev/null || echo "")

if [[ -n "${local_transfer_id}" ]]; then
  bq rm --transfer_config --force "${local_transfer_id}" 2>/dev/null || true
  log_ok "Deleted: Scheduled query 'Hourly Usage Aggregation'"
else
  log_skip "Scheduled query not found"
fi

# ── 4. BigQuery Data ────────────────────────────────────────────────────────
if [[ "${DELETE_DATA}" == "true" ]]; then
  log "Removing BigQuery dataset and all data..."
  if bq show --project_id="${PROJECT_ID}" "${DATASET_ID}" &>/dev/null; then
    bq rm -r -f --project_id="${PROJECT_ID}" "${DATASET_ID}" 2>/dev/null || true
    log_ok "Deleted: BigQuery dataset '${DATASET_ID}' and all tables"
  else
    log_skip "Dataset '${DATASET_ID}' not found"
  fi
else
  log "Preserving BigQuery dataset '${DATASET_ID}' (use --delete-data to remove)"
fi

# ── 5. Service Account ─────────────────────────────────────────────────────
log "Removing service account..."
sa_email="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
safe_delete "Service account '${SA_NAME}'" \
  gcloud iam service-accounts delete "${sa_email}" \
    --project="${PROJECT_ID}" --quiet

# ── 6. Local Files ──────────────────────────────────────────────────────────
log "Cleaning up local files..."
if [[ -d "${SCRIPT_DIR}/.certs" ]]; then
  rm -rf "${SCRIPT_DIR}/.certs"
  log_ok "Deleted: .certs/ directory"
else
  log_skip ".certs/ not found"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✔ Teardown Complete${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  All dashboard resources have been removed from project '${PROJECT_ID}'."
if [[ "${DELETE_DATA}" != "true" ]]; then
  echo ""
  echo "  BigQuery dataset '${DATASET_ID}' was preserved."
  echo "  To delete it manually: bq rm -r -f --project_id=${PROJECT_ID} ${DATASET_ID}"
fi
echo ""
echo "  Note: GCP APIs that were enabled are NOT disabled (they may be"
echo "  used by other services in your project)."
echo ""
