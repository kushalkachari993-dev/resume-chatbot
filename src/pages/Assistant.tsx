import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  BriefcaseBusiness,
  FileText,
  Github,
  Globe,
  GraduationCap,
  Linkedin,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Profile = {
  id: string;
  slug: string;
  name: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio_url: string | null;
  extracted_summary: string | null;
  skills: string[] | null;
  projects: unknown[] | null;
  experience: unknown[] | null;
  education: unknown[] | null;
};

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "Summarize their strongest skills",
  "What projects are most relevant?",
  "Are they a fit for a GenAI role?",
  "How can I contact them?",
];

const Assistant = () => {
  const { slug } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data, error } = await supabase
        .from("public_profiles")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setProfile(data as unknown as Profile);
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const ask = async (q: string) => {
    if (!profile || !q.trim() || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: q.trim() }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-assistant", {
        body: {
          slug: profile.slug,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessages((m) => [...m, { role: "assistant", content: (data as any).reply || "" }]);
    } catch (e: any) {
      const summary = profile.extracted_summary || "The AI service is temporarily unavailable.";
      const skills =
        profile.skills && profile.skills.length > 0
          ? `\n\nVisible skills: ${profile.skills.slice(0, 12).join(", ")}.`
          : "";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `_(AI service unavailable - showing public profile summary)_\n\n${summary}${skills}`,
        },
      ]);
      toast.error(e.message || "AI request failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-2xl font-semibold">Assistant not found</h1>
        <p className="text-muted-foreground">This link does not exist or has been removed.</p>
        <Button asChild>
          <Link to="/">Create your own</Link>
        </Button>
      </div>
    );
  }

  const firstName = profile.name?.split(" ")[0] || "this candidate";
  const initials = (profile.name || "AI")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            ResumeLink AI
          </Link>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Answers are grounded in the uploaded resume
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Create yours</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[340px_1fr] lg:px-8">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight">{profile.name || "Anonymous"}</h1>
                {profile.title && <p className="mt-1 text-sm text-muted-foreground">{profile.title}</p>}
              </div>
            </div>

            {profile.extracted_summary && (
              <p className="mt-5 text-sm leading-6 text-muted-foreground">{profile.extracted_summary}</p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Metric label="Skills" value={profile.skills?.length || 0} />
              <Metric label="Projects" value={profile.projects?.length || 0} />
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Contact</h2>
            <div className="space-y-2 text-sm">
              {profile.email && <ContactLink href={`mailto:${profile.email}`} icon={Mail} label={profile.email} />}
              {profile.linkedin && <ContactLink href={normalizeUrl(profile.linkedin)} icon={Linkedin} label="LinkedIn" />}
              {profile.github && <ContactLink href={normalizeUrl(profile.github)} icon={Github} label="GitHub" />}
              {profile.portfolio_url && <ContactLink href={normalizeUrl(profile.portfolio_url)} icon={Globe} label="Portfolio" />}
              {!profile.email && !profile.linkedin && !profile.github && !profile.portfolio_url && (
                <p className="text-sm text-muted-foreground">No public contact links were extracted.</p>
              )}
            </div>
          </section>

          {profile.skills && profile.skills.length > 0 && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.slice(0, 20).map((skill, i) => (
                  <Badge key={`${skill}-${i}`} variant="secondary" className="font-normal">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <StructuredSection title="Projects" icon={BriefcaseBusiness} items={profile.projects} />
          <StructuredSection title="Education" icon={GraduationCap} items={profile.education} />
        </aside>

        <section className="flex min-h-[calc(100vh-7.5rem)] flex-col overflow-hidden rounded-lg border bg-card shadow-card">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Chat with {firstName}'s assistant</div>
                <div className="text-xs text-muted-foreground">Ask about background, skills, projects, or role fit.</div>
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {messages.length === 0 && (
              <div className="mx-auto max-w-2xl py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="h-5 w-5 text-secondary-foreground" />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">Start with a focused question</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This assistant can answer from {profile.name || "the candidate"}'s uploaded resume and extracted profile data.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTED.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:border-primary hover:bg-secondary/50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-[85%] rounded-lg border bg-background px-4 py-3 text-foreground dark:prose-invert prose-p:my-2 prose-ul:my-2">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading resume context...
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t bg-background/60 p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about skills, experience, projects..."
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ContactLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </a>
  );
}

function StructuredSection({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof BriefcaseBusiness;
  items: unknown[] | null;
}) {
  const visible = Array.isArray(items) ? items.slice(0, 3) : [];
  if (visible.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <div className="space-y-3">
        {visible.map((item, index) => (
          <div key={index} className="border-t pt-3 first:border-t-0 first:pt-0">
            <div className="text-sm font-medium">{getItemTitle(item) || `${title.slice(0, -1)} ${index + 1}`}</div>
            {getItemDetail(item) && <p className="mt-1 text-xs leading-5 text-muted-foreground">{getItemDetail(item)}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function getItemTitle(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return cleanString(record.name) || cleanString(record.role) || cleanString(record.degree) || cleanString(record.company);
}

function getItemDetail(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const record = item as Record<string, unknown>;
  return (
    cleanString(record.description) ||
    cleanString(record.details) ||
    cleanString(record.period) ||
    cleanString(record.institution)
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(u: string) {
  if (!u) return "#";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "AI request failed";
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
    try {
      const text = await response.clone().text();
      return text.trim() || fallback;
    } catch {
      return fallback;
    }
  }
}

export default Assistant;
