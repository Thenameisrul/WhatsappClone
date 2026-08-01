/*
# Add username column to users table

1. New Column
- `users.username` (text, nullable, UNIQUE): a public handle users pick at
  signup and can change later in Settings. Nullable so existing rows survive.

2. Index
- Unique index on `username` (case-insensitive via lower()) to prevent
  duplicate handles and to speed up future lookups.

3. Trigger update
- `handle_new_user()` now reads `username` from raw_user_meta_data and
  inserts it into the users row if present.
*/

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key
  ON users (lower(username))
  WHERE username IS NOT NULL;

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
  INSERT INTO users (id, name, username, online)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'username',
    true
  );

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
