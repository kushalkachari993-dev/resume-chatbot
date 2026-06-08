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
const RATE_LIMIT_MAX_REQUESTS = 8;

type TailoredResumeDraft = {
  optimized_summary: string;
  optimized_skills: string[];
  optimized_experience_bullets: string[];
  optimized_project_bullets: string[];
  keywords_added: string[];
  unsupported_gaps: string[];
  warnings: string[];
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
        { error: "Too many tailoring requests. Please wait a moment and try again." },
        429
      );
    }

    const { resume_text, job_description, job_fit_analysis = {} } = await req.json();

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
                "You tailor resumes for job descriptions. Return only valid JSON. Never invent experience, tools, employers, credentials, metrics, or dates.",
            },
            {
              role: "user",
              content: buildPrompt(resume_text, job_description, job_fit_analysis),
            },
          ],
          temperature: 0.15,
          max_tokens: 2200,
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
        // Keep raw provider response when it is not JSON.
      }

      return jsonResponse(
        {
          error: "Resume tailoring request failed",
          detail,
        },
        502
      );
    }

    const data = await groqResponse.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return jsonResponse({ error: "AI tailoring returned no content" }, 502);
    }

    return jsonResponse(normalizeDraft(parseJsonObject(content)));
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected tailoring error",
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

function buildPrompt(
  resumeText: string,
  jobDescription: string,
  jobFitAnalysis: Record<string, unknown>
) {
  return `
Create a tailored resume draft from the resume and job description.

Rules:
- Return one JSON object only.
- Do not invent facts.
- Do not add unsupported skills, tools, credentials, employers, metrics, or dates.
- You may improve wording, ordering, specificity, and keyword alignment using facts already present in the resume.
- If a job requirement is missing from the resume, put it in unsupported_gaps instead of adding it.
- Suggested bullets must be copy-ready and truthful.
- Keep the summary between 2 and 4 sentences.

Required JSON shape:
{
  "optimized_summary": string,
  "optimized_skills": string[],
  "optimized_experience_bullets": string[],
  "optimized_project_bullets": string[],
  "keywords_added": string[],
  "unsupported_gaps": string[],
  "warnings": string[]
}

Job-fit analysis:
${JSON.stringify(jobFitAnalysis, null, 2)}

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
    throw new Error("AI tailoring did not return valid JSON");
  }
}

function normalizeDraft(raw: Record<string, unknown>): TailoredResumeDraft {
  return {
    optimized_summary: stringValue(raw.optimized_summary).slice(0, 1200),
    optimized_skills: stringArray(raw.optimized_skills).slice(0, 40),
    optimized_experience_bullets: stringArray(raw.optimized_experience_bullets).slice(0, 10),
    optimized_project_bullets: stringArray(raw.optimized_project_bullets).slice(0, 10),
    keywords_added: stringArray(raw.keywords_added).slice(0, 24),
    unsupported_gaps: stringArray(raw.unsupported_gaps).slice(0, 12),
    warnings: stringArray(raw.warnings).slice(0, 8),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}
