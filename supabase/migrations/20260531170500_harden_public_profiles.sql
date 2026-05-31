CREATE OR REPLACE VIEW public.public_profiles AS
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
  created_at
FROM public.profiles;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_resume_text_length
  CHECK (char_length(resume_text) <= 50000);
