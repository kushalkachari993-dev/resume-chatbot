
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT,
  title TEXT,
  email TEXT,
  linkedin TEXT,
  github TEXT,
  portfolio_url TEXT,
  resume_text TEXT NOT NULL,
  extracted_summary TEXT,
  skills JSONB DEFAULT '[]'::jsonb,
  projects JSONB DEFAULT '[]'::jsonb,
  experience JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_slug ON public.profiles(slug);

GRANT SELECT, INSERT ON public.profiles TO anon;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);
