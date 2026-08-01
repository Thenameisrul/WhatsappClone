/*
# Stop auto-seeding conversations on signup

Previously handle_new_user() created a conversation with EVERY existing
user when someone signed up. The app now uses username-based discovery:
users start a chat by searching for a specific username. So the
auto-seed loop is removed — new users start with an empty conversation
list and build it themselves.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO users (id, name, username, online)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'username',
    true
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
