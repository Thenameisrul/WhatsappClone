/*
# Remove dummy seed users and fix new-user signup crash

## Problem
When a new user signs up, handle_new_user() creates conversations with
ALL existing users in the users table — including fake seed users (IDs
11111111-..., 22222222-..., etc.) that are not real auth accounts.

The set_pair_id_on_conversation() trigger then tries to create a REVERSE
conversation owned by that fake user. But the conversations.owner_id
column has a FK to auth.users(id), and the fake user doesn't exist there,
so the INSERT fails with a FK violation. This rolls back the entire
signup transaction, producing "Database error saving new user".

## Fix
1. Delete all dummy seed users (hardcoded UUIDs) and cascade-delete
   their conversations and messages.
2. Rewrite handle_new_user() to only seed conversations with users that
   exist in auth.users (real accounts), not fake seed rows.
3. Add a defensive check in set_pair_id_on_conversation() to skip reverse
   conversation creation if the partner user_id is not a real auth user.
*/

-- 1. Delete dummy seed users (cascades to conversations, messages)
DELETE FROM users
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

-- 2. Rewrite handle_new_user() to only seed conversations with real auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact record;
  conv_id uuid;
BEGIN
  INSERT INTO users (id, name, online)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    true
  );

  -- Only seed conversations with REAL auth users (not fake seed rows)
  FOR contact IN
    SELECT u.id FROM users u
    JOIN auth.users au ON au.id = u.id
    WHERE u.id <> NEW.id
  LOOP
    INSERT INTO conversations (owner_id, user_id, unread_count)
    VALUES (NEW.id, contact.id, 1)
    RETURNING id INTO conv_id;

    INSERT INTO messages (conversation_id, sender_id, text)
    VALUES (conv_id, contact.id, 'Hi! Welcome aboard. Send me a message whenever you''re ready.');
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 3. Defensive: skip reverse conversation creation if partner is not a real auth user
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
    -- No reverse conversation possible; just assign a pair_id so future
    -- reverse creation can link to it
    v_new_pair := gen_random_uuid();
    NEW.pair_id := v_new_pair;
    RETURN NEW;
  END IF;

  -- Create the reverse conversation
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
