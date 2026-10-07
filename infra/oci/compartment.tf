resource "oci_identity_compartment" "finance" {
  count          = var.create_compartment ? 1 : 0
  compartment_id = var.compartment_ocid
  name           = "slama-finance"
  description    = "Slama Finance application infrastructure"
  enable_delete  = false

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  deployment_compartment_ocid = var.create_compartment ? oci_identity_compartment.finance[0].id : var.compartment_ocid
}

output "compartment_id" {
  value = local.deployment_compartment_ocid
}
