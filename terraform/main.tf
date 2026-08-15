# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Consumption Dashboard — Main Infrastructure
# ─────────────────────────────────────────────────────────────────────────────

# ── Data Sources ─────────────────────────────────────────────────────────────

data "google_project" "current" {
  project_id = var.project_id
}

# ── 1. Enable Google Cloud APIs ──────────────────────────────────────────────

locals {
  required_apis = [
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
    "bigquerydatatransfer.googleapis.com",
    "run.googleapis.com",
    "iap.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(locals.required_apis)
  project                    = var.project_id
  service                    = each.key
  disable_on_destroy         = false
  disable_dependent_services = false
}

# ── 2. Service Account for Cloud Run ─────────────────────────────────────────

resource "google_service_account" "runner" {
  account_id   = "agy-dashboard-runner"
  display_name = "Antigravity Dashboard Cloud Run Runner"
  description  = "Service account used by Cloud Run to access BigQuery consumption data and settings"
  project      = var.project_id

  depends_on = [google_project_service.apis]
}

locals {
  runner_roles = [
    "roles/bigquery.jobUser",
    "roles/bigquery.dataViewer",
    "roles/bigquery.dataEditor",
  ]
}

resource "google_project_iam_member" "runner_roles" {
  for_each = toset(locals.runner_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.runner.email}"

  depends_on = [google_service_account.runner]
}

# ── 3. BigQuery Tables ───────────────────────────────────────────────────────

resource "google_bigquery_table" "dashboard_settings" {
  dataset_id          = var.dataset_id
  table_id            = "dashboard_settings"
  description         = "Dashboard settings and model pricing configuration"
  schema              = file("${path.module}/../bq/schemas/dashboard_settings.json")
  deletion_protection = false
  project             = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_bigquery_table" "user_mappings" {
  dataset_id          = var.dataset_id
  table_id            = "user_mappings"
  description         = "OS username to corporate identity and team mappings"
  schema              = file("${path.module}/../bq/schemas/user_mappings.json")
  deletion_protection = false
  project             = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_bigquery_table" "usage_summary_daily" {
  dataset_id          = var.dataset_id
  table_id            = "usage_summary_daily"
  description         = "Daily aggregated usage metrics per user and Gemini model"
  schema              = file("${path.module}/../bq/schemas/usage_summary_daily.json")
  deletion_protection = false
  project             = var.project_id

  depends_on = [google_project_service.apis]
}

# ── 4. BigQuery Scheduled Query ──────────────────────────────────────────────

resource "google_bigquery_data_transfer_config" "hourly_usage_aggregation" {
  display_name           = "Hourly Usage Aggregation"
  location               = var.dataset_location
  data_source_id         = "scheduled_query"
  schedule               = "every 1 hours"
  destination_dataset_id = var.dataset_id
  project                = var.project_id

  params = {
    query = templatefile("${path.module}/../bq/queries/merge_usage_summary.sql", {
      project_id = var.project_id
      dataset_id = var.dataset_id
    })
  }

  depends_on = [
    google_project_service.apis,
    google_bigquery_table.usage_summary_daily,
  ]
}

# ── 5. Vertex AI Request-Response Logging ────────────────────────────────────

resource "terraform_data" "enable_rr_logging" {
  for_each = toset(var.gemini_models)

  triggers_replace = {
    model   = each.key
    project = var.project_id
    dataset = var.dataset_id
  }

  provisioner "local-exec" {
    command = <<-EOT
      curl -s -X POST \
        -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
        -H "Content-Type: application/json" \
        "https://aiplatform.googleapis.com/v1beta1/projects/${var.project_id}/locations/global/publishers/google/models/${each.key}:setPublisherModelConfig" \
        -d '{
          "publisherModelConfig": {
            "loggingConfig": {
              "enabled": true,
              "samplingRate": 1.0,
              "bigqueryDestination": {
                "outputUri": "bq://${var.project_id}.${var.dataset_id}.request_response_logs"
              }
            }
          }
        }'
    EOT
  }

  depends_on = [
    google_project_service.apis,
  ]
}

# ── 6. Global Static IP Address ──────────────────────────────────────────────

resource "google_compute_global_address" "default" {
  name        = "agy-dashboard-ip"
  description = "Static IP address for Antigravity Consumption Dashboard load balancer"
  project     = var.project_id

  depends_on = [google_project_service.apis]
}

