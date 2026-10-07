terraform {
  backend "s3" {
    bucket              = "slama-finance-tfstate-054119522048-eu-west-3"
    key                 = "slama-finance/dev/terraform.tfstate"
    region              = "eu-west-3"
    profile             = "slama-finance"
    allowed_account_ids = ["054119522048"]
    encrypt             = true
    use_lockfile        = true
  }
}
