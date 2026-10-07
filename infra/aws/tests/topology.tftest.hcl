mock_provider "aws" {}

variables {
  aws_account_id             = "123456789012"
  availability_zone          = "eu-west-3a"
  blueprint_id               = "ubuntu_mock"
  bundle_id                  = "mock_8gb"
  ssh_public_key             = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMockPublicKey test"
  admin_cidrs                = ["192.0.2.10/32"]
  bucket_names               = { media = "slama-test-media", backups = "slama-test-backups" }
  storage_versioning_enabled = true
}

run "minimal_dev" {
  command = plan
  variables {
    bucket_names               = { media = "slama-test-media" }
    storage_versioning_enabled = false
    bundle_id                  = "small_3_0"
  }
  assert {
    condition     = length(aws_s3_bucket.storage) == 1 && length(aws_iam_policy.storage) == 1 && aws_s3_bucket_versioning.storage["media"].versioning_configuration[0].status == "Suspended" && aws_lightsail_instance.finance.bundle_id == "small_3_0" && length(aws_lightsail_instance.finance.add_on) == 0
    error_message = "Dev must have one unversioned media bucket, no snapshot add-on, and the small bundle."
  }
}

run "bootstrap" {
  command = plan
  assert {
    condition = aws_lightsail_instance.finance.ip_address_type == "ipv4" && length(aws_lightsail_instance_public_ports.finance.port_info) == 3 && alltrue([
      for port in aws_lightsail_instance_public_ports.finance.port_info : port.from_port == 22 ? port.cidrs == toset(["192.0.2.10/32"]) : contains([80, 443], port.from_port)
    ])
    error_message = "Only web ports and scoped SSH may be exposed; IPv6 must be disabled."
  }
  assert {
    condition = alltrue([
      for bucket in aws_s3_bucket_public_access_block.storage : bucket.block_public_acls && bucket.block_public_policy && bucket.ignore_public_acls && bucket.restrict_public_buckets
    ]) && alltrue([for bucket in aws_s3_bucket_versioning.storage : bucket.versioning_configuration[0].status == "Enabled"])
    error_message = "Both buckets must be private and versioned."
  }
  assert {
    condition     = length(aws_iam_user_policy_attachment.storage) == 0
    error_message = "Do not grant identities access without an explicit operator selection."
  }
}

run "private_admin" {
  command = plan
  variables { admin_cidrs = [] }
  assert {
    condition     = length(aws_lightsail_instance_public_ports.finance.port_info) == 2 && alltrue([for port in aws_lightsail_instance_public_ports.finance.port_info : contains([80, 443], port.from_port)])
    error_message = "After Tailscale onboarding, public SSH must be removable."
  }
}

run "reject_public_ssh" {
  command = plan
  variables { admin_cidrs = ["0.0.0.0/0"] }
  expect_failures = [var.admin_cidrs]
}

run "reject_shared_storage_identity" {
  command = plan
  variables { storage_iam_users = { media = "same-user", backups = "same-user" } }
  expect_failures = [var.storage_iam_users]
}
