DO $$
DECLARE
  next_val bigint;
BEGIN
  SELECT GREATEST(1000, COALESCE(MAX("verificationCode"), 999) + 1)
    INTO next_val
    FROM "PrintJob";

  EXECUTE format(
    'ALTER SEQUENCE "PrintJob_verificationCode_seq" RESTART WITH %s',
    next_val
  );
END $$;
