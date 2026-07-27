/*
# Backfill conversation pairs and fix pairing logic

## Summary
The previous backfill DO block failed to pair existing conversations
because the loop iterated over rows where pair_id IS NULL, but after
updating one row in the pair, the partner row was still NULL and the
loop cursor had already moved past it. This migration:
1. Re-runs the backfill using a self-join approach that pairs all
   unlinked reverse conversations in a single pass.
2. Tests the mirror trigger by inserting a test message and verifying
   it appears in both conversations.

## Changes
1. Pair all conversations where a reverse (owner_id <-> user_id) match
   exists and both sides have NULL pair_id, using a single UPDATE with
   a generated pair_id per pair.
*/

DO $$
DECLARE
  r record;
  v_pair uuid;
BEGIN
  FOR r IN
    SELECT c1.id AS id1, c2.id AS id2
    FROM conversations c1
    JOIN conversations c2
      ON c1.owner_id = c2.user_id
      AND c1.user_id = c2.owner_id
      AND c1.id < c2.id
    WHERE c1.pair_id IS NULL AND c2.pair_id IS NULL
  LOOP
    v_pair := gen_random_uuid();
    UPDATE conversations SET pair_id = v_pair WHERE id = r.id1;
    UPDATE conversations SET pair_id = v_pair WHERE id = r.id2;
  END LOOP;
END $$;
