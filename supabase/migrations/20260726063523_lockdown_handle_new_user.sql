/*
# Lock down handle_new_user() trigger function

## Summary
The `public.handle_new_user()` function is a PostgreSQL trigger that fires
AFTER INSERT ON auth.users (on signup). It was created as SECURITY DEFINER
so it can bypass RLS and seed starter conversations for a brand-new user
before any authenticated session exists.

The function was inadvertently executable via the PostgREST API
(/rest/v1/rpc/handle_new_user) by the anon and authenticated roles, which
exposed a SECURITY DEFINER function to untrusted callers. Trigger functions
do not need to be callable via RPC — they only need to fire on the trigger.

## Changes
1. REVOKE EXECUTE on public.handle_new_user() FROM PUBLIC, anon, authenticated.
   This removes the function from the API schema so it can no longer be
   invoked via /rest/v1/rpc/handle_new_user by any untrusted role.
2. Keep the function as SECURITY DEFINER — this is required because the
   trigger runs during auth.users INSERT, before an authenticated session
   exists, so it must bypass RLS to insert into public.users, conversations,
   and messages. The function is now only invokable by the database owner
   / superuser and via the trigger itself.

## Why not SECURITY INVOKER?
Switching to SECURITY INVOKER would break signup: the trigger fires as the
role performing the INSERT on auth.users (an internal auth operation), and
that role cannot write to public.conversations / public.messages through
RLS (no auth.uid() session yet). SECURITY DEFINER is correct for this
trigger; the exposure was the EXECUTE grant, not the DEFINER property.

## Important notes
1. Trigger invocation is unaffected — REVOKE does not stop the trigger from
   firing; it only removes direct CALL / RPC execution by non-owners.
2. New signups continue to be seeded with starter conversations as before.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
