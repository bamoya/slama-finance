resource "aws_lightsail_instance_public_ports" "finance" {
  instance_name = aws_lightsail_instance.finance.name
  dynamic "port_info" {
    for_each = toset([80, 443])
    content {
      protocol          = "tcp"
      from_port         = port_info.value
      to_port           = port_info.value
      cidrs             = ["0.0.0.0/0"]
      ipv6_cidrs        = []
      cidr_list_aliases = []
    }
  }
  dynamic "port_info" {
    for_each = length(var.admin_cidrs) == 0 ? [] : [1]
    content {
      protocol          = "tcp"
      from_port         = 22
      to_port           = 22
      cidrs             = var.admin_cidrs
      ipv6_cidrs        = []
      cidr_list_aliases = []
    }
  }
}
