/*
# Fix mismatched pair_ids and missing reverse conversations

## Root cause
Some conversation pairs have DIFFERENT pair_ids on each side, or one side
has a pair_id with no reverse conversation at all. This breaks call
signaling: the caller inserts a call_signal with their pair_id, but the
recipient's RLS policy requires them to own a conversation with that
same pair_id — which they don't. So the recipient never receives the
realtime event and never sees the incoming call.

## Fix
1. Merge mismatched pairs: for each (A→B, B→A) conversation pair that
   have different pair_ids, update both to share one pair_id.
2. Create missing reverse conversations for orphans: conversations that
   have a pair_id but no partner row at all.
3. Clean up stale call_signals from the broken pairs.
4. Harden the trigger: use ON CONFLICT to handle the race condition where
   both users create conversations simultaneously.
*/

-- 1. Merge mismatched pairs
-- For each conversation, find its reverse and if both have pair_ids but
-- they differ, pick one and update both.
DO $$
DECLARE
  c record;
  v_reverse record;
  v_pair uuid;
BEGIN
  FOR c IN
    SELECT id, owner_id, user_id, pair_id
    FROM conversations
    WHERE pair_id IS NOT NULL
  LOOP
    SELECT id, pair_id INTO v_reverse
    FROM conversations
    WHERE owner_id = c.user_id
      AND user_id = c.owner_id
      AND id <> c.id
    LIMIT 1;

    -- Reverse exists with a DIFFERENT pair_id → merge
    IF v_reverse IS NOT NULL AND v_reverse.pair_id IS NOT NULL
       AND v_reverse.pair_id <> c.pair_id THEN
      v_pair := c.pair_id;
      UPDATE conversations SET pair_id = v_pair WHERE id = v_reverse.id;
    END IF;
  END LOOP;
END $$;

-- 2. Create missing reverse conversations for orphans
-- Conversations with a pair_id but no partner row at all.
DO $$
DECLARE
  c record;
  v_reverse_exists boolean;
  v_user_is_real boolean;
BEGIN
  FOR c IN
    SELECT id, owner_id, user_id, pair_id
    FROM conversations
    WHERE pair_id IS NOT NULL
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM conversations c2
      WHERE c2.pair_id = c.pair_id AND c2.id <> c.id
    ) INTO v_reverse_exists;

    IF NOT v_reverse_exists THEN
      -- Check if the target user is a real auth user
      SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE id = c.user_id
      ) INTO v_user_is_real;

      IF v_user_is_real THEN
        -- Check if a reverse conversation exists with a different pair_id
        SELECT EXISTS (
          SELECT 1 FROM conversations c3
          WHERE c3.owner_id = c.user_id AND c3.user_id = c.owner_id
        ) INTO v_reverse_exists;

        IF v_reverse_exists THEN
          -- Update the existing reverse to share our pair_id
          UPDATE conversations
          SET pair_id = c.pair_id
          WHERE owner_id = c.user_id AND user_id = c.owner_id;
        ELSE
          -- Create the missing reverse conversation
          INSERT INTO conversations (owner_id, user_id, pair_id, unread_count)
          VALUES (c.user_id, c.owner_id, c.pair_id, 0);
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3. Clean up stale call_signals (they reference old broken pair_ids)
DELETE FROM call_signals;

-- 4. Harden the trigger to handle race conditions with ON CONFLICT
-- Add a unique constraint on (owner_id, user_id) to prevent duplicates
-- and let the trigger use ON CONFLICT for the reverse INSERT.

-- First, remove any duplicate conversations (same owner_id + user_id)
-- keeping the most recent one
DELETE FROM conversations
WHERE id NOT IN (
  SELECT DISTINCT ON (owner_id, user_id) id
  FROM conversations
  ORDER BY owner_id, user_id, created_at DESC
);

-- Now add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_owner_user_unique
  ON conversations (owner_id, user_id);

-- Update the trigger function to use ON CONFLICT
CREATE OR REPLACE FUNCTION public.set_pair_id_on_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner record;
  v_new_pair uuid;
  v_is_real_user boolean;
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

  -- Only create a reverse conversation if NEW.user_id is a real auth user
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) INTO v_is_real_user;
  IF NOT v_is_real_user THEN
    v_new_pair := gen_random_uuid();
    NEW.pair_id := v_new_pair;
    RETURN NEW;
  END IF;

  -- Create the reverse conversation (ON CONFLICT handles race condition)
  v_new_pair := gen_random_uuid();
  NEW.pair_id := v_new_pair;

  INSERT INTO conversations (owner_id, user_id, pair_id, unread_count)
  VALUES (NEW.user_id, NEW.owner_id, v_new_pair, 0)
  ON CONFLICT (owner_id, user_id) DO UPDATE SET pair_id = EXCLUDED.pair_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM authenticated;
