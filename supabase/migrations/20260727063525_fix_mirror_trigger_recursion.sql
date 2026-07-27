/*
# Fix mirror trigger infinite recursion

## Summary
The mirror_message_to_pair() trigger caused a stack depth limit exceeded
error because inserting the mirrored copy into the partner conversation
re-fired the same AFTER INSERT trigger, which mirrored it back, creating
infinite recursion. Messages were never delivered because every insert
crashed.

## Fix
Add a re-entry guard using pg_trigger_depth(). When the trigger is called
from within itself (depth > 1), it skips the mirror insert. This means:
- Original message insert (depth 1) → mirrors to partner conversation
- Mirror insert (depth 2) → skipped, no further mirroring

## Changes
1. Replace mirror_message_to_pair() with a version that checks
   pg_trigger_depth() = 1 before mirroring.
2. Clean up any __MIRROR_TEST__ rows that may have partially inserted.
*/

CREATE OR REPLACE FUNCTION public.mirror_message_to_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair_id uuid;
  v_partner_conversation_id uuid;
BEGIN
  -- Prevent infinite recursion: only mirror on the original insert,
  -- not on the mirrored copy (which would re-trigger this function).
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT pair_id INTO v_pair_id
  FROM conversations WHERE id = NEW.conversation_id;

  IF v_pair_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_partner_conversation_id
  FROM conversations
  WHERE pair_id = v_pair_id AND id <> NEW.conversation_id
  LIMIT 1;

  IF v_partner_conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO messages (
    conversation_id, sender_id, text,
    media_url, media_type, duration,
    file_name, file_size, created_at
  )
  VALUES (
    v_partner_conversation_id, NEW.sender_id, NEW.text,
    NEW.media_url, NEW.media_type, NEW.duration,
    NEW.file_name, NEW.file_size, NEW.created_at
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM authenticated;

-- Clean up any partial test rows
DELETE FROM messages WHERE text = '__MIRROR_TEST__';
