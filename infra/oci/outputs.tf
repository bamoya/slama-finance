output "instance_id" {
  value = oci_core_instance.finance.id
}

output "public_ip" {
  description = "Ephemeral public IP. Recheck DNS after instance replacement."
  value       = oci_core_instance.finance.public_ip
}

output "private_ip" {
  value = oci_core_instance.finance.private_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${oci_core_instance.finance.public_ip}"
}

output "data_volume_id" {
  description = "Identify this exact volume before manual initialization/mounting. No filesystem is created automatically."
  value       = oci_core_volume.data.id
}

output "storage_configuration" {
  description = "Non-secret application storage settings; create customer secret credentials separately."
  value = {
    S3_ENDPOINT   = "https://${data.oci_objectstorage_namespace.storage.namespace}.compat.objectstorage.${var.region}.oraclecloud.com"
    S3_REGION     = var.region
    S3_BUCKET     = oci_objectstorage_bucket.media.name
    BACKUP_BUCKET = oci_objectstorage_bucket.backups.name
  }
}
