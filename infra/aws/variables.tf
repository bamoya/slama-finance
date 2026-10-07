variable "region" {
  type    = string
  default = "eu-west-3"
}
variable "aws_profile" {
  type    = string
  default = "slama-finance"
}
variable "aws_account_id" {
  type        = string
  description = "Verified target account; provider refuses other accounts."
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the verified 12-digit AWS account ID."
  }
}
variable "availability_zone" {
  type        = string
  description = "Choose a Lightsail-supported AZ after get-regions; e.g. eu-west-3a."
}
variable "blueprint_id" {
  type        = string
  description = "Explicit Ubuntu AMD64 blueprint verified with get-blueprints."
}
variable "bundle_id" {
  type        = string
  description = "Verify regional bundle and price; dev target is small_3_0 (2 vCPU / 2 GB / 60 GB)."
}
variable "ssh_public_key" {
  type        = string
  description = "Public operator key installed through bootstrap; private key stays outside Terraform."
  validation {
    condition     = can(regex("^ssh-(ed25519|rsa) [A-Za-z0-9+/=]+( [^\\r\\n]*)?$", trimspace(var.ssh_public_key)))
    error_message = "Supply one valid OpenSSH public key line."
  }
}
variable "admin_cidrs" {
  type        = set(string)
  description = "Temporary bootstrap SSH IPv4 allowlist. Set [] after Tailscale SSH is tested."
  validation {
    condition = alltrue([
      for cidr in var.admin_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)
    ])
    error_message = "SSH must use valid IPv4 /24 or narrower ranges; prefer /32."
  }
}
variable "name" {
  type    = string
  default = "slama-finance"
}
variable "bucket_names" {
  type        = object({ media = string, backups = optional(string) })
  description = "Globally unique S3 names, preferably suffixed with the AWS account ID."
  validation {
    condition = var.bucket_names.media != var.bucket_names.backups && alltrue([
      for name in values(var.bucket_names) : name == null ? true : can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", name))
    ])
    error_message = "Use distinct 3–63 character lowercase bucket names (letters, numbers, hyphens)."
  }
}
variable "storage_versioning_enabled" {
  type        = bool
  default     = false
  description = "Dev default: no version history. Enabling incurs additional storage usage."
}

variable "storage_iam_users" {
  type        = object({ media = string, backups = optional(string) })
  default     = null
  description = "Optional existing dedicated IAM usernames. Null creates policies without granting access. Never provision access keys in Terraform."
  validation {
    condition     = var.storage_iam_users == null ? true : var.storage_iam_users.media != var.storage_iam_users.backups
    error_message = "Media and backup identities must differ."
  }
}
