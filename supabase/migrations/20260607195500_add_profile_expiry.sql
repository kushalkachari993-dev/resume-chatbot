ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
  NOT NULL DEFAULT (now() + interval '7 days');

DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT
  id,
  slug,
  name,
  title,
  email,
  linkedin,
  github,
  portfolio_url,
  extracted_summary,
  skills,
  projects,
  experience,
  education,
  created_at,
  expires_at
FROM public.profiles
WHERE expires_at > now();

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_expired_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.profiles
  WHERE expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expired_profiles() TO service_role;
