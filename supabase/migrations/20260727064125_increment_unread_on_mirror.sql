/*
# Increment unread count on mirrored messages

## Summary
When user A sends a message, the mirror trigger copies it to user B's
conversation. But B's unread_count was never incremented, so B never saw
a badge. This updates the mirror trigger to increment the partner
conversation's unread_count when a mirrored message is inserted.

## Changes
1. Replace mirror_message_to_pair() to also increment unread_count on
   the partner conversation (only for the mirrored copy, not the original).
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

  -- Increment unread count on the partner conversation since the
  -- partner owner received a new message they haven't read yet.
  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE id = v_partner_conversation_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM authenticated;
