# Antigravity Consumption Dashboard — Deployment Guide

This guide walks you through deploying the **Antigravity Consumption Dashboard** to Google Cloud Platform (GCP).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Configuration Reference (`config.env`)](#configuration-reference-configenv)
5. [Deployment Workflow](#deployment-workflow)
   - [Phase 1: Infrastructure Provisioning](#phase-1-infrastructure-provisioning)
   - [Phase 2: IAP OAuth Credentials Setup](#phase-2-iap-oauth-credentials-setup)
   - [Phase 3: Activation and Verification](#phase-3-activation-and-verification)
6. [Custom Domain & SSL Setup](#custom-domain--ssl-setup)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Maintenance & Operations](#maintenance--operations)
9. [Teardown & Decommissioning](#teardown--decommissioning)
10. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Architecture Overview

The dashboard tracks per-user usage, token consumption, and inferred costs for **Antigravity CLI** and **Antigravity 2.0** by intercepting model calls logged via Vertex AI:

```mermaid
graph TD
    subgraph "Client Layer"
        CLI["Antigravity CLI / Antigravity 2.0"]
        Admin["Enterprise Admin Browser"]
    end

    subgraph "Google Cloud Platform"
        VertexAI["Vertex AI Publisher Endpoints\n(aiplatform.googleapis.com)"]
        
        subgraph "BigQuery Dataset (agy_consumption)"
            LogsTable["request_response_logs\n(Raw Vertex AI Logs)"]
            ScheduledQuery["Hourly Scheduled Query\n(merge_usage_summary.sql)"]
            DailyTable["usage_summary_daily\n(Materialized Aggregations)"]
            SettingsTable["dashboard_settings\n(Custom Model Pricing)"]
            UserMappingsTable["user_mappings\n(OS User → Corporate ID)"]
        end

        subgraph "Ingress & Security"
            StaticIP["Global Static IP\n(agy-dashboard-ip)"]
            LB["Global HTTPS Load Balancer\n(URL Maps + SSL Cert)"]
            IAP["Identity-Aware Proxy (IAP)\n(OAuth Access Control)"]
        end

        subgraph "Application Layer"
            CloudRun["Cloud Run Service\n(agy-consumption-dashboard)\nNext.js 15 App"]
            ServiceAccount["Service Account\n(agy-dashboard-runner)"]
        end
    end

    CLI -->|"StreamGenerateContent"| VertexAI
    VertexAI -->|"setPublisherModelConfig"| LogsTable
    LogsTable --> ScheduledQuery
    ScheduledQuery --> DailyTable

    Admin -->|"HTTPS (Port 443)"| StaticIP
    StaticIP --> LB
    LB --> IAP
    IAP -->|"Validated JWT & Identity"| CloudRun
    CloudRun --> ServiceAccount
    ServiceAccount -->|"Query & Update"| BigQuery Dataset
```

---

## Prerequisites

Before running the deployment script, ensure you have:

1. **GCP Project**: A Google Cloud Project with [Billing enabled](https://console.cloud.google.com/billing).
2. **Google Cloud SDK (`gcloud`)**: Version >= 450.0.0. Install via [Cloud SDK docs](https://cloud.google.com/sdk/docs/install).
3. **BigQuery CLI (`bq`)**: Included with Google Cloud SDK.
4. **Terraform**: Version >= 1.5.0 installed and in `$PATH`.
5. **IAM Permissions**: You must have `roles/owner` or `roles/editor` + `roles/resourcemanager.projectIamAdmin` on the target project.
6. **Authentication & ADC**:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/irahardianto/agy-consumption-dashboard.git
cd agy-consumption-dashboard

# 2. Create and edit your configuration
cp config.env.example config.env
nano config.env

# 3. Run deployment script (Phase 1: deploys infrastructure)
bash deploy.sh

# 4. Create IAP OAuth credentials following on-screen instructions
#    (See docs/iap-setup.md for detailed steps)

# 5. Add IAP credentials to config.env and re-run to complete setup
bash deploy.sh
```

---

## Configuration Reference (`config.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROJECT_ID` | **Yes** | — | Google Cloud Project ID to deploy into. |
| `AUTHORIZED_MEMBERS` | **Yes** | `()` | Array of members permitted to access dashboard via IAP (e.g. `"user:admin@example.com"`, `"group:team@example.com"`). |
| `REGION` | No | `us-central1` | GCP region for Cloud Run and regional load balancer resources. |
| `DATASET_LOCATION` | No | `US` | BigQuery dataset location (`US`, `EU`, or region name). *Cannot be changed after creation.* |
| `DATASET_ID` | No | `agy_consumption` | BigQuery dataset identifier. |
| `DOMAIN` | No | `""` | Custom domain (e.g., `dashboard.company.com`). If unset, self-signed SSL on static IP is used. |
| `GEMINI_MODELS` | No | *(GA models)* | List of Gemini models enabled for request-response logging. |
| `IAP_CLIENT_ID` | No* | `""` | OAuth 2.0 Client ID for IAP (*required in Phase 2*). |
| `IAP_CLIENT_SECRET` | No* | `""` | OAuth 2.0 Client Secret for IAP (*required in Phase 2*). |

---

## Deployment Workflow

### Phase 1: Infrastructure Provisioning

Run the deployment script:
```bash
bash deploy.sh
```

`deploy.sh` executes the following steps idempotently:
1. **Pre-flight Validation**: Checks CLI tools, authentication, project status, billing, and Application Default Credentials.
2. **BigQuery Dataset**: Creates the `${DATASET_ID}` dataset if it does not exist.
3. **Terraform Generation**: Generates `terraform/terraform.tfvars` from `config.env`.
4. **Terraform Apply**: Provisions:
   - Required GCP APIs (`aiplatform`, `bigquery`, `bigquerydatatransfer`, `run`, `iap`, `compute`, `iam`).
   - Service account `agy-dashboard-runner` with roles `roles/bigquery.jobUser`, `roles/bigquery.dataViewer`, and `roles/bigquery.dataEditor`.
   - BigQuery tables (`dashboard_settings`, `user_mappings`, `usage_summary_daily`).
   - Hourly Scheduled Query (`google_bigquery_data_transfer_config`) executing `merge_usage_summary.sql`.
   - Vertex AI request-response logging enablement for all specified Gemini models via `setPublisherModelConfig`.
   - Global static IP (`agy-dashboard-ip`), Serverless Network Endpoint Group (`agy-dashboard-neg`), Backend Service (`agy-dashboard-backend`), URL maps, SSL certificate, HTTP-to-HTTPS redirect, and forwarding rules.
5. **Cloud Run Build & Deploy**: Builds the Next.js application from source using Google Cloud Buildpacks and deploys to Cloud Run with `internal-and-cloud-load-balancing` ingress.

### Phase 2: IAP OAuth Credentials Setup

Because the IAP OAuth Admin API was deprecated in March 2026, Google requires OAuth Consent screen and Web Client ID creation via GCP Console:

1. Open [Google Cloud Credentials Console](https://console.cloud.google.com/apis/credentials).
2. Follow the detailed steps in [docs/iap-setup.md](iap-setup.md).
3. Copy the generated **Client ID** and **Client Secret**.

### Phase 3: Activation and Verification

1. Open `config.env` and populate:
   ```bash
   IAP_CLIENT_ID="<YOUR_CLIENT_ID>.apps.googleusercontent.com"
   IAP_CLIENT_SECRET="<YOUR_CLIENT_SECRET>"
   ```
2. Re-run deployment:
   ```bash
   bash deploy.sh
   ```
3. Terraform will update the Backend Service with IAP credentials and grant `roles/iap.httpsResourceAccessor` to all `AUTHORIZED_MEMBERS`.

---

## Custom Domain & SSL Setup

### Using a Custom Domain (Recommended for Production)

1. Set `DOMAIN="dashboard.yourcompany.com"` in `config.env`.
2. Run `bash deploy.sh`.
3. Note the static IP printed in the summary (or retrieve via `gcloud compute addresses describe agy-dashboard-ip --global`).
4. In your DNS provider, create an **A Record**:
   ```
   dashboard.yourcompany.com  IN  A  <STATIC_IP>
   ```
5. Google Cloud will automatically provision and validate a Google-managed SSL certificate (typically takes 15–30 minutes after DNS propagation).

### Using Static IP with Self-Signed Certificate

If `DOMAIN` is left blank:
- Terraform automatically generates a self-signed TLS certificate for the static IP.
- You can access the dashboard directly at `https://<STATIC_IP>`.
- Your browser will display a certificate warning (e.g. `NET::ERR_CERT_AUTHORITY_INVALID`). Click **Advanced → Proceed** to continue.

---

## Post-Deployment Verification

Verify your deployment with the following checks:

### 1. Ingress & IAP Verification
- Navigate to your dashboard URL (`https://<DOMAIN>` or `https://<STATIC_IP>`).
- You should be prompted to sign in with your Google account.
- Sign in with an account in `AUTHORIZED_MEMBERS`. The dashboard should load the Overview page with your email displayed in the navigation bar.
- Test with an unauthorized Google account: it should return HTTP 403 Forbidden.

### 2. BigQuery Tables Verification
Check that the tables exist in BigQuery:
```bash
bq ls ${PROJECT_ID}:${DATASET_ID}
```
Expected tables:
- `dashboard_settings`
- `user_mappings`
- `usage_summary_daily`
- `request_response_logs` (created upon first logged Vertex AI call)

### 3. Scheduled Query Verification
Check that the data transfer job is active:
```bash
bq ls --transfer_config --transfer_location=${DATASET_LOCATION} --project_id=${PROJECT_ID}
```

### 4. Vertex AI Request-Response Logging
Run an Antigravity CLI or 2.0 command using a monitored Gemini model. Within 1–2 minutes, verify raw logs appear:
```bash
bq query --use_legacy_sql=false \
  "SELECT logging_time, model, JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') AS session FROM \`${PROJECT_ID}.${DATASET_ID}.request_response_logs\` LIMIT 5"
```

---

## Maintenance & Operations

### Updating Model Tracking
To add or remove monitored Gemini models, edit `GEMINI_MODELS` in `config.env` and re-run `bash deploy.sh`.

### Updating Authorized Users
To add or revoke user access, edit `AUTHORIZED_MEMBERS` in `config.env` and re-run `bash deploy.sh`.

### Managing Pricing and User Mappings
Admins can customize model rates and upload user identity mappings (OS username → corporate email/team) directly in the dashboard UI under `/settings`. Mappings persist across re-deployments in the `dashboard_settings` and `user_mappings` BigQuery tables.

---

## Teardown & Decommissioning

To remove all dashboard resources:

```bash
# Option 1: Remove infrastructure, PRESERVE BigQuery data and history
bash teardown.sh

# Option 2: Remove EVERYTHING including all BigQuery datasets and historical usage tables
bash teardown.sh --delete-data
```

---

## Troubleshooting & FAQ

### 1. "Application Default Credentials not set"
**Cause:** Local environment lacks ADC credentials for Terraform or Vertex AI API calls.  
**Fix:** Run `gcloud auth application-default login` and re-run `deploy.sh`.

### 2. "IAP 403 Forbidden: You do not have access"
**Cause:** The logged-in Google account is not listed in `AUTHORIZED_MEMBERS`.  
**Fix:** Add `user:<your-email>` to `AUTHORIZED_MEMBERS` in `config.env` and re-run `deploy.sh`.

### 3. "Invalid Redirect URI" during OAuth Login
**Cause:** The OAuth Client ID in GCP Console does not have the IAP redirect URI.  
**Fix:** Ensure the following Authorized Redirect URI is added to your OAuth client:
`https://iap.googleapis.com/v1/oauth/clientIds/<YOUR_CLIENT_ID>:handleRedirect`

### 4. Google-Managed SSL Certificate stuck in `PROVISIONING`
**Cause:** DNS A record has not yet propagated to the static IP.  
**Fix:** Verify DNS resolution with `dig +short <DOMAIN>`. Managed cert validation takes 15–45 minutes after DNS is pointing to `<STATIC_IP>`.

### 5. BigQuery Scheduled Query Fails with Permission Error
**Cause:** BigQuery Data Transfer Service Agent lacks permissions.  
**Fix:** Grant `roles/bigquery.admin` to `service-<PROJECT_NUMBER>@gcp-sa-bigquerydatatransfer.iam.gserviceaccount.com`.
