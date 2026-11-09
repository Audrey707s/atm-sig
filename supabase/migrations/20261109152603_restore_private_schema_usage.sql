-- Restore the application schema ACL recorded in the original pg_dump.
-- RLS predicates call atm_private.is_active_business_user(); function EXECUTE
-- alone is insufficient without USAGE on its schema.
GRANT USAGE ON SCHEMA atm_private TO authenticated;
