/*
# Auto-create reverse conversation + subscribe to new conversations

## Summary
When user B signs up, B gets a conversation pointing to A (via
handle_new_user). But A has no conversation pointing to B (A signed up
before B existed). So when B sends a message, the mirror trigger finds
no partner conversation and the message is lost — A never receives it.

## Fix
Update set_pair_id_on_conversation() to CREATE the reverse conversation
when none exists. When user A creates (or the system seeds) a conversation
pointing to B, the trigger now:
1. Looks for a reverse conversation (B → A).
2. If found, pairs them as before.
3. If NOT found, creates the reverse conversation (owned by B, pointing
   to A) with the same pair_id. Since the reverse row is inserted with
   pair_id already set, its trigger fires but returns immediately (pair_id
   is not null), so there is no recursion.

## Backfill
Only create reverse conversations for real auth users (not seed contacts
like 1111...). Seed contacts are not real accounts and cannot own
conversations. Pair existing reverse conversations that are both unlinked.

## Realtime
Add `conversations` to the supabase_realtime publication.
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

  IF v_partner IS NOT NULL THEN
    -- Partner exists; pair them
    IF v_partner.pair_id IS NOT NULL THEN
      NEW.pair_id := v_partner.pair_id;
    ELSE
      v_new_pair := gen_random_uuid();
      NEW.pair_id := v_new_pair;
      UPDATE conversations SET pair_id = v_new_pair WHERE id = v_partner.id;
    END IF;
    RETURN NEW;
  END IF;

  -- No reverse conversation exists. Create one so both sides can message
  -- each other. The reverse row is owned by NEW.user_id and points to
  -- NEW.owner_id. We set pair_id on it so its trigger returns early.
  v_new_pair := gen_random_uuid();
  NEW.pair_id := v_new_pair;

  INSERT INTO conversations (owner_id, user_id, pair_id, unread_count)
  VALUES (NEW.user_id, NEW.owner_id, v_new_pair, 0);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM authenticated;

-- Backfill: create reverse conversations only for real auth users
DO $$
DECLARE
  c record;
  v_pair uuid;
BEGIN
  FOR c IN
    SELECT c1.id, c1.owner_id, c1.user_id
    FROM conversations c1
    WHERE c1.pair_id IS NULL
      -- Only process conversations where the user_id is a real auth user
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = c1.user_id)
  LOOP
    -- Check if reverse exists
    IF NOT EXISTS (
      SELECT 1 FROM conversations
      WHERE owner_id = c.user_id AND user_id = c.owner_id
    ) THEN
      -- Create reverse conversation
      v_pair := gen_random_uuid();
      UPDATE conversations SET pair_id = v_pair WHERE id = c.id;
      INSERT INTO conversations (owner_id, user_id, pair_id, unread_count)
      VALUES (c.user_id, c.owner_id, v_pair, 0)
      ON CONFLICT DO NOTHING;
    ELSE
      -- Reverse exists but both are unpaired; pair them
      v_pair := gen_random_uuid();
      UPDATE conversations SET pair_id = v_pair WHERE id = c.id;
      UPDATE conversations SET pair_id = v_pair
        WHERE owner_id = c.user_id AND user_id = c.owner_id AND pair_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Add conversations to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;
