/*
# Enable real-time messaging, call signaling, and document support

## Summary
Fix three connected problems in the chat app:
1. MESSAGES DON'T REACH THE OTHER PERSON — each user has their own private
   conversation row, so a message inserted into the sender's conversation
   is never visible to the recipient. This migration pairs the two
   conversation rows (one per participant) and mirrors inserted messages
   to the paired conversation so both sides see every message in real time.
2. NO REAL CALL SIGNALING — calls were purely local (a fake "connecting"
   screen). This adds a `call_signals` table that carries WebRTC offer,
   answer, ICE candidates, and hang-up events between the two participants
   so calls actually connect peer-to-peer.
3. NO DOCUMENT SHARING — media messaging only supported image/video/audio.
   This adds a `file` media type plus file metadata columns so documents
   (PDF, DOCX, etc.) can be sent and downloaded.

## 1. conversations table changes
- Add `pair_id` (uuid, nullable). For a 1:1 chat, the two conversation rows
  share the same `pair_id` so the mirror trigger can find the partner row.
- Add an index on `pair_id`.

## 2. messages table changes
- Add `file_name` (text, nullable) — original filename for file messages.
- Add `file_size` (bigint, nullable) — file size in bytes for display.
- `media_type` now also accepts 'file'. `media_url` stores the signed URL.

## 3. New table: call_signals
- id, pair_id (indexed), sender_id (FK -> auth.users), type, payload (jsonb),
  created_at. RLS: participants SELECT/INSERT; sender DELETE.

## 4. New trigger: mirror_message_to_pair
- AFTER INSERT ON messages mirrors the row to the paired conversation.
  SECURITY DEFINER. EXECUTE revoked from anon/authenticated/public.

## 5. New trigger: set_pair_id_on_conversation
- BEFORE INSERT ON conversations links reverse conversation rows with a
  shared pair_id. SECURITY DEFINER. EXECUTE revoked.

## 6. Backfill pair_id for existing conversations via a DO block.

## 7. Realtime: add messages and call_signals to supabase_realtime.

## 8. Important notes
1. Mirror copies with the SAME sender_id so recipient sees it as incoming.
2. pair_id is automatic; frontend never manages it.
3. Documents reuse the chat-media storage bucket; no new bucket.
*/

-- 1. conversations: pair_id
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pair_id uuid;

CREATE INDEX IF NOT EXISTS idx_conversations_pair_id ON conversations(pair_id);

-- 2. messages: file metadata
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

-- 3. call_signals table
CREATE TABLE IF NOT EXISTS call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_signals_pair_id ON call_signals(pair_id);

ALTER TABLE call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_call_signals" ON call_signals;
CREATE POLICY "select_call_signals" ON call_signals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.pair_id = call_signals.pair_id
        AND conversations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_call_signals" ON call_signals;
CREATE POLICY "insert_call_signals" ON call_signals FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.pair_id = call_signals.pair_id
        AND conversations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_call_signals" ON call_signals;
CREATE POLICY "delete_call_signals" ON call_signals FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- 4. mirror_message_to_pair trigger
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

DROP TRIGGER IF EXISTS on_message_insert_mirror ON messages;
CREATE TRIGGER on_message_insert_mirror
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public.mirror_message_to_pair();

REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mirror_message_to_pair() FROM authenticated;

-- 5. set_pair_id_on_conversation trigger
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

  SELECT * INTO v_partner
  FROM conversations
  WHERE owner_id = NEW.user_id
    AND user_id = NEW.owner_id
  LIMIT 1;

  IF v_partner IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_partner.pair_id IS NOT NULL THEN
    NEW.pair_id := v_partner.pair_id;
    UPDATE conversations SET pair_id = v_partner.pair_id WHERE id = NEW.id;
  ELSE
    v_new_pair := gen_random_uuid();
    NEW.pair_id := v_new_pair;
    UPDATE conversations SET pair_id = v_new_pair WHERE id = v_partner.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_insert_pair ON conversations;
CREATE TRIGGER on_conversation_insert_pair
  BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_pair_id_on_conversation();

REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_pair_id_on_conversation() FROM authenticated;

-- 6. Backfill pair_id for existing conversations
DO $$
DECLARE
  c record;
  v_partner record;
  v_pair uuid;
BEGIN
  FOR c IN SELECT id, owner_id, user_id FROM conversations WHERE pair_id IS NULL LOOP
    SELECT * INTO v_partner
    FROM conversations
    WHERE owner_id = c.user_id
      AND user_id = c.owner_id
      AND pair_id IS NULL
    LIMIT 1;

    IF v_partner IS NOT NULL THEN
      v_pair := gen_random_uuid();
      UPDATE conversations SET pair_id = v_pair WHERE id = c.id;
      UPDATE conversations SET pair_id = v_pair WHERE id = v_partner.id;
    END IF;
  END LOOP;
END $$;

-- 7. Realtime publication (idempotent via DO blocks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'call_signals') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE call_signals;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'call_signals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE call_signals;
  END IF;
END $$;
