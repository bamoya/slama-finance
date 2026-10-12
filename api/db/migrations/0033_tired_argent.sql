ALTER TABLE "payments" DROP CONSTRAINT "payments_method_fields";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_fields" CHECK ((
      ("payments"."method" = 'cash' and "payments"."status" <> 'pending' and "payments"."bank_account_id" is null and "payments"."reference" is null and "payments"."cheque_bank" is null and "payments"."cheque_number" is null)
      or ("payments"."method" = 'bank_transfer' and "payments"."cheque_bank" is null and "payments"."cheque_number" is null)
      or ("payments"."method" = 'cheque' and "payments"."cheque_bank" is not null and length(trim("payments"."cheque_bank")) > 0 and "payments"."cheque_number" is not null and length(trim("payments"."cheque_number")) > 0 and "payments"."reference" is null)
    ));