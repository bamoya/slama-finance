data "oci_objectstorage_namespace" "storage" {
  compartment_id = var.compartment_ocid
}

# Private application objects and backups use separate buckets and credentials.
# No automatic expiration or retention lock is configured. Version history uses
# storage quota too; review and prune it deliberately after testing recovery.
resource "oci_objectstorage_bucket" "media" {
  compartment_id = local.deployment_compartment_ocid
  namespace      = data.oci_objectstorage_namespace.storage.namespace
  name           = var.media_bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Enabled"

  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = local.deployment_compartment_ocid
  namespace      = data.oci_objectstorage_namespace.storage.namespace
  name           = var.backup_bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Enabled"

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = lower(var.backup_bucket_name) != lower(var.media_bucket_name)
      error_message = "Media and backup bucket names must differ, including case-insensitive IAM matching."
    }
    precondition {
      condition     = var.media_group_ocid == null || var.backup_group_ocid == null || var.media_group_ocid != var.backup_group_ocid
      error_message = "Use distinct dedicated groups for application media and backups."
    }
  }
}

# Independent of the instance boot disk. Attachment does not format or mount it:
# identify the new device and configure the host explicitly before starting DB.
resource "oci_core_volume" "data" {
  compartment_id      = local.deployment_compartment_ocid
  availability_domain = var.availability_domain
  display_name        = "slama-finance-data"
  size_in_gbs         = var.data_volume_size_gb

  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_core_volume_attachment" "data" {
  attachment_type                     = "paravirtualized"
  instance_id                         = oci_core_instance.finance.id
  volume_id                           = oci_core_volume.data.id
  display_name                        = "slama-finance-data"
  is_read_only                        = false
  is_pv_encryption_in_transit_enabled = true
}
