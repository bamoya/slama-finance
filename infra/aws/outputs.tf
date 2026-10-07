output "public_ip" { value = aws_lightsail_static_ip.finance.ip_address }
output "instance_name" { value = aws_lightsail_instance.finance.name }
output "storage_configuration" {
  value = {
    S3_ENDPOINT   = "https://s3.${var.region}.amazonaws.com"
    S3_REGION     = var.region
    S3_BUCKET     = aws_s3_bucket.storage["media"].id
    BACKUP_BUCKET = try(aws_s3_bucket.storage["backups"].id, null)
  }
}
output "storage_policy_arns" {
  value = { for key, policy in aws_iam_policy.storage : key => policy.arn }
}
