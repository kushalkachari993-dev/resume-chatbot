import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sparkles, Send, Mail, Linkedin, Github, Globe, ArrowLeft, Loader2 } from "lucide-react";
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
};

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "What are their top skills?",
  "Tell me about their projects",
  "Are they a fit for a GenAI Developer role?",
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
          content:
            `_(AI service unavailable - showing public profile summary)_\n\n${summary}${skills}`,
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
        <p className="text-muted-foreground">This link doesn't exist or has been removed.</p>
        <Button asChild><Link to="/">Create your own</Link></Button>
      </div>
    );
  }

  const initials = (profile.name || "AI")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-mesh" />

      <header className="container flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> ResumeLink AI
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Create yours</Link>
        </Button>
      </header>

      <div className="container grid max-w-6xl gap-6 pb-12 lg:grid-cols-[1fr_1.4fr]">
        {/* Profile */}
        <Card className="h-fit border bg-gradient-card p-6 shadow-card">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-primary/30">
              <AvatarFallback className="bg-gradient-hero text-lg font-semibold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">{profile.name || "Anonymous"}</h1>
              {profile.title && <p className="text-sm text-muted-foreground">{profile.title}</p>}
            </div>
          </div>

          {profile.extracted_summary && (
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {profile.extracted_summary}
            </p>
          )}

          {profile.skills && profile.skills.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s, i) => (
                  <Badge key={i} variant="secondary" className="font-normal">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2 text-sm">
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Mail className="h-4 w-4" /> {profile.email}
              </a>
            )}
            {profile.linkedin && (
              <a href={normalizeUrl(profile.linkedin)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Linkedin className="h-4 w-4" /> LinkedIn
              </a>
            )}
            {profile.github && (
              <a href={normalizeUrl(profile.github)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Github className="h-4 w-4" /> GitHub
              </a>
            )}
            {profile.portfolio_url && (
              <a href={normalizeUrl(profile.portfolio_url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Globe className="h-4 w-4" /> Portfolio
              </a>
            )}
          </div>
        </Card>

        {/* Chat */}
        <Card className="flex h-[78vh] flex-col overflow-hidden border bg-gradient-card shadow-elegant">
          <div className="flex items-center gap-2 border-b px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Chat with {profile.name?.split(" ")[0] || "their"} AI</div>
              <div className="text-xs text-muted-foreground">Grounded in their resume — no hallucinations</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.length === 0 && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-sm text-muted-foreground">
                  Hi! I'm {profile.name?.split(" ")[0] || "the"} AI assistant. Ask me anything about {profile.name?.split(" ")[0] || "this person"}'s background, skills, projects, or fit for a role.
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTED.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="rounded-xl border bg-background p-3 text-left text-sm transition-colors hover:border-primary hover:bg-accent/30"
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
                  <div className="prose prose-sm max-w-[85%] text-foreground dark:prose-invert prose-p:my-2 prose-ul:my-2">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-center gap-2 border-t bg-background/50 p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about skills, experience, projects…"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} size="icon" className="bg-gradient-hero text-primary-foreground hover:opacity-90">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

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
