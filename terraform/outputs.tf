# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Consumption Dashboard — Outputs
# ─────────────────────────────────────────────────────────────────────────────

output "project_number" {
  description = "The Google Cloud project number"
  value       = data.google_project.current.number
}

output "backend_service_id" {
  description = "The numeric ID of the Load Balancer backend service used to derive IAP audience"
  value       = tostring(google_compute_backend_service.default.generated_id)
}

output "dashboard_url" {
  description = "The HTTPS URL to access the Antigravity Consumption Dashboard"
  value       = var.domain != "" ? "https://${var.domain}" : "https://${google_compute_global_address.default.address}"
}

output "static_ip" {
  description = "The global static IP address assigned to the dashboard load balancer"
  value       = google_compute_global_address.default.address
}

output "service_account_email" {
  description = "The email address of the Cloud Run runner service account"
  value       = google_service_account.runner.email
}