# ── 7. Serverless Network Endpoint Group (NEG) ───────────────────────────────

resource "google_compute_region_network_endpoint_group" "default" {
  name                  = "agy-dashboard-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  project               = var.project_id

  cloud_run {
    service = "agy-consumption-dashboard"
  }

  depends_on = [google_project_service.apis]
}

# ── 8. Backend Service with IAP ──────────────────────────────────────────────

resource "google_compute_backend_service" "default" {
  name                  = "agy-dashboard-backend"
  description           = "Backend service routing to Serverless NEG for Antigravity Consumption Dashboard"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  enable_cdn            = false
  load_balancing_scheme = "EXTERNAL"
  project               = var.project_id

  backend {
    group = google_compute_region_network_endpoint_group.default.id
  }

  dynamic "iap" {
    for_each = var.iap_oauth2_client_id != "" ? [1] : []
    content {
      oauth2_client_id     = var.iap_oauth2_client_id
      oauth2_client_secret = var.iap_oauth2_client_secret
    }
  }

  depends_on = [google_project_service.apis]
}

# ── 9. URL Maps ──────────────────────────────────────────────────────────────

resource "google_compute_url_map" "default" {
  name            = "agy-dashboard-url-map"
  description     = "HTTPS URL map routing to Antigravity Dashboard backend service"
  default_service = google_compute_backend_service.default.id
  project         = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_compute_url_map" "redirect" {
  name        = "agy-dashboard-redirect"
  description = "HTTP to HTTPS redirect URL map for Antigravity Consumption Dashboard"
  project     = var.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }

  depends_on = [google_project_service.apis]
}

# ── 10. SSL Certificate (Managed or Self-Signed) ─────────────────────────────

resource "google_compute_managed_ssl_certificate" "default" {
  count       = var.domain != "" ? 1 : 0
  name        = "agy-dashboard-cert"
  description = "Google-managed SSL certificate for Antigravity Consumption Dashboard"
  project     = var.project_id

  managed {
    domains = [var.domain]
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_project_service.apis]
}

resource "tls_private_key" "self_signed" {
  count     = var.domain == "" ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "self_signed" {
  count           = var.domain == "" ? 1 : 0
  private_key_pem = tls_private_key.self_signed[0].private_key_pem

  subject {
    common_name  = google_compute_global_address.default.address
    organization = "Antigravity Self-Signed"
  }

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

resource "google_compute_ssl_certificate" "default" {
  count       = var.domain == "" ? 1 : 0
  name        = "agy-dashboard-cert"
  description = "Self-signed SSL certificate for raw IP access"
  project     = var.project_id
  private_key = tls_private_key.self_signed[0].private_key_pem
  certificate = tls_self_signed_cert.self_signed[0].cert_pem

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_project_service.apis]
}

# ── 11. HTTPS Target Proxy & Forwarding Rule (Port 443) ──────────────────────

resource "google_compute_target_https_proxy" "default" {
  name             = "agy-dashboard-https-proxy"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = var.domain != "" ? [google_compute_managed_ssl_certificate.default[0].id] : [google_compute_ssl_certificate.default[0].id]
  project          = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "agy-dashboard-forwarding-rule"
  target                = google_compute_target_https_proxy.default.id
  port_range            = "443"
  ip_address            = google_compute_global_address.default.address
  load_balancing_scheme = "EXTERNAL"
  project               = var.project_id

  depends_on = [google_project_service.apis]
}

# ── 12. HTTP Target Proxy & Forwarding Rule (Port 80 Redirect) ───────────────

resource "google_compute_target_http_proxy" "redirect" {
  name    = "agy-dashboard-http-redirect-proxy"
  url_map = google_compute_url_map.redirect.id
  project = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "agy-dashboard-http-redirect-rule"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.default.address
  load_balancing_scheme = "EXTERNAL"
  project               = var.project_id

  depends_on = [google_project_service.apis]
}

# ── 13. IAP Access Control (IAM Members) ─────────────────────────────────────

resource "google_iap_web_backend_service_iam_member" "members" {
  for_each            = toset(var.authorized_members)
  project             = var.project_id
  web_backend_service = google_compute_backend_service.default.name
  role                = "roles/iap.httpsResourceAccessor"
  member              = each.key

  depends_on = [google_project_service.apis]
}
