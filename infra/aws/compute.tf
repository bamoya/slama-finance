resource "aws_lightsail_instance" "finance" {
  name              = var.name
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  ip_address_type   = "ipv4"
  # Lightsail launch scripts are a single command. Only PUBLIC key material is embedded.
  # Keep the regional default Lightsail key for console recovery; do not download it.
  user_data = "echo '${base64encode(templatefile("${path.module}/bootstrap.sh.tftpl", { public_key_base64 = base64encode(trimspace(var.ssh_public_key)) }))}' | base64 -d | bash"
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = startswith(var.availability_zone, var.region)
      error_message = "Availability zone must be in the selected region."
    }
  }
}
resource "aws_lightsail_static_ip" "finance" {
  name = "${var.name}-public"
}
resource "aws_lightsail_static_ip_attachment" "finance" {
  static_ip_name = aws_lightsail_static_ip.finance.name
  instance_name  = aws_lightsail_instance.finance.name
}
