# Separate policies; no identities or credential secrets are generated in state.
resource "aws_iam_policy" "storage" {
  for_each = aws_s3_bucket.storage
  name     = "${var.name}-${each.key}-objects"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = each.value.arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource = "${each.value.arn}/*" }
    ]
  })
}
resource "aws_iam_user_policy_attachment" "storage" {
  for_each   = var.storage_iam_users == null ? {} : { for key, user in var.storage_iam_users : key => user if user != null && var.bucket_names[key] != null }
  user       = each.value
  policy_arn = aws_iam_policy.storage[each.key].arn
}
