/*
# Add user profile bio + self-update policy

## Summary
Extend the users table so an authenticated user can store a short bio and
update their own profile (name, avatar_url, bio). Previously the users table
was read-only for authenticated users (shared contacts). This adds an
owner-scoped UPDATE policy so a user can edit only their own row.

## 1. users table changes
- Add `bio` (text, nullable) — short profile description.

## 2. Security (RLS)
- Add UPDATE policy on users: an authenticated user may update only the row
  whose id matches their auth uid (auth.uid() = id). No other rows (contacts)
  can be modified.

## 3. Important notes
1. The SELECT policy remains unchanged (authenticated can read all users).
2. INSERT/DELETE on users remain unchanged (no direct insert/delete policies
   for authenticated users; rows are created by the signup trigger).
3. Profile picture uploads reuse the existing private `chat-media` storage
   bucket, so no new bucket is needed.
*/

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio text;

DROP POLICY IF EXISTS "update_own_profile" ON users;
CREATE POLICY "update_own_profile" ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
