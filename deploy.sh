#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Consumption Dashboard — One-Command Deployment
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   1. Copy config.env.example → config.env and fill in your values
#   2. Run: bash deploy.sh
#   3. Follow the on-screen instructions for IAP setup (first time only)
#   4. Re-run: bash deploy.sh  (to complete IAP configuration)
#
# This script is idempotent — safe to re-run at any time.
# It uses only gcloud and bq CLI commands (no Terraform required).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly CONFIG_FILE="${SCRIPT_DIR}/config.env"
readonly SERVICE_NAME="agy-consumption-dashboard"
readonly SA_NAME="agy-dashboard-runner"

# ── Colors & Logging ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

STEP_COUNT=0
TOTAL_STEPS=11

log()      { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
log_step() { STEP_COUNT=$((STEP_COUNT + 1)); echo -e "\n${BOLD}${CYAN}[${STEP_COUNT}/${TOTAL_STEPS}]${NC} ${BOLD}$1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
log_skip() { echo -e "  ${YELLOW}⏭${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "  ${RED}✘${NC} $1" >&2; }
die()      { log_err "$1"; exit 1; }

# ── Load Configuration ──────────────────────────────────────────────────────
load_config() {
  if [[ ! -f "${CONFIG_FILE}" ]]; then
    echo ""
    echo -e "${RED}${BOLD}config.env not found.${NC}"
    echo ""
    echo "  Quick start:"
    echo "    cp config.env.example config.env"
    echo "    nano config.env          # fill in your values"
    echo "    bash deploy.sh"
    echo ""
    exit 1
  fi

  # Source the config file (it's valid bash)
  # shellcheck source=/dev/null
  source "${CONFIG_FILE}"

  # Apply defaults for optional values
  REGION="${REGION:-us-central1}"
  DATASET_LOCATION="${DATASET_LOCATION:-US}"
  DATASET_ID="${DATASET_ID:-agy_consumption}"
  DOMAIN="${DOMAIN:-}"
  IAP_CLIENT_ID="${IAP_CLIENT_ID:-}"
  IAP_CLIENT_SECRET="${IAP_CLIENT_SECRET:-}"

  # Default models if not set in config
  if [[ -z "${GEMINI_MODELS+x}" ]] || [[ ${#GEMINI_MODELS[@]} -eq 0 ]]; then
    GEMINI_MODELS=(
      "gemini-3.5-flash"
      "gemini-3.1-flash-lite"
      "gemini-2.5-pro"
      "gemini-2.5-flash"
      "gemini-2.5-flash-lite"
    )
  fi

  # Default authorized members if not set
  if [[ -z "${AUTHORIZED_MEMBERS+x}" ]] || [[ ${#AUTHORIZED_MEMBERS[@]} -eq 0 ]]; then
    die "AUTHORIZED_MEMBERS is empty in config.env. Add at least one user."
  fi
}

# ── Pre-flight Checks ───────────────────────────────────────────────────────
preflight() {
  log_step "Pre-flight checks"

  # Check gcloud is installed
  if ! command -v gcloud &>/dev/null; then
    die "gcloud CLI not found. Install it from: https://cloud.google.com/sdk/docs/install"
  fi
  log_ok "gcloud CLI found"

  # Check bq is installed (comes with Cloud SDK)
  if ! command -v bq &>/dev/null; then
    die "bq CLI not found. It should be included with Cloud SDK."
  fi
  log_ok "bq CLI found"

  # Check authentication
  local account
  account=$(gcloud config get-value account 2>/dev/null)
  if [[ -z "${account}" || "${account}" == "(unset)" ]]; then
    die "Not authenticated. Run: gcloud auth login"
  fi
  log_ok "Authenticated as ${account}"

  # Check application-default credentials
  if ! gcloud auth application-default print-access-token &>/dev/null; then
    log_warn "Application Default Credentials not set."
    echo "       Run: gcloud auth application-default login"
    echo "       Then re-run this script."
    exit 1
  fi
  log_ok "Application Default Credentials configured"

  # Validate project exists
  if [[ "${PROJECT_ID}" == "your-project-id" || -z "${PROJECT_ID}" ]]; then
    die "PROJECT_ID is not set in config.env. Edit the file and set your GCP project ID."
  fi

  if ! gcloud projects describe "${PROJECT_ID}" &>/dev/null; then
    die "Project '${PROJECT_ID}' not found. Check the PROJECT_ID in config.env."
  fi
  log_ok "Project '${PROJECT_ID}' exists"

  # Check billing
  local billing
  billing=$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)' 2>/dev/null || echo "")
  if [[ "${billing}" != "True" ]]; then
    log_warn "Billing may not be enabled on project '${PROJECT_ID}'."
    echo "       Some resources require billing. Enable it at:"
    echo "       https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
  else
    log_ok "Billing is enabled"
  fi

  # Get project number (used later for IAM bindings)
  PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
  log_ok "Project number: ${PROJECT_NUMBER}"

  # Set gcloud project
  gcloud config set project "${PROJECT_ID}" --quiet 2>/dev/null
}

# ── Step Functions ───────────────────────────────────────────────────────────

enable_apis() {
  log_step "Enabling required GCP APIs"

  local apis=(
    "aiplatform.googleapis.com"
    "bigquery.googleapis.com"
    "bigquerydatatransfer.googleapis.com"
    "run.googleapis.com"
    "iap.googleapis.com"
    "compute.googleapis.com"
    "artifactregistry.googleapis.com"
    "cloudbuild.googleapis.com"
    "iam.googleapis.com"
  )

  for api in "${apis[@]}"; do
    if gcloud services list --enabled --filter="config.name=${api}" --format='value(config.name)' --project="${PROJECT_ID}" 2>/dev/null | grep -q "${api}"; then
      log_skip "${api} (already enabled)"
    else
      log "  Enabling ${api}..."
      gcloud services enable "${api}" --project="${PROJECT_ID}" --quiet
      log_ok "${api}"
    fi
  done
}

create_bigquery_dataset() {
  log_step "Creating BigQuery dataset"

  if bq show --project_id="${PROJECT_ID}" "${DATASET_ID}" &>/dev/null; then
    local existing_location
    existing_location=$(bq show --format=json --project_id="${PROJECT_ID}" "${DATASET_ID}" 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('location',''))" 2>/dev/null || echo "")
    log_skip "Dataset '${DATASET_ID}' already exists (location: ${existing_location})"

    # Warn if location mismatch
    if [[ -n "${existing_location}" && "${existing_location}" != "${DATASET_LOCATION}" ]]; then
      log_warn "Dataset location is '${existing_location}' but config says '${DATASET_LOCATION}'."
      echo "         BigQuery dataset locations cannot be changed after creation."
      echo "         Using existing location '${existing_location}'."
      DATASET_LOCATION="${existing_location}"
    fi
  else
    log "  Creating dataset '${DATASET_ID}' in ${DATASET_LOCATION}..."
    bq --location="${DATASET_LOCATION}" mk \
      --dataset \
      --description="Antigravity consumption tracking data" \
      "${PROJECT_ID}:${DATASET_ID}"
    log_ok "Dataset '${DATASET_ID}' created in ${DATASET_LOCATION}"
  fi
}

create_bigquery_tables() {
  log_step "Creating BigQuery tables"

  local tables=("usage_summary_daily" "dashboard_settings" "user_mappings")
  for table in "${tables[@]}"; do
    local schema_file="${SCRIPT_DIR}/bq/schemas/${table}.json"
    if [[ ! -f "${schema_file}" ]]; then
      die "Schema file not found: ${schema_file}"
    fi

    if bq show --project_id="${PROJECT_ID}" "${DATASET_ID}.${table}" &>/dev/null; then
      log_skip "${table} (already exists)"
    else
      log "  Creating table '${table}'..."
      bq mk \
        --table \
        --project_id="${PROJECT_ID}" \
        --schema="${schema_file}" \
        "${DATASET_ID}.${table}"
      log_ok "Table '${table}' created"
    fi
  done

  # Note: request_response_logs is auto-created by Vertex AI logging — we don't create it.
  log_skip "request_response_logs (auto-created by Vertex AI when logging is enabled)"
}

enable_model_logging() {
  log_step "Enabling Gemini model request-response logging"

  local access_token
  access_token=$(gcloud auth application-default print-access-token 2>/dev/null)
  if [[ -z "${access_token}" ]]; then
    die "Could not get access token. Run: gcloud auth application-default login"
  fi

  for model in "${GEMINI_MODELS[@]}"; do
    log "  Enabling logging for ${model}..."
    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
      -X POST \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: application/json" \
      "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/global/publishers/google/models/${model}:setPublisherModelConfig" \
      -d "{
        \"publisherModelConfig\": {
          \"loggingConfig\": {
            \"enabled\": true,
            \"samplingRate\": 1.0,
            \"bigqueryDestination\": {
              \"outputUri\": \"bq://${PROJECT_ID}.${DATASET_ID}.request_response_logs\"
            }
          }
        }
      }" 2>/dev/null)

    if [[ "${http_code}" == "200" ]]; then
      log_ok "${model}"
    elif [[ "${http_code}" == "404" ]]; then
      log_warn "${model} — model not found or not available in your project (HTTP 404). Skipping."
    else
      log_warn "${model} — unexpected response (HTTP ${http_code}). Logging may not be enabled."
    fi
  done
}

create_scheduled_query() {
  log_step "Creating hourly aggregation scheduled query"

  local sql_file="${SCRIPT_DIR}/bq/queries/merge_usage_summary.sql"
  if [[ ! -f "${sql_file}" ]]; then
    die "SQL file not found: ${sql_file}"
  fi

  local sa_email="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

  # Check if scheduled query already exists
  local existing
  existing=$(bq ls --transfer_config --transfer_location="${DATASET_LOCATION}" \
    --project_id="${PROJECT_ID}" --format=json 2>/dev/null || echo "[]")

  if echo "${existing}" | python3 -c "
import sys, json
configs = json.load(sys.stdin)
for c in configs:
    if c.get('displayName') == 'Hourly Usage Aggregation':
        print('exists')
        break
" 2>/dev/null | grep -q "exists"; then
    log_skip "Scheduled query 'Hourly Usage Aggregation' already exists"
    return
  fi

  # Build the query from the template (replace template variables)
  local query
  query=$(sed -e "s/\${project_id}/${PROJECT_ID}/g" \
              -e "s/\${dataset_id}/${DATASET_ID}/g" \
              "${sql_file}")

  log "  Creating scheduled query..."
  bq mk \
    --transfer_config \
    --project_id="${PROJECT_ID}" \
    --data_source="scheduled_query" \
    --display_name="Hourly Usage Aggregation" \
    --target_dataset="${DATASET_ID}" \
    --location="${DATASET_LOCATION}" \
    --schedule="every 1 hours" \
    --service_account_name="${sa_email}" \
    --params="{\"query\": $(echo "${query}" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}"

  log_ok "Scheduled query created (runs every hour)"
}

create_service_account() {
  log_step "Creating service account & IAM bindings"

  local sa_email="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

  # Create service account
  if gcloud iam service-accounts describe "${sa_email}" --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "Service account '${SA_NAME}' already exists"
  else
    gcloud iam service-accounts create "${SA_NAME}" \
      --display-name="Antigravity Dashboard Cloud Run SA" \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "Service account '${SA_NAME}' created"
  fi

  # IAM bindings for the dashboard service account
  local sa_roles=(
    "roles/bigquery.dataViewer"
    "roles/bigquery.dataEditor"
    "roles/bigquery.jobUser"
  )
  for role in "${sa_roles[@]}"; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${sa_email}" \
      --role="${role}" \
      --condition=None \
      --quiet &>/dev/null
    log_ok "IAM: ${SA_NAME} → ${role}"
  done

  # Cloud Build service account needs these for source-based deploy
  local cloudbuild_sa="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${cloudbuild_sa}" \
    --role="roles/run.admin" \
    --condition=None \
    --quiet &>/dev/null
  log_ok "IAM: Cloud Build → roles/run.admin"

  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${cloudbuild_sa}" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None \
    --quiet &>/dev/null
  log_ok "IAM: Cloud Build → roles/iam.serviceAccountUser"

  # BigQuery Data Transfer Service SA
  local bq_transfer_sa="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-bigquerydatatransfer.iam.gserviceaccount.com"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${bq_transfer_sa}" \
    --role="roles/bigquery.dataEditor" \
    --condition=None \
    --quiet &>/dev/null 2>&1 || true  # SA may not exist yet until first transfer runs
  log_ok "IAM: BQ Data Transfer → roles/bigquery.dataEditor"

  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${bq_transfer_sa}" \
    --role="roles/bigquery.dataViewer" \
    --condition=None \
    --quiet &>/dev/null 2>&1 || true
  log_ok "IAM: BQ Data Transfer → roles/bigquery.dataViewer"

  # Initialize IAP service identity (required before IAP can call Cloud Run)
  gcloud beta services identity create \
    --service=iap.googleapis.com \
    --project="${PROJECT_ID}" \
    --quiet &>/dev/null 2>&1 || true
  log_ok "IAP service identity initialized"

  # IAP SA → Cloud Run invoker
  local iap_sa="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region="${REGION}" \
    --member="${iap_sa}" \
    --role="roles/run.invoker" \
    --project="${PROJECT_ID}" \
    --quiet &>/dev/null 2>&1 || true  # May fail if Cloud Run service doesn't exist yet; will retry after deploy
  log_ok "IAM: IAP SA → roles/run.invoker (on Cloud Run)"
}

deploy_cloud_run() {
  log_step "Deploying to Cloud Run (source-based build)"

  local sa_email="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

  # Skip rebuild if service already exists (Phase 2 re-run only needs IAP config, not a full rebuild)
  if gcloud run services describe "${SERVICE_NAME}" \
       --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "Cloud Run service '${SERVICE_NAME}' already deployed (skipping rebuild)"
  else
    log "  Building and deploying from ./app — this may take 3–5 minutes..."

    # We'll set IAP_AUDIENCE after the backend service is created.
    # For now, deploy with a placeholder — it will be updated below.
    gcloud run deploy "${SERVICE_NAME}" \
      --source "${SCRIPT_DIR}/app" \
      --region "${REGION}" \
      --project "${PROJECT_ID}" \
      --service-account "${sa_email}" \
      --ingress "internal-and-cloud-load-balancing" \
      --set-env-vars "PROJECT_ID=${PROJECT_ID},BQ_DATASET=${DATASET_ID}" \
      --quiet

    log_ok "Cloud Run service deployed"
  fi

  # Ensure IAP SA can invoke Cloud Run (idempotent)
  local iap_sa="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region="${REGION}" \
    --member="${iap_sa}" \
    --role="roles/run.invoker" \
    --project="${PROJECT_ID}" \
    --quiet &>/dev/null
  log_ok "IAP SA can invoke Cloud Run"
}

create_load_balancer() {
  log_step "Creating HTTPS Load Balancer & IAP"

  # 1. Static IP
  if gcloud compute addresses describe agy-dashboard-ip --global --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "Static IP 'agy-dashboard-ip' already exists"
  else
    gcloud compute addresses create agy-dashboard-ip \
      --global \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "Static IP created"
  fi
  STATIC_IP=$(gcloud compute addresses describe agy-dashboard-ip \
    --global --project="${PROJECT_ID}" --format='value(address)')
  log_ok "Static IP: ${STATIC_IP}"

  # 2. Serverless NEG
  if gcloud compute network-endpoint-groups describe agy-dashboard-neg \
       --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "Serverless NEG already exists"
  else
    gcloud compute network-endpoint-groups create agy-dashboard-neg \
      --region="${REGION}" \
      --network-endpoint-type=serverless \
      --cloud-run-service="${SERVICE_NAME}" \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "Serverless NEG created"
  fi

  # 3. Backend Service
  if gcloud compute backend-services describe agy-dashboard-backend \
       --global --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "Backend service already exists"
  else
    gcloud compute backend-services create agy-dashboard-backend \
      --global \
      --protocol=HTTP \
      --load-balancing-scheme=EXTERNAL_MANAGED \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "Backend service created"

    # Add the NEG as a backend
    gcloud compute backend-services add-backend agy-dashboard-backend \
      --global \
      --network-endpoint-group=agy-dashboard-neg \
      --network-endpoint-group-region="${REGION}" \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "NEG attached to backend service"
  fi

  # Get backend service generated ID for IAP_AUDIENCE
  BACKEND_SERVICE_ID=$(gcloud compute backend-services describe agy-dashboard-backend \
    --global --project="${PROJECT_ID}" --format='value(id)')
  IAP_AUDIENCE="/projects/${PROJECT_NUMBER}/global/backendServices/${BACKEND_SERVICE_ID}"

  # Update Cloud Run with the correct IAP_AUDIENCE env var
  gcloud run services update "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --update-env-vars "IAP_AUDIENCE=${IAP_AUDIENCE}" \
    --quiet
  log_ok "Cloud Run IAP_AUDIENCE updated"

  # 4. SSL Certificate — Google-managed (if DOMAIN set) or self-signed (IP-only)
  if [[ -n "${DOMAIN}" ]]; then
    # Google-managed cert: trusted by browsers, auto-renews, requires a domain with DNS pointing to the static IP
    if gcloud compute ssl-certificates describe agy-dashboard-cert \
         --global --project="${PROJECT_ID}" &>/dev/null 2>&1; then
      log_skip "SSL certificate resource already exists"
    else
      gcloud compute ssl-certificates create agy-dashboard-cert \
        --domains="${DOMAIN}" \
        --global \
        --project="${PROJECT_ID}" \
        --quiet
      log_ok "Google-managed SSL certificate created for ${DOMAIN}"
      log_warn "DNS must point ${DOMAIN} → ${STATIC_IP} for the cert to provision (takes 15-60 min)"
    fi
  else
    # Self-signed cert: works with raw IP, but browsers show a security warning
    local cert_dir="${SCRIPT_DIR}/.certs"
    mkdir -p "${cert_dir}"
    if [[ ! -f "${cert_dir}/dashboard.crt" ]]; then
      openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "${cert_dir}/dashboard.key" \
        -out "${cert_dir}/dashboard.crt" \
        -days 3650 \
        -subj "/CN=${SERVICE_NAME}/O=Antigravity" 2>/dev/null
      log_ok "Self-signed SSL certificate generated (no domain configured)"
    else
      log_skip "SSL certificate already exists"
    fi

    if gcloud compute ssl-certificates describe agy-dashboard-cert \
         --global --project="${PROJECT_ID}" &>/dev/null 2>&1; then
      log_skip "SSL certificate resource already exists"
    else
      gcloud compute ssl-certificates create agy-dashboard-cert \
        --certificate="${cert_dir}/dashboard.crt" \
        --private-key="${cert_dir}/dashboard.key" \
        --global \
        --project="${PROJECT_ID}" \
        --quiet
      log_ok "SSL certificate uploaded to GCP"
    fi
  fi

  # 5. URL Map
  if gcloud compute url-maps describe agy-dashboard-url-map \
       --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "URL map already exists"
  else
    gcloud compute url-maps create agy-dashboard-url-map \
      --default-service=agy-dashboard-backend \
      --global \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "URL map created"
  fi

  # 6. HTTPS Target Proxy
  if gcloud compute target-https-proxies describe agy-dashboard-https-proxy \
       --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "HTTPS proxy already exists"
  else
    gcloud compute target-https-proxies create agy-dashboard-https-proxy \
      --url-map=agy-dashboard-url-map \
      --ssl-certificates=agy-dashboard-cert \
      --global \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "HTTPS proxy created"
  fi

  # 7. HTTPS Forwarding Rule (port 443)
  if gcloud compute forwarding-rules describe agy-dashboard-forwarding-rule \
       --global --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "HTTPS forwarding rule already exists"
  else
    gcloud compute forwarding-rules create agy-dashboard-forwarding-rule \
      --global \
      --target-https-proxy=agy-dashboard-https-proxy \
      --ports=443 \
      --address=agy-dashboard-ip \
      --load-balancing-scheme=EXTERNAL_MANAGED \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "HTTPS forwarding rule created (port 443)"
  fi

  # 8. HTTP → HTTPS Redirect
  if gcloud compute url-maps describe agy-dashboard-redirect \
       --project="${PROJECT_ID}" &>/dev/null; then
    log_skip "HTTP redirect already exists"
  else
    gcloud compute url-maps import agy-dashboard-redirect \
      --global \
      --project="${PROJECT_ID}" \
      --quiet <<'YAML'
name: agy-dashboard-redirect
defaultUrlRedirect:
  httpsRedirect: true
  stripQuery: false
YAML
    log_ok "HTTP redirect URL map created"

    gcloud compute target-http-proxies create agy-dashboard-http-redirect-proxy \
      --url-map=agy-dashboard-redirect \
      --global \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "HTTP redirect proxy created"

    gcloud compute forwarding-rules create agy-dashboard-http-redirect-rule \
      --global \
      --target-http-proxy=agy-dashboard-http-redirect-proxy \
      --ports=80 \
      --address=agy-dashboard-ip \
      --load-balancing-scheme=EXTERNAL_MANAGED \
      --project="${PROJECT_ID}" \
      --quiet
    log_ok "HTTP redirect forwarding rule created (port 80)"
  fi
}

configure_iap() {
  log_step "Configuring Identity-Aware Proxy (IAP)"

  if [[ -z "${IAP_CLIENT_ID}" || -z "${IAP_CLIENT_SECRET}" ]]; then
    echo ""
    echo -e "${YELLOW}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}${BOLD}  ACTION REQUIRED: Create IAP OAuth Credentials${NC}"
    echo -e "${YELLOW}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Infrastructure is deployed, but IAP login is not yet configured."
    echo "  This is a one-time manual step (Google requires it)."
    echo ""
    echo -e "  ${BOLD}Step 1: Configure OAuth Consent Screen${NC}"
    echo "    Open: https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}"
    echo "    • User type: External"
    echo "    • App name: Antigravity Consumption Dashboard"
    echo "    • Support email: your email"
    echo "    • Click Save and Continue through all steps"
    echo ""
    echo -e "  ${BOLD}Step 2: Create OAuth Client ID${NC}"
    echo "    Open: https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}"
    echo "    • Click '+ CREATE CREDENTIALS' → 'OAuth client ID'"
    echo "    • Application type: Web application"
    echo "    • Name: Antigravity Consumption Dashboard"
    echo "    • Authorized redirect URIs: (leave empty for now)"
    echo "    • Click Create"
    echo "    • Copy the Client ID and Client Secret"
    echo ""
    echo -e "  ${BOLD}Step 3: Add Redirect URI${NC}"
    echo "    • Go back to your OAuth client and edit it"
    echo "    • Add this Authorized redirect URI:"
    echo "      https://iap.googleapis.com/v1/oauth/clientIds/<YOUR_CLIENT_ID>:handleRedirect"
    echo "      (replace <YOUR_CLIENT_ID> with the Client ID you just copied)"
    echo ""
    echo -e "  ${BOLD}Step 4: Update config.env${NC}"
    echo "    Open config.env in a text editor and set:"
    echo '    IAP_CLIENT_ID="your-client-id-here"'
    echo '    IAP_CLIENT_SECRET="your-client-secret-here"'
    echo ""
    echo -e "  ${BOLD}Step 5: Re-run this script${NC}"
    echo "    bash deploy.sh"
    echo ""
    echo -e "${YELLOW}${BOLD}═══════════════════════════════════════════════════════════════${NC}"

    # Still set up IAP IAM bindings (these don't need OAuth credentials)
    for member in "${AUTHORIZED_MEMBERS[@]}"; do
      gcloud iap web add-iam-policy-binding \
        --resource-type=backend-services \
        --service=agy-dashboard-backend \
        --member="${member}" \
        --role="roles/iap.httpsResourceAccessor" \
        --project="${PROJECT_ID}" \
        --quiet &>/dev/null 2>&1 || true
      log_ok "IAP access: ${member}"
    done

    return 1  # Signal that deployment is incomplete
  fi

  # Credentials are provided — enable IAP on the backend service
  log "  Applying IAP credentials..."

  gcloud compute backend-services update agy-dashboard-backend \
    --global \
    --iap="enabled,oauth2-client-id=${IAP_CLIENT_ID},oauth2-client-secret=${IAP_CLIENT_SECRET}" \
    --project="${PROJECT_ID}" \
    --quiet
  log_ok "IAP enabled with OAuth credentials"

  # Set IAP IAM bindings
  for member in "${AUTHORIZED_MEMBERS[@]}"; do
    gcloud iap web add-iam-policy-binding \
      --resource-type=backend-services \
      --service=agy-dashboard-backend \
      --member="${member}" \
      --role="roles/iap.httpsResourceAccessor" \
      --project="${PROJECT_ID}" \
      --quiet &>/dev/null 2>&1 || true
    log_ok "IAP access: ${member}"
  done

  # Best-effort: Update OAuth consent screen title
  local access_token brand_name
  access_token=$(gcloud auth print-access-token 2>/dev/null || echo "")
  if [[ -n "${access_token}" ]]; then
    brand_name=$(gcloud iap oauth-brands list \
      --project="${PROJECT_ID}" \
      --format='value(name)' 2>/dev/null | head -1)
    if [[ -n "${brand_name}" ]]; then
      local account
      account=$(gcloud config get-value account 2>/dev/null)
      curl -s -o /dev/null \
        -X PATCH \
        -H "Authorization: Bearer ${access_token}" \
        -H "Content-Type: application/json" \
        "https://iap.googleapis.com/v1/${brand_name}?updateMask=applicationTitle,supportEmail" \
        -d "{\"applicationTitle\": \"Antigravity Consumption Dashboard\", \"supportEmail\": \"${account}\"}" 2>/dev/null || true
    fi
  fi

  return 0
}

# ── Summary ──────────────────────────────────────────────────────────────────
print_summary() {
  local complete=$1

  STATIC_IP=$(gcloud compute addresses describe agy-dashboard-ip \
    --global --project="${PROJECT_ID}" --format='value(address)' 2>/dev/null || echo "")

  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  if [[ "${complete}" == "true" ]]; then
    echo -e "${GREEN}${BOLD}  ✔ Deployment Complete!${NC}"
  else
    echo -e "${YELLOW}${BOLD}  ⏸ Deployment Paused — IAP Credentials Required${NC}"
  fi
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  if [[ -n "${DOMAIN}" ]]; then
    echo -e "  Dashboard URL:  ${BOLD}https://${DOMAIN}${NC}"
  else
    echo -e "  Dashboard URL:  ${BOLD}https://${STATIC_IP}${NC}"
  fi
  echo "  Project:        ${PROJECT_ID}"
  echo "  Region:         ${REGION}"
  echo ""

  if [[ "${complete}" == "true" ]]; then
    echo "  Access Control: Only authorized members can access via IAP."
    echo ""
    echo "  Authorized members:"
    for member in "${AUTHORIZED_MEMBERS[@]}"; do
      echo "    • ${member}"
    done
    echo ""
    echo "  Monitored Gemini models:"
    for model in "${GEMINI_MODELS[@]}"; do
      echo "    • ${model}"
    done
    echo ""
    if [[ -n "${DOMAIN}" ]]; then
      echo -e "  ${YELLOW}Note:${NC} The Google-managed SSL certificate may take 15–60 minutes"
      echo "  to provision. Until then, you may see a browser certificate warning."
      echo "  Ensure DNS points ${DOMAIN} → ${STATIC_IP}."
    else
      echo -e "  ${YELLOW}Note:${NC} The self-signed SSL certificate will show a browser"
      echo "  warning. This is expected — click 'Advanced' → 'Proceed'."
    fi
  else
    echo "  To complete deployment:"
    echo "    1. Create IAP OAuth credentials (see instructions above)"
    echo "    2. Update config.env with credentials"
    echo "    3. Re-run: bash deploy.sh"
  fi
  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}${CYAN}Antigravity Consumption Dashboard — Deployment${NC}"
  echo -e "${CYAN}────────────────────────────────────────────────${NC}"
  echo ""

  load_config
  preflight
  enable_apis
  create_bigquery_dataset
  create_bigquery_tables
  enable_model_logging
  create_service_account       # Must run before scheduled query (SA is the query runner)
  create_scheduled_query
  deploy_cloud_run
  create_load_balancer

  local iap_complete="true"
  if ! configure_iap; then
    iap_complete="false"
  fi

  print_summary "${iap_complete}"

  if [[ "${iap_complete}" == "true" ]]; then
    log "Deployment finished successfully."
  else
    log "Infrastructure deployed. Waiting for IAP credentials to complete setup."
    exit 0  # Exit cleanly — this is expected on first run
  fi
}

main "$@"
