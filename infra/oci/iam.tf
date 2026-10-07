# Optional policies for PRE-EXISTING dedicated groups. User creation and S3
# Customer Secret Keys stay out of Terraform so credentials never enter state.
# These are ordinary identity groups, not dynamic groups / instance principals.
resource "oci_identity_policy" "media" {
  count          = var.media_group_ocid == null ? 0 : 1
  compartment_id = local.deployment_compartment_ocid
  name           = "slama-finance-media-objects"
  description    = "Application object access limited to the Slama media bucket"
  statements = [
    "Allow group id ${var.media_group_ocid} to inspect buckets in compartment id ${local.deployment_compartment_ocid}",
    "Allow group id ${var.media_group_ocid} to manage objects in compartment id ${local.deployment_compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.media.name}'",
  ]
}

resource "oci_identity_policy" "backups" {
  count          = var.backup_group_ocid == null ? 0 : 1
  compartment_id = local.deployment_compartment_ocid
  name           = "slama-finance-backup-objects"
  description    = "Backup object access limited to the Slama backups bucket"
  statements = [
    "Allow group id ${var.backup_group_ocid} to inspect buckets in compartment id ${local.deployment_compartment_ocid}",
    "Allow group id ${var.backup_group_ocid} to manage objects in compartment id ${local.deployment_compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.backups.name}'",
  ]
}
