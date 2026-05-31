import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Use the worker bundled with pdfjs-dist
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return await file.text();
  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.");
}

async function extractPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return out.trim();
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

export function slugify(name: string): string {
  const base = (name || "assistant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "assistant";
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}-${rand}`;
}

// Lightweight heuristic extraction so the profile page has nice structured sections
export function quickExtractProfile(text: string) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  // Skills: look for a "skills" section
  const skills: string[] = [];
  const skillsIdx = lines.findIndex((l) => /^skills?\b/i.test(l));
  if (skillsIdx >= 0) {
    const chunk = lines.slice(skillsIdx + 1, skillsIdx + 8).join(", ");
    chunk
      .split(/[,•|·\u2022;]/)
      .map((s) => s.trim())
      .filter((s) => s && s.length < 40)
      .slice(0, 24)
      .forEach((s) => skills.push(s));
  }

  // Summary: first non-trivial paragraph
  const summary = lines.find((l) => l.length > 80 && l.length < 500) || lines.slice(0, 3).join(" ");

  return {
    skills,
    summary: summary?.slice(0, 400) ?? "",
  };
}