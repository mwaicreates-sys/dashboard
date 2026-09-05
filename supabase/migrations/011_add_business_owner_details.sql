-- ============================================================
-- Add owner_name and owner_email columns to businesses table
-- These store the business owner's contact information
-- ============================================================

alter table public.businesses
  add column if not exists owner_name text,
  add column if not exists owner_email text;

-- Update the owner information in existing businesses if available
-- (no-op if already populated)