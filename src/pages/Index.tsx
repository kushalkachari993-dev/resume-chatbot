import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Link2,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractResumeText, slugify, quickExtractProfile } from "@/lib/resumeParser";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_CHARS = 50000;

type AiExtractedProfile = {
  name: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio_url: string | null;
  summary: string;
  skills: string[];
  projects: unknown[];
  experience: unknown[];
  education: unknown[];
};

type JobFitAnalysis = {
  score: number;
  verdict: string;
  matched_strengths: string[];
  gaps: string[];
  missing_keywords: string[];
  resume_improvements: string[];
  suggested_bullets: string[];
  interview_questions: string[];
  next_steps: string[];
};

const PROCESS_STEPS = [
  {
    icon: Upload,
    title: "Parse resume",
    desc: "PDF, DOCX, and TXT are converted into clean text.",
  },
  {
    icon: BrainCircuit,
    title: "Extract profile",
    desc: "AI identifies skills, projects, experience, education, and links.",
  },
  {
    icon: MessageSquare,
    title: "Publish assistant",
    desc: "A shareable chat link answers from the resume only.",
  },
];

const TRUST_NOTES = [
  "The public page does not expose raw resume text.",
  "The assistant fetches resume context server-side.",
  "Generated links stay active for 7 days.",
  "Manual fields override AI extraction when provided.",
];

const Index = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fitAnalysis, setFitAnalysis] = useState<JobFitAnalysis | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return toast.error("File too large (max 5MB)");
    const ok = /\.(pdf|docx|txt)$/i.test(f.name);
    if (!ok) return toast.error("Please upload PDF, DOCX, or TXT");
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Please upload a resume file");
    setLoading(true);
    try {
      const text = await extractResumeText(file);
      if (!text || text.length < 30) throw new Error("Could not read text from this file");
      if (text.length > MAX_RESUME_CHARS) {
        throw new Error("Resume text is too long. Please upload a shorter resume.");
      }

      const extracted = await extractProfileWithAi(text, {
        name,
        title,
        email,
        linkedin,
        github,
        portfolio_url: portfolio,
      });

      const baseName = name || file.name.replace(/\.[^.]+$/, "");
      const payload = {
        name: name || extracted.name,
        title: title || extracted.title,
        email: email || extracted.email,
        linkedin: linkedin || extracted.linkedin,
        github: github || extracted.github,
        portfolio_url: portfolio || extracted.portfolio_url,
        resume_text: text,
        extracted_summary: extracted.summary,
        skills: extracted.skills,
        projects: extracted.projects,
        experience: extracted.experience,
        education: extracted.education,
      };

      const slug = await createProfileWithUniqueSlug(baseName, payload);
      const url = `${window.location.origin}/assistant/${slug}`;
      setShareSlug(slug);
      setShareUrl(url);
      toast.success("Assistant link created");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const onAnalyzeFit = async () => {
    if (!file) return toast.error("Please upload a resume file");
    if (jobDescription.trim().length < 80) {
      return toast.error("Paste a more complete job description first");
    }

    setAnalyzing(true);
    setFitAnalysis(null);

    try {
      const text = await extractResumeText(file);
      if (!text || text.length < 30) throw new Error("Could not read text from this file");
      if (text.length > MAX_RESUME_CHARS) {
        throw new Error("Resume text is too long. Please upload a shorter resume.");
      }

      const { data, error } = await supabase.functions.invoke("analyze-job-fit", {
        body: {
          resume_text: text,
          job_description: jobDescription,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));
      setFitAnalysis(normalizeJobFitAnalysis(data));
      toast.success("Job-fit analysis ready");
    } catch (err: any) {
      toast.error(err.message || "Job-fit analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">ResumeLink AI</div>
              <div className="mt-1 text-xs text-muted-foreground">Resume-grounded assistant builder</div>
            </div>
          </div>
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Links expire after 7 days
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-12">
        <aside className="space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI extraction included
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Turn a resume into a shareable interview assistant.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
              Upload a resume, review optional identity fields, and generate a public link recruiters can chat with.
              The assistant answers from the resume context, not from generic guesses.
            </p>
          </div>

          <div className="space-y-3">
            {PROCESS_STEPS.map((step, index) => (
              <div key={step.title} className="flex gap-3 rounded-lg border bg-card p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <step.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground">0{index + 1}</span>
                    {step.title}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4 text-primary" />
              Data handling
            </div>
            <div className="space-y-2">
              {TRUST_NOTES.map((note) => (
                <div key={note} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-lg border bg-card shadow-card">
          {shareUrl ? (
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b pb-6">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Published
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Assistant link is ready</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Share this URL with recruiters, collaborators, or hiring teams. It will stay active for 7 days.
                  </p>
                </div>
                <div className="hidden h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:flex">
                  <Link2 className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 rounded-lg border bg-background p-3">
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Public link</div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-sm">{shareUrl}</code>
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button onClick={() => navigate(`/assistant/${shareSlug}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Open assistant
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShareUrl(null);
                    setFile(null);
                  }}
                >
                  Create another
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="p-6 sm:p-8">
              <div className="border-b pb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Create assistant</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start with the resume. The fields below are optional and override AI extraction when filled.
                </p>
              </div>

              <div className="mt-6">
                <Label>Resume file *</Label>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 flex min-h-28 w-full items-center gap-4 rounded-lg border border-dashed bg-background p-5 text-left transition-colors hover:border-primary hover:bg-secondary/50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {file ? file.name : "Upload PDF, DOCX, or TXT"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Max 5MB. Text is extracted locally before AI structuring.
                    </div>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Full name" id="name" value={name} onChange={setName} placeholder="Jane Doe" />
                <Field label="Role / title" id="title" value={title} onChange={setTitle} placeholder="Senior GenAI Engineer" />
                <Field label="Email" id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
                <Field label="LinkedIn" id="linkedin" value={linkedin} onChange={setLinkedin} placeholder="linkedin.com/in/..." />
                <Field label="GitHub" id="github" value={github} onChange={setGithub} placeholder="github.com/..." />
                <Field label="Portfolio" id="portfolio" value={portfolio} onChange={setPortfolio} placeholder="https://..." />
              </div>

              <div className="mt-6">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <Label htmlFor="job-description">Job description</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional. Paste a role to compare against this resume.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{jobDescription.length}/20000</span>
                </div>
                <Textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value.slice(0, 20000))}
                  placeholder="Paste the open job description here..."
                  className="mt-2 min-h-36 resize-y"
                />
              </div>

              <Button type="submit" size="lg" disabled={loading} className="mt-6 w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting and publishing
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate assistant link
                  </>
                )}
              </Button>

              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={analyzing || loading}
                onClick={onAnalyzeFit}
                className="mt-3 w-full"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing job fit
                  </>
                ) : (
                  <>
                    <Target className="mr-2 h-4 w-4" />
                    Analyze fit with job description
                  </>
                )}
              </Button>

              {fitAnalysis && <JobFitReport analysis={fitAnalysis} />}

              <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                Your resume is stored privately to power the assistant. Shared links expire after 7 days.
              </p>
            </form>
          )}
        </section>
      </section>
    </main>
  );
};

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2"
      />
    </div>
  );
}

function JobFitReport({ analysis }: { analysis: JobFitAnalysis }) {
  return (
    <section className="mt-6 rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            Job-fit analysis
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{analysis.score}% match</h3>
          {analysis.verdict && <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.verdict}</p>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary sm:mt-3 sm:w-40">
          <div className="h-full rounded-full bg-primary" style={{ width: `${analysis.score}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <AnalysisList title="Strong matches" items={analysis.matched_strengths} />
        <AnalysisList title="Gaps to close" items={analysis.gaps} />
        <AnalysisList title="Missing keywords" items={analysis.missing_keywords} compact />
        <AnalysisList title="Resume improvements" items={analysis.resume_improvements} />
        <AnalysisList title="Suggested bullets" items={analysis.suggested_bullets} />
        <AnalysisList title="Interview prep" items={analysis.interview_questions} />
      </div>

      {analysis.next_steps.length > 0 && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold">Next steps</h4>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            {analysis.next_steps.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <span className="font-medium text-foreground">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function AnalysisList({
  title,
  items,
  compact = false,
}: {
  title: string;
  items: string[];
  compact?: boolean;
}) {
  if (!items.length) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {compact ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function createProfileWithUniqueSlug(
  baseName: string,
  payload: {
    name: string | null;
    title: string | null;
    email: string | null;
    linkedin: string | null;
    github: string | null;
    portfolio_url: string | null;
    resume_text: string;
    extracted_summary: string;
    skills: string[];
    projects: unknown[];
    experience: unknown[];
    education: unknown[];
  }
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = slugify(baseName);
    const { error } = await supabase.from("profiles").insert({
      slug,
      ...payload,
    });

    if (!error) return slug;
    if (error.code !== "23505") throw error;
  }

  throw new Error("Could not create a unique assistant link. Please try again.");
}

async function extractProfileWithAi(
  resumeText: string,
  hints: {
    name: string;
    title: string;
    email: string;
    linkedin: string;
    github: string;
    portfolio_url: string;
  }
): Promise<AiExtractedProfile> {
  const fallback = quickExtractProfile(resumeText);

  try {
    const { data, error } = await supabase.functions.invoke("extract-resume", {
      body: {
        resume_text: resumeText,
        hints,
      },
    });

    if (error) throw new Error(await getFunctionErrorMessage(error));

    const extracted = data as Partial<AiExtractedProfile>;
    return {
      name: cleanNullableString(extracted.name),
      title: cleanNullableString(extracted.title),
      email: cleanNullableString(extracted.email),
      linkedin: cleanNullableString(extracted.linkedin),
      github: cleanNullableString(extracted.github),
      portfolio_url: cleanNullableString(extracted.portfolio_url),
      summary: cleanString(extracted.summary) || fallback.summary,
      skills: cleanStringArray(extracted.skills).length
        ? cleanStringArray(extracted.skills)
        : fallback.skills,
      projects: Array.isArray(extracted.projects) ? extracted.projects : [],
      experience: Array.isArray(extracted.experience) ? extracted.experience : [],
      education: Array.isArray(extracted.education) ? extracted.education : [],
    };
  } catch (error: any) {
    toast.warning("AI extraction was unavailable, so a basic parser was used.");
    console.warn("AI extraction failed:", error?.message || error);
    return {
      name: null,
      title: null,
      email: null,
      linkedin: null,
      github: null,
      portfolio_url: null,
      summary: fallback.summary,
      skills: fallback.skills,
      projects: [],
      experience: [],
      education: [],
    };
  }
}

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "AI extraction failed";
  const response = (error as { context?: Response })?.context;

  if (!response) return fallback;

  try {
    const body = await response.clone().json();
    const detail =
      typeof body?.detail === "string" && body.detail.trim()
        ? `: ${body.detail}`
        : "";
    return body?.error ? `${body.error}${detail}` : fallback;
  } catch {
    return fallback;
  }
}

function cleanNullableString(value: unknown) {
  const text = cleanString(value);
  return text || null;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeJobFitAnalysis(value: unknown): JobFitAnalysis {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    score: normalizeScore(record.score),
    verdict: cleanString(record.verdict),
    matched_strengths: cleanStringArray(record.matched_strengths),
    gaps: cleanStringArray(record.gaps),
    missing_keywords: cleanStringArray(record.missing_keywords),
    resume_improvements: cleanStringArray(record.resume_improvements),
    suggested_bullets: cleanStringArray(record.suggested_bullets),
    interview_questions: cleanStringArray(record.interview_questions),
    next_steps: cleanStringArray(record.next_steps),
  };
}

function normalizeScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export default Index;
