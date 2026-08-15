variable "project_id" {
  description = "The Google Cloud Project ID to deploy resources into"
  type        = string
}

variable "region" {
  description = "The Google Cloud region for regional resources (e.g. Cloud Run, Serverless NEG)"
  type        = string
  default     = "us-central1"
}

variable "dataset_id" {
  description = "The BigQuery dataset ID where consumption data and tables reside"
  type        = string
  default     = "agy_consumption"
}

variable "dataset_location" {
  description = "The geographic location of the BigQuery dataset (e.g., 'US', 'EU', 'us-central1')"
  type        = string
  default     = "US"
}

variable "domain" {
  description = "Custom domain for the dashboard HTTPS endpoint (leave empty to use self-signed cert on the static IP)"
  type        = string
  default     = ""
}

variable "iap_oauth2_client_id" {
  description = "The OAuth 2.0 Client ID for Identity-Aware Proxy (IAP)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "iap_oauth2_client_secret" {
  description = "The OAuth 2.0 Client Secret for Identity-Aware Proxy (IAP)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "authorized_members" {
  description = "List of members (users/groups) authorized to access the dashboard via IAP (e.g., 'user:admin@example.com', 'group:team@example.com')"
  type        = list(string)
  default     = []
}

variable "gemini_models" {
  description = "List of Gemini models to enable request-response logging for in Vertex AI"
  type        = list(string)
  default = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview"
  ]
}
