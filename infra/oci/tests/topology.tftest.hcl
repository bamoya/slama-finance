# Mocked provider only: no OCI credentials, requests, resources or charges.
mock_provider "oci" {
  mock_data "oci_objectstorage_namespace" {
    defaults = {
      namespace = "testnamespace"
    }
  }
}

variables {
  create_compartment = false
  region              = "eu-marseille-1"
  compartment_ocid    = "ocid1.compartment.oc1..mocktest"
  availability_domain = "mock:EU-MARSEILLE-1-AD-1"
  image_ocid          = "ocid1.image.oc1.eu-marseille-1.mocktest"
  ssh_public_key      = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMockFixtureOnlyNotAnActualPublicKey test"
  admin_cidrs         = ["192.0.2.10/32"]
  media_bucket_name   = "slama-test-media"
  backup_bucket_name  = "slama-test-backups"
}

run "default_topology" {
  command = plan

  assert {
    condition = (
      oci_core_instance.finance.shape == "VM.Standard.A1.Flex" &&
      oci_core_instance.finance.shape_config[0].ocpus == 2 &&
      oci_core_instance.finance.shape_config[0].memory_in_gbs == 12 &&
      oci_core_instance.finance.preserve_boot_volume
    )
    error_message = "Default host must use A1 with 2 OCPU / 12 GB and preserve its boot volume."
  }

  assert {
    condition = (
      tonumber(oci_core_volume.data.size_in_gbs) == 50 &&
      oci_core_volume.data.availability_domain == oci_core_instance.finance.availability_domain &&
      oci_core_volume_attachment.data.attachment_type == "paravirtualized" &&
      oci_core_volume_attachment.data.is_pv_encryption_in_transit_enabled &&
      !oci_core_volume_attachment.data.is_read_only
    )
    error_message = "Database storage must be 50 GB in the host AD with an encrypted writable paravirtualized attachment."
  }

  assert {
    condition = alltrue([
      for bucket in [oci_objectstorage_bucket.media, oci_objectstorage_bucket.backups] :
      bucket.access_type == "NoPublicAccess" && bucket.versioning == "Enabled" && bucket.storage_tier == "Standard"
    ])
    error_message = "Both buckets must remain private, versioned Standard storage."
  }

  assert {
    condition     = length(oci_identity_policy.media) == 0 && length(oci_identity_policy.backups) == 0
    error_message = "No IAM policy may be created unless its existing group OCID is explicitly supplied."
  }

  assert {
    condition = (
      length(oci_core_network_security_group_security_rule.web) == 2 &&
      alltrue([
        for port, rule in oci_core_network_security_group_security_rule.web :
        rule.direction == "INGRESS" && rule.source == "0.0.0.0/0" && rule.protocol == "6" &&
        rule.tcp_options[0].destination_port_range[0].min == tonumber(port) &&
        rule.tcp_options[0].destination_port_range[0].max == tonumber(port)
      ]) &&
      contains(keys(oci_core_network_security_group_security_rule.web), "80") &&
      contains(keys(oci_core_network_security_group_security_rule.web), "443")
    )
    error_message = "Only HTTP and HTTPS may be publicly exposed by the web rules."
  }

  assert {
    condition = alltrue([
      for cidr, rule in oci_core_network_security_group_security_rule.ssh :
      rule.source == cidr && cidr != "0.0.0.0/0" &&
      rule.tcp_options[0].destination_port_range[0].min == 22 &&
      rule.tcp_options[0].destination_port_range[0].max == 22
    ])
    error_message = "SSH must remain scoped to the explicitly supplied administrator ranges."
  }

  assert {
    condition = (
      oci_core_network_security_group_security_rule.egress.direction == "EGRESS" &&
      oci_core_network_security_group_security_rule.egress.destination == "0.0.0.0/0" &&
      !oci_core_network_security_group_security_rule.egress.stateless
    )
    error_message = "Expected stateful outbound access for registries, OCI and email delivery."
  }

  # Lifecycle meta-arguments cannot be referenced as resource attributes.
  assert {
    condition = (
      length(regexall("prevent_destroy\\s*=\\s*true", file("${path.module}/storage.tf"))) == 3 &&
      length(regexall("prevent_destroy\\s*=\\s*true", file("${path.module}/compute.tf"))) == 1
    )
    error_message = "Instance, persistent volume and both buckets must retain destruction guards."
  }
}

run "optional_scoped_policies" {
  command = plan

  variables {
    media_group_ocid  = "ocid1.group.oc1..mockmedia"
    backup_group_ocid = "ocid1.group.oc1..mockbackup"
  }

  assert {
    condition = (
      length(oci_identity_policy.media) == 1 && length(oci_identity_policy.backups) == 1 &&
      length(oci_identity_policy.media[0].statements) == 2 &&
      length(oci_identity_policy.backups[0].statements) == 2 &&
      contains(oci_identity_policy.media[0].statements, "Allow group id ${var.media_group_ocid} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.media_bucket_name}'") &&
      contains(oci_identity_policy.backups[0].statements, "Allow group id ${var.backup_group_ocid} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.backup_bucket_name}'")
    )
    error_message = "Each existing group must receive only its own bucket's object-management policy plus bucket inspection."
  }
}

run "reject_public_ssh" {
  command = plan
  variables {
    admin_cidrs = ["0.0.0.0/0"]
  }
  expect_failures = [var.admin_cidrs]
}
