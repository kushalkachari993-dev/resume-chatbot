/// <reference lib="deno.ns" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_RESUME_CHARS = 50000;
const MAX_JOB_DESCRIPTION_CHARS = 20000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

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
        { error: "Too many analysis requests. Please wait a moment and try again." },
        429
      );
    }

    const { resume_text, job_description } = await req.json();

    if (typeof resume_text !== "string" || resume_text.trim().length < 30) {
      return jsonResponse({ error: "Readable resume text is required" }, 400);
    }

    if (typeof job_description !== "string" || job_description.trim().length < 80) {
      return jsonResponse({ error: "Please paste a complete job description" }, 400);
    }

    if (resume_text.length > MAX_RESUME_CHARS) {
      return jsonResponse({ error: "Resume text is too long" }, 400);
    }

    if (job_description.length > MAX_JOB_DESCRIPTION_CHARS) {
      return jsonResponse({ error: "Job description is too long" }, 400);
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
                "You compare resumes against job descriptions. Return only valid JSON, with no markdown or extra prose.",
            },
            {
              role: "user",
              content: buildPrompt(resume_text, job_description),
            },
          ],
          temperature: 0.1,
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
          error: "Job-fit analysis request failed",
          detail,
        },
        502
      );
    }

    const data = await groqResponse.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return jsonResponse({ error: "AI analysis returned no content" }, 502);
    }

    return jsonResponse(normalizeAnalysis(parseJsonObject(content)));
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected analysis error",
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

function buildPrompt(resumeText: string, jobDescription: string) {
  return `
Compare this resume against the job description.

Rules:
- Return one JSON object only.
- Do not invent resume experience.
- Score should be 0-100 based on evidence in the resume.
- Separate true gaps from wording/keyword gaps.
- Suggestions should be practical and specific.
- Suggested resume bullets must only use facts supported by the resume.

Required JSON shape:
{
  "score": number,
  "verdict": string,
  "matched_strengths": string[],
  "gaps": string[],
  "missing_keywords": string[],
  "resume_improvements": string[],
  "suggested_bullets": string[],
  "interview_questions": string[],
  "next_steps": string[]
}

Resume:
${resumeText}

Job description:
${jobDescription}
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
    throw new Error("AI analysis did not return valid JSON");
  }
}

function normalizeAnalysis(raw: Record<string, unknown>): JobFitAnalysis {
  return {
    score: normalizeScore(raw.score),
    verdict: stringValue(raw.verdict).slice(0, 500),
    matched_strengths: stringArray(raw.matched_strengths).slice(0, 8),
    gaps: stringArray(raw.gaps).slice(0, 8),
    missing_keywords: stringArray(raw.missing_keywords).slice(0, 16),
    resume_improvements: stringArray(raw.resume_improvements).slice(0, 8),
    suggested_bullets: stringArray(raw.suggested_bullets).slice(0, 8),
    interview_questions: stringArray(raw.interview_questions).slice(0, 8),
    next_steps: stringArray(raw.next_steps).slice(0, 6),
  };
}

function normalizeScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}
