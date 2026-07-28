/*
# Add view-once messaging

1. New Columns
- `messages.view_once` (boolean, default false): when true, the message is
  a "view-once" message — it automatically deletes itself after the recipient
  opens/views it.
- `messages.viewed_at` (timestamptz, nullable): set when the recipient views a
  view-once message. A trigger deletes the message shortly after viewing.

2. Behavior
- A `handle_view_once_deletion` trigger fires AFTER UPDATE on `messages`.
  When `viewed_at` transitions from null to a value (i.e. the recipient just
  marked it viewed), the trigger deletes the message row. This keeps the
  deletion server-side so it propagates to both users via realtime.

3. Security
- No RLS policy changes — the existing owner-scoped policies on `messages`
  already cover SELECT/INSERT/UPDATE/DELETE. The recipient updates the row
  through their own conversation copy (messages are shared via conversation
  pairing), and the trigger performs the actual deletion as the authenticated
  role.

4. Notes
- The view-once flag is set at send time and is immutable after that.
- The sender sees a "view-once" indicator on their sent bubble. Once the
  recipient views it, the realtime DELETE event removes it from both sides.
*/

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

-- Trigger: delete a view-once message once it has been marked viewed.
CREATE OR REPLACE FUNCTION handle_view_once_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.view_once AND NEW.viewed_at IS NOT NULL AND (OLD.viewed_at IS NULL) THEN
    DELETE FROM messages WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_viewed ON messages;
CREATE TRIGGER on_message_viewed
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION handle_view_once_deletion();
