import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Sparkles, Link2, MessageSquare, Copy, ExternalLink, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractResumeText, slugify, quickExtractProfile } from "@/lib/resumeParser";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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
  const [loading, setLoading] = useState(false);
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
      const extracted = quickExtractProfile(text);
      const slug = slugify(name || file.name.replace(/\.[^.]+$/, ""));
      const { error } = await supabase.from("profiles").insert({
        slug,
        name: name || null,
        title: title || null,
        email: email || null,
        linkedin: linkedin || null,
        github: github || null,
        portfolio_url: portfolio || null,
        resume_text: text,
        extracted_summary: extracted.summary,
        skills: extracted.skills,
      });
      if (error) throw error;
      const url = `${window.location.origin}/assistant/${slug}`;
      setShareSlug(slug);
      setShareUrl(url);
      toast.success("Your AI assistant is ready!");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-mesh" />

      {/* Header */}
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero shadow-elegant">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ResumeLink AI</span>
        </div>
      </header>

      {/* Hero */}
      <section className="container pt-8 pb-12 text-center animate-fade-in">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Your resume, now an AI assistant
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          Upload your resume.{" "}
          <span className="bg-gradient-hero bg-clip-text text-transparent">
            Generate a personal AI assistant link.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Share one link. Recruiters and collaborators chat with an AI that knows your background — answering only from your resume.
        </p>

        {/* Steps */}
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { icon: Upload, title: "Upload Resume", desc: "PDF, DOCX, or TXT" },
            { icon: Sparkles, title: "Generate AI Profile", desc: "We extract your story" },
            { icon: Link2, title: "Share Link", desc: "Anyone can chat with it" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border bg-card/60 p-5 text-left shadow-card backdrop-blur">
              <s.icon className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold">{s.title}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Form / Success */}
      <section className="container pb-24">
        <Card className="mx-auto max-w-2xl border bg-gradient-card p-6 shadow-elegant md:p-8">
          {shareUrl ? (
            <div className="space-y-5 text-center animate-fade-in">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero">
                <Sparkles className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Your AI assistant is live</h2>
                <p className="mt-1 text-sm text-muted-foreground">Share this link with anyone — no login required.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border bg-background p-2">
                <Link2 className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <code className="flex-1 truncate text-left text-sm">{shareUrl}</code>
                <Button size="sm" variant="secondary" onClick={copyLink}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copy
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => navigate(`/assistant/${shareSlug}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" /> Open Assistant
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { setShareUrl(null); setFile(null); }}>
                  Create another
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <Label>Resume file *</Label>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 flex w-full items-center gap-3 rounded-xl border-2 border-dashed bg-background/50 p-5 text-left transition-colors hover:border-primary hover:bg-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {file ? file.name : "Click to upload PDF, DOCX, or TXT"}
                    </div>
                    <div className="text-xs text-muted-foreground">Max 5MB</div>
                  </div>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <Label htmlFor="title">Role / title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior GenAI Engineer" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input id="linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/…" />
                </div>
                <div>
                  <Label htmlFor="github">GitHub</Label>
                  <Input id="github" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="github.com/…" />
                </div>
                <div>
                  <Label htmlFor="portfolio">Portfolio</Label>
                  <Input id="portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://…" />
                </div>
              </div>

              <Button type="submit" size="lg" disabled={loading} className="w-full bg-gradient-hero text-primary-foreground hover:opacity-90">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate My AI Assistant</>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Your resume text is stored to power your assistant. Share the link anywhere.
              </p>
            </form>
          )}
        </Card>
      </section>
    </div>
  );
};

export default Index;
