/*
# Fix set_pair_id_on_conversation trigger

## Summary
The set_pair_id_on_conversation() BEFORE INSERT trigger had a redundant
UPDATE on NEW.id — but in a BEFORE INSERT trigger, the row hasn't been
inserted yet, so that UPDATE affects 0 rows. The NEW.pair_id assignment
is the correct way to set the value. This migration removes the redundant
UPDATE on NEW.id and keeps only the UPDATE on the partner row (which DOES
exist already).

## Changes
1. Replace set_pair_id_on_conversation() with a corrected version that
   only updates the partner row, not the row being inserted.
*/

CREATE OR REPLACE FUNCTION public.set_pair_id_on_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner record;
  v_new_pair uuid;
BEGIN
  IF NEW.pair_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the reverse conversation already exists
  SELECT * INTO v_partner
  FROM conversations
  WHERE owner_id = NEW.user_id
    AND user_id = NEW.owner_id
  LIMIT 1;

  IF v_partner IS NULL THEN
    -- No partner yet; pair_id stays null. When the partner row is
    -- inserted later, ITS trigger will find THIS row and backfill both.
    RETURN NEW;
  END IF;

  IF v_partner.pair_id IS NOT NULL THEN
    -- Partner already has a pair_id; use the same one
    NEW.pair_id := v_partner.pair_id;
  ELSE
    -- Partner exists but has no pair_id; create a new pair and
    -- update the partner row (which already exists)
    v_new_pair := gen_random_uuid();
    NEW.pair_id := v_new_pair;
    UPDATE conversations SET pair_id = v_new_pair WHERE id = v_partner.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM authenticated;
