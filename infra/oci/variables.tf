variable "region" {
  type        = string
  description = "Tenancy home region with confirmed A1 capacity and eligibility."
}

variable "oci_auth" {
  type        = string
  default     = "SecurityToken"
  description = "Operator authentication method. Session tokens are used for interactive provisioning."
  validation {
    condition     = contains(["SecurityToken", "APIKey"], var.oci_auth)
    error_message = "Use SecurityToken or APIKey."
  }
}

variable "oci_profile" {
  type        = string
  default     = "slama-finance"
  description = "Profile in the operator's ~/.oci/config; private key stays outside this repository."
}

variable "compartment_ocid" {
  type        = string
  description = "Existing deployment compartment, or parent tenancy/compartment when create_compartment is true."
}

variable "create_compartment" {
  type        = bool
  default     = false
  description = "Create a protected slama-finance compartment under compartment_ocid."
}

variable "availability_domain" {
  type        = string
  description = "Exact AD name from OCI; instance and data volume must use the same AD."
}

variable "image_ocid" {
  type        = string
  description = "Explicit regional Ubuntu 24.04 LTS ARM64 image OCID compatible with A1. Do not use a latest-image lookup."
}

variable "ssh_public_key" {
  type        = string
  description = "Operator public SSH key only. Never supply a private key."
  validation {
    condition     = can(regex("^ssh-(ed25519|rsa) ", var.ssh_public_key))
    error_message = "Supply an OpenSSH ed25519 or RSA public key."
  }
}

variable "admin_cidrs" {
  type        = set(string)
  description = "Explicit trusted operator IPv4 ranges; use /32 for individual IPs. No public SSH default."
  validation {
    condition = length(var.admin_cidrs) > 0 && alltrue([
      for cidr in var.admin_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)
    ])
    error_message = "Provide at least one valid IPv4 /24 or narrower range; prefer /32."
  }
}

variable "instance_name" {
  type    = string
  default = "slama-finance"
}

variable "ocpus" {
  type    = number
  default = 2
  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 2 && floor(var.ocpus) == var.ocpus
    error_message = "This launch configuration permits 1–2 A1 OCPUs. Revisit the budget before raising it."
  }
}

variable "memory_in_gbs" {
  type    = number
  default = 12
  validation {
    condition     = var.memory_in_gbs >= 6 && var.memory_in_gbs <= 12
    error_message = "Use 6–12 GB for this single-host stack; verify the actual tenancy allowance."
  }
}

variable "boot_volume_size_in_gbs" {
  type    = number
  default = 50
  validation {
    condition     = var.boot_volume_size_in_gbs >= 50 && var.boot_volume_size_in_gbs <= 100
    error_message = "Use 50–100 GB for the boot volume."
  }
}

variable "data_volume_size_gb" {
  type    = number
  default = 50
  validation {
    condition     = var.data_volume_size_gb >= 50 && var.data_volume_size_gb <= 100
    error_message = "Use 50–100 GB for persistent database storage."
  }
}

variable "vcn_cidr" {
  type    = string
  default = "10.42.0.0/16"
  validation {
    condition     = can(cidrnetmask(var.vcn_cidr))
    error_message = "Use a valid IPv4 VCN CIDR that does not overlap your other networks."
  }
}

variable "subnet_cidr" {
  type    = string
  default = "10.42.1.0/24"
  validation {
    condition     = can(cidrnetmask(var.subnet_cidr))
    error_message = "Use a valid IPv4 subnet inside the VCN."
  }
}

variable "media_bucket_name" {
  type        = string
  description = "Unique name in your Object Storage namespace for private application media."
  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$", var.media_bucket_name))
    error_message = "Use 1–255 letters, digits, underscores or hyphens, starting with a letter or digit."
  }
}

variable "backup_bucket_name" {
  type        = string
  description = "Different private bucket name for supplementary OCI backups."
  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$", var.backup_bucket_name))
    error_message = "Use 1–255 letters, digits, underscores or hyphens, starting with a letter or digit."
  }
}

variable "media_group_ocid" {
  type        = string
  default     = null
  nullable    = true
  description = "Existing dedicated IAM group for application S3 user. Null skips its policy."
}

variable "backup_group_ocid" {
  type        = string
  default     = null
  nullable    = true
  description = "Existing separate IAM group for backup S3 user. Null skips its policy."
}
