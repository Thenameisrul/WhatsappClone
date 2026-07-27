/*
# Chat app schema (single-tenant, no auth)

1. Overview
This migration creates the database for a simple chat application. The app has
no sign-in screen, so the schema is single-tenant: all data is intentionally
shared and readable/writable by the anon-key frontend. Policies are scoped to
`anon, authenticated` with `USING (true)` because the data is public by design.

2. New Tables
- `users`
  - `id` (uuid, primary key)
  - `name` (text, not null) - display name of the contact
  - `avatar_url` (text) - profile picture URL
  - `online` (boolean, default false) - whether the user is currently active
  - `created_at` (timestamptz)
- `conversations`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, FK -> users) - the contact this conversation is with
  - `unread_count` (integer, default 0) - unread messages from the contact
  - `created_at` (timestamptz)
- `messages`
  - `id` (uuid, primary key)
  - `conversation_id` (uuid, not null, FK -> conversations, cascade delete)
  - `sender_id` (uuid, not null, FK -> users, cascade delete) - who sent the message
  - `text` (text, not null) - message content
  - `created_at` (timestamptz) - used for ordering and timestamps

3. Indexes
- `messages` on `conversation_id` for fast per-conversation queries.
- `conversations` on `user_id`.

4. Security (RLS)
- RLS enabled on all three tables.
- All tables allow full CRUD to `anon, authenticated` because this is a
  single-tenant app with no sign-in and the data is intentionally shared.

5. Seed Data
- One "me" user representing the current user of the app.
- Six contact users with avatars and online status.
- Six conversations, one per contact.
- Seed messages mirroring the original mock data, with the "me" user as sender
  for outbound messages.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar_url text,
  online boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
  TO anon, authenticated USING (true);

-- Seed data (only if users table is empty)
DO $$
DECLARE
  me_id uuid := '00000000-0000-0000-0000-000000000000';
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  u4 uuid := '44444444-4444-4444-4444-444444444444';
  u5 uuid := '55555555-5555-5555-5555-555555555555';
  u6 uuid := '66666666-6666-6666-6666-666666666666';
  c1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  c3 uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  c4 uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  c5 uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  c6 uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM users;
  IF user_count > 0 THEN RETURN; END IF;

  INSERT INTO users (id, name, online) VALUES (me_id, 'Me', true);

  INSERT INTO users (id, name, avatar_url, online) VALUES
    (u1, 'Ava Thompson', 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=200', true),
    (u2, 'Liam Carter', 'https://images.pexels.com/photos/220457/pexels-photo-220457.jpeg?auto=compress&cs=tinysrgb&w=200', true),
    (u3, 'Mia Rodriguez', 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=200', false),
    (u4, 'Noah Patel', 'https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=200', false),
    (u5, 'Sophia Nguyen', 'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=200', true),
    (u6, 'Ethan Brooks', 'https://images.pexels.com/photos/1212984/pexels-photo-1212984.jpeg?auto=compress&cs=tinysrgb&w=200', false);

  INSERT INTO conversations (id, user_id, unread_count) VALUES
    (c1, u1, 2),
    (c2, u2, 0),
    (c3, u3, 0),
    (c4, u4, 5),
    (c5, u5, 0),
    (c6, u6, 0);

  INSERT INTO messages (conversation_id, sender_id, text, created_at) VALUES
    (c1, u1, 'Hey! Are we still on for lunch tomorrow?', '2026-07-25 10:30:00+00'),
    (c1, me_id, 'Yes, definitely. Noon works for me.', '2026-07-25 10:35:00+00'),
    (c1, u1, 'Perfect. I found a great new spot downtown.', '2026-07-25 10:38:00+00'),
    (c1, u1, 'Sounds good, see you then!', '2026-07-25 10:42:00+00'),
    (c2, u2, 'Did you finish the report?', '2026-07-25 09:15:00+00'),
    (c3, u3, 'Thanks for the help yesterday 🙏', '2026-07-24 18:00:00+00'),
    (c4, u4, 'Let me check and get back to you.', '2026-07-24 16:30:00+00'),
    (c5, u5, 'Happy birthday!! 🎉', '2026-07-21 08:00:00+00'),
    (c6, u6, 'The meeting is moved to 3 PM.', '2026-07-20 14:00:00+00');
END $$;
