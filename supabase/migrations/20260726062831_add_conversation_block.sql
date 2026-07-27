/*
# Add chat blocking

## Summary
Add the ability to block a conversation. Blocked conversations stay in the
list (so the user can unblock them later) but cannot be interacted with —
no new messages can be sent and the chat shows a "blocked" state.

## 1. conversations table changes
- Add `blocked` (boolean, NOT NULL, DEFAULT false). When true the
  conversation is blocked by the owner.

## 2. Security
- No policy changes needed. The existing owner-scoped UPDATE policy already
  covers updating the new `blocked` column.

## 3. Important notes
1. Blocked conversations remain visible so the user can unblock them.
2. The frontend hides the message composer for blocked chats and shows a
   banner with an Unblock button.
3. No data is deleted when blocking — messages are preserved.
*/

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
