/// <reference lib="deno.ns" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_RESUME_CHARS = 50000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;

type ExtractedResume = {
  name: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio_url: string | null;
  summary: string;
  skills: string[];
  projects: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
};

const requestCounts = new Map<string, { count: number; resetAt: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const ip = getRequestIp(req);
    if (isRateLimited(ip)) {
      return jsonResponse(
        { error: "Too many extraction requests. Please wait a moment and try again." },
        429
      );
    }

    const { resume_text, hints = {} } = await req.json();

    if (typeof resume_text !== "string" || resume_text.trim().length < 30) {
      return jsonResponse({ error: "Readable resume text is required" }, 400);
    }

    if (resume_text.length > MAX_RESUME_CHARS) {
      return jsonResponse({ error: "Resume text is too long" }, 400);
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return jsonResponse(
        {
          error:
            "AI provider is not configured. Add GROQ_API_KEY to Supabase Edge Function secrets.",
        },
        500
      );
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You extract structured resume data. Return only valid JSON, with no markdown, comments, or extra prose.",
            },
            {
              role: "user",
              content: buildPrompt(resume_text, hints),
            },
          ],
          temperature: 0,
          max_tokens: 1800,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      let detail = errorText;

      try {
        const parsed = JSON.parse(errorText);
        detail = parsed?.error?.message || parsed?.message || errorText;
      } catch {
        // Keep the raw provider response when it is not JSON.
      }

      return jsonResponse(
        {
          error: "AI extraction request failed",
          detail,
        },
        502
      );
    }

    const data = await groqResponse.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return jsonResponse({ error: "AI extraction returned no content" }, 502);
    }

    return jsonResponse(normalizeExtraction(parseJsonObject(content)));
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected extraction error",
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequestIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(key: string) {
  const now = Date.now();

  for (const [ip, entry] of requestCounts) {
    if (entry.resetAt <= now) requestCounts.delete(ip);
  }

  const entry = requestCounts.get(key);
  if (!entry || entry.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function buildPrompt(resumeText: string, hints: Record<string, unknown>) {
  return `
Extract structured data from this resume.

Use these rules:
- Return one JSON object only.
- Use null when a field is not present.
- Do not invent facts.
- Treat headings such as "Research Projects", "Academic Projects", "Selected Work", "Research Work", "Case Studies", and "Publications" as project-like work when appropriate.
- Keep summary under 500 characters.
- Keep skills as short skill names, not sentences.
- Preserve useful project and experience details from the resume.
- User-entered hints may help, but resume text is the source of truth.

Required JSON shape:
{
  "name": string | null,
  "title": string | null,
  "email": string | null,
  "linkedin": string | null,
  "github": string | null,
  "portfolio_url": string | null,
  "summary": string,
  "skills": string[],
  "projects": [
    {
      "name": string,
      "description": string | null,
      "technologies": string[],
      "links": string[]
    }
  ],
  "experience": [
    {
      "role": string | null,
      "company": string | null,
      "period": string | null,
      "description": string | null,
      "highlights": string[]
    }
  ],
  "education": [
    {
      "institution": string | null,
      "degree": string | null,
      "period": string | null,
      "details": string | null
    }
  ]
}

User-entered hints:
${JSON.stringify(hints, null, 2)}

Resume text:
${resumeText}
`;
}

function parseJsonObject(content: string): Record<string, unknown> {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI extraction did not return valid JSON");
  }
}

function normalizeExtraction(raw: Record<string, unknown>): ExtractedResume {
  return {
    name: nullableString(raw.name),
    title: nullableString(raw.title),
    email: nullableString(raw.email),
    linkedin: nullableString(raw.linkedin),
    github: nullableString(raw.github),
    portfolio_url: nullableString(raw.portfolio_url),
    summary: stringValue(raw.summary).slice(0, 500),
    skills: stringArray(raw.skills).slice(0, 40),
    projects: objectArray(raw.projects).slice(0, 12),
    experience: objectArray(raw.experience).slice(0, 12),
    education: objectArray(raw.education).slice(0, 8),
  };
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter(Boolean)
    .map((item) => item.slice(0, 80));
}

function objectArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
  );
}
