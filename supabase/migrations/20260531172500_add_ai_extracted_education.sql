ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb;

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
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;
