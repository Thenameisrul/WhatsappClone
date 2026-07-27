/*
# Add authentication and per-user conversations

## Summary
Transition the chat app from a single-tenant (no-auth) schema to a multi-user
authenticated schema. Each signed-in user now owns their own conversations and
messages. New users automatically receive a set of starter conversations with
the shared contacts via a database trigger.

## 1. Data cleanup (mock seed data from the prior migration)
- Delete the single-tenant seed conversations and their messages (cascade).
- Delete the placeholder "Me" user row.
- Keep the 6 shared contact users; they are global and available to everyone.
- This is mock data from the initial migration, NOT user-generated data.

## 2. conversations table
- Add `owner_id` (uuid, NOT NULL, DEFAULT auth.uid(), FK -> auth.users ON DELETE CASCADE).
  Records which authenticated user owns the conversation. The DEFAULT lets the
  client insert with `.insert({ user_id })` without passing an owner.

## 3. users (contacts) table
- On signup, a row is inserted for the authenticated user (id = auth user id) so
  it can be referenced as a message sender (messages.sender_id FK -> users).

## 4. Security (RLS) — switch from anon to authenticated, owner-scoped
- `users`: SELECT to authenticated (shared contacts). Old anon policies dropped.
- `conversations`: owner-scoped CRUD to authenticated (owner_id = auth.uid()).
- `messages`: CRUD to authenticated, scoped through the owning conversation.

## 5. New-user trigger
- `handle_new_user()` runs AFTER INSERT ON auth.users.
- Inserts a public.users row for the new user (name from email local part).
- Creates 6 starter conversations (one per shared contact) owned by the new user.
- Inserts a welcome message from each contact.
- SECURITY DEFINER so it bypasses RLS (no session during trigger execution).

## Important notes
1. The previous anon-key policies are dropped and replaced with authenticated-
   only policies. The frontend MUST use a signed-in session; the anon key alone
   can no longer read or write data.
2. owner_id defaults to auth.uid() so client inserts omitting owner_id succeed.
3. Email confirmation stays OFF (Supabase default), so signUp logs the user in
   immediately and the trigger seeds their conversations right away.
*/

-- 1. Clean up single-tenant seed data
DELETE FROM conversations;
DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000000';

-- 2. Add owner_id to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS owner_id uuid NOT NULL DEFAULT auth.uid()
  REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id);

-- 3. users (contacts): drop old anon policies, authenticated read-only
DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "anon_insert_users" ON users;
DROP POLICY IF EXISTS "anon_update_users" ON users;
DROP POLICY IF EXISTS "anon_delete_users" ON users;

DROP POLICY IF EXISTS "authenticated_select_users" ON users;
CREATE POLICY "authenticated_select_users" ON users FOR SELECT
  TO authenticated USING (true);

-- 4. conversations: owner-scoped CRUD
DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations" ON conversations FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- 5. messages: scoped through owning conversation
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
DROP POLICY IF EXISTS "anon_update_messages" ON messages;
DROP POLICY IF EXISTS "anon_delete_messages" ON messages;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.owner_id = auth.uid()
    )
  );

-- 6. New-user trigger: seed conversations + welcome messages
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

  FOR contact IN SELECT id FROM users WHERE id <> NEW.id LOOP
    INSERT INTO conversations (owner_id, user_id, unread_count)
    VALUES (NEW.id, contact.id, 1)
    RETURNING id INTO conv_id;

    INSERT INTO messages (conversation_id, sender_id, text)
    VALUES (conv_id, contact.id, 'Hi! Welcome aboard. Send me a message whenever you''re ready.');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
