# Credentials come from the operator's OCI config profile, never from tfvars.
provider "oci" {
  auth                = var.oci_auth
  region              = var.region
  config_file_profile = var.oci_profile
}

locals {
  tags = { project = "slama-finance", managed_by = "terraform" }
}
