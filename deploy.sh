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
      "gemini-3.6-flash"
      "gemini-3.5-flash"
      "gemini-3.5-flash-lite"
      "gemini-3.1-pro-preview"
      "gemini-3.1-flash-lite"
      "gemini-3-flash-preview"
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

create_bigquery_dataset() {
  log_step "Creating BigQuery dataset (required for Terraform data source)"

  if bq show --project_id="${PROJECT_ID}" "${DATASET_ID}" &>/dev/null; then
    local existing_location
    existing_location=$(bq show --format=json --project_id="${PROJECT_ID}" "${DATASET_ID}" 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('location',''))" 2>/dev/null || echo "")
    log_skip "Dataset '${DATASET_ID}' already exists (location: ${existing_location})"

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

write_tfvars() {
  log "Generating terraform.tfvars from config.env..."
  local tfvars_file="${SCRIPT_DIR}/terraform/terraform.tfvars"
  
  # Prepare authorized_members array for HCL
  local members_hcl="["
  local first=true
  for member in "${AUTHORIZED_MEMBERS[@]}"; do
    if [[ "${first}" == "true" ]]; then
      first=false
    else
      members_hcl="${members_hcl},"
    fi
    members_hcl="${members_hcl}\"${member}\""
  done
  members_hcl="${members_hcl}]"

  # Prepare gemini_models array for HCL
  local models_hcl="["
  first=true
  for model in "${GEMINI_MODELS[@]}"; do
    if [[ "${first}" == "true" ]]; then
      first=false
    else
      models_hcl="${models_hcl},"
    fi
    models_hcl="${models_hcl}\"${model}\""
  done
  models_hcl="${models_hcl}]"

  cat > "${tfvars_file}" <<EOF
# Generated dynamically by deploy.sh from config.env. Do not edit directly.
project_id               = "${PROJECT_ID}"
region                   = "${REGION}"
dataset_id               = "${DATASET_ID}"
dataset_location         = "${DATASET_LOCATION}"
domain                   = "${DOMAIN}"
iap_oauth2_client_id     = "${IAP_CLIENT_ID}"
iap_oauth2_client_secret = "${IAP_CLIENT_SECRET}"
authorized_members       = ${members_hcl}
gemini_models            = ${models_hcl}
EOF
  log_ok "terraform.tfvars generated"
}

run_terraform() {
  log_step "Running Terraform to provision infrastructure"
  
  log "Initializing Terraform..."
  terraform -chdir="${SCRIPT_DIR}/terraform" init -upgrade
  
  log "Applying Terraform configuration..."
  terraform -chdir="${SCRIPT_DIR}/terraform" apply -auto-approve
  
  log_ok "Terraform provisioning complete"
}

deploy_cloud_run() {
  log_step "Building and deploying application to Cloud Run from source"
  
  local sa_email="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  
  # Get project number and backend service ID from Terraform to construct IAP_AUDIENCE
  local project_num
  project_num=$(terraform -chdir="${SCRIPT_DIR}/terraform" output -raw project_number 2>/dev/null || echo "")
  local backend_id
  backend_id=$(terraform -chdir="${SCRIPT_DIR}/terraform" output -raw backend_service_id 2>/dev/null || echo "")
  
  local iap_audience=""
  if [[ -n "${project_num}" && -n "${backend_id}" ]]; then
    iap_audience="/projects/${project_num}/global/backendServices/${backend_id}"
  fi

  local gemini_models_str
  gemini_models_str=$(IFS=,; echo "${GEMINI_MODELS[*]}")

  log "Deploying to Cloud Run — this uses Buildpacks to build from source..."
  gcloud run deploy "${SERVICE_NAME}" \
    --source "${SCRIPT_DIR}/app" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --service-account "${sa_email}" \
    --ingress "internal-and-cloud-load-balancing" \
    --set-env-vars "^;^PROJECT_ID=${PROJECT_ID};BQ_DATASET=${DATASET_ID};IAP_AUDIENCE=${iap_audience};GEMINI_MODELS=${gemini_models_str}" \
    --quiet

  log_ok "Cloud Run service build and deployment complete"
}

configure_iap() {
  log_step "Checking Identity-Aware Proxy (IAP) configuration"

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
    return 1  # Signal that deployment is incomplete
  fi

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

print_summary() {
  local complete=$1

  local dashboard_url
  dashboard_url=$(terraform -chdir="${SCRIPT_DIR}/terraform" output -raw dashboard_url 2>/dev/null || echo "")

  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  if [[ "${complete}" == "true" ]]; then
    echo -e "${GREEN}${BOLD}  ✔ Deployment Complete!${NC}"
  else
    echo -e "${YELLOW}${BOLD}  ⏸ Deployment Paused — IAP Credentials Required${NC}"
  fi
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Dashboard URL:  ${BOLD}${dashboard_url}${NC}"
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
  create_bigquery_dataset
  write_tfvars
  run_terraform
  deploy_cloud_run

  local iap_complete="true"
  if ! configure_iap; then
    iap_complete="false"
  else
    # Re-run Terraform apply to enable IAP on backend service if credentials are now populated
    log "Re-applying Terraform to enable IAP..."
    write_tfvars
    terraform -chdir="${SCRIPT_DIR}/terraform" apply -auto-approve
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
