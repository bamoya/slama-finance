resource "oci_core_instance" "finance" {
  compartment_id       = local.deployment_compartment_ocid
  availability_domain  = var.availability_domain
  display_name         = var.instance_name
  shape                = "VM.Standard.A1.Flex"
  freeform_tags        = local.tags
  preserve_boot_volume = true

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  source_details {
    source_type = "image"
    # Explicit regional Ubuntu ARM image OCID, never a changing "latest" lookup.
    source_id               = var.image_ocid
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.main.id
    nsg_ids          = [oci_core_network_security_group.web.id]
    assign_public_ip = true
    # This is an ephemeral public IP. Record it for DNS; replacement can change it.
    display_name = "${var.instance_name}-primary"
  }

  metadata = {
    ssh_authorized_keys = trimspace(var.ssh_public_key)
    user_data           = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {}))
  }

  lifecycle {
    # This prevents Terraform replacement/deletion, not OCI console deletion or
    # provider reclamation. Retention and independent backups remain necessary.
    prevent_destroy = true
  }
}
