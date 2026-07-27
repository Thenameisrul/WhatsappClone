/*
# Add per-conversation PIN lock

## Summary
Add the ability for a user to lock individual conversations behind a PIN.
Locked conversations require a PIN to view their messages. The PIN is hashed
(SHA-256) on the client before storage, so the plain-text PIN is never saved.

## 1. conversations table changes
- Add `locked` (boolean, NOT NULL, default false) — whether the conversation
  is PIN-protected.
- Add `lock_pin_hash` (text, nullable) — SHA-256 hash of the user-chosen PIN.
  Null when the conversation is not locked.

## 2. Security
- No policy changes. The new columns inherit the existing owner-scoped RLS on
  conversations: only the owner can read, set, update, or clear their own lock.
- The PIN hash is only ever readable by the owner (already enforced), and the
  plain-text PIN is never stored or transmitted.

## 3. Important notes
1. PIN verification happens client-side: the app hashes the entered PIN with
   SHA-256 and compares it to the stored hash. A match reveals messages for the
   current session only — the lock itself is not removed.
2. Removing a lock sets locked=false and clears lock_pin_hash, and requires the
   correct PIN first (verified client-side before calling the update).
*/

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS lock_pin_hash text;
