resource "oci_core_vcn" "main" {
  compartment_id = local.deployment_compartment_ocid
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.instance_name}-vcn"
  dns_label      = "slamafinance"
  freeform_tags  = local.tags
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = local.deployment_compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.instance_name}-internet"
  enabled        = true
  freeform_tags  = local.tags
}

resource "oci_core_route_table" "main" {
  compartment_id = local.deployment_compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.instance_name}-public-routes"
  freeform_tags  = local.tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

# OCI combines security-list and NSG permissions. Never attach the VCN default
# security list: its default SSH rule could bypass the restricted NSG below.
resource "oci_core_security_list" "empty" {
  compartment_id = local.deployment_compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.instance_name}-empty-security-list"
  freeform_tags  = local.tags
  # Deliberately no ingress or egress rules; all permitted traffic is in the NSG.
}

resource "oci_core_subnet" "main" {
  compartment_id             = local.deployment_compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = var.subnet_cidr
  display_name               = "${var.instance_name}-public-subnet"
  dns_label                  = "app"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.main.id
  security_list_ids          = [oci_core_security_list.empty.id]
  freeform_tags              = local.tags
}

resource "oci_core_network_security_group" "web" {
  compartment_id = local.deployment_compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.instance_name}-web-and-admin"
  freeform_tags  = local.tags
}

resource "oci_core_network_security_group_security_rule" "web" {
  for_each                  = toset(["80", "443"])
  network_security_group_id = oci_core_network_security_group.web.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  stateless                 = false
  description               = "Public HTTP/HTTPS only; Coolify administration uses an SSH tunnel"
  tcp_options {
    destination_port_range {
      min = tonumber(each.value)
      max = tonumber(each.value)
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ssh" {
  for_each                  = toset(var.admin_cidrs)
  network_security_group_id = oci_core_network_security_group.web.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = each.value
  source_type               = "CIDR_BLOCK"
  stateless                 = false
  description               = "SSH from an explicitly authorized administrator network"
  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

# Stateful outbound access supports package/registry downloads, OCI, Resend and
# DNS/NTP. This is intentionally not an egress allowlist or a data-loss control.
resource "oci_core_network_security_group_security_rule" "egress" {
  network_security_group_id = oci_core_network_security_group.web.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  stateless                 = false
  description               = "Stateful outbound IPv4 access"
}
