const API_BASE = import.meta.env.DEV
  ? "http://localhost:3001"
  : "";

export interface StudyMaterial {
  _id: string;
  name: string;
  category: string;
  fileSize: number;
  uploadedAt: string;
}

export interface UploadedFilePayload {
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface MentorQuestion {
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  difficultyLevel?: string;
  sourceFile?: string;
}

export interface MentorResponse {
  empty?: boolean;
  message?: string;
  answer?: string;
  simpleExplanation?: string;
  keyPoints?: string[];
  example?: string[];
  sourceFile?: string;
  sourceFiles?: string[];
  confidence?: number;
  title?: string;
  bullets?: string[];
  questions?: MentorQuestion[];
  flashcards?: Array<{ front: string; back: string }>;
  basic?: Array<{ question: string; answerHint?: string }>;
  intermediate?: Array<{ question: string; answerHint?: string }>;
  advanced?: Array<{ question: string; answerHint?: string }>;
  topics?: Array<{ topic: string; rank: number; whyImportant: string }>;
  roadmap?: Array<{ week: string; focus: string; goals: string[] }>;
}

export interface MentorSession {
  _id: string;
  title: string;
}

export async function fetchStudyMaterials(): Promise<StudyMaterial[]> {
  const response = await fetch(`${API_BASE}/api/rag/documents`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load study materials");
  }

  return data.documents || [];
}

export async function deleteStudyMaterial(documentId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/rag/documents/${documentId}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete study material");
  }
}

export async function uploadStudyMaterials(files: UploadedFilePayload[], category = "notes"): Promise<{ documents: StudyMaterial[] }> {
  const response = await fetch(`${API_BASE}/api/mentor/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, category }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to upload study materials");
  }

  return data;
}

export async function createMentorSession(title = "AI Mentor Session"): Promise<MentorSession> {
  const response = await fetch(`${API_BASE}/api/rag/history/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to create AI Mentor session");
  }

  return data.session;
}

export async function askMentor(sessionId: string, question: string): Promise<MentorResponse> {
  const response = await fetch(`${API_BASE}/api/mentor/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, question }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to generate mentor response");
  }

  return data;
}

export async function generateMentorContent(type: "summary" | "quiz" | "flashcards" | "interview" | "topics" | "roadmap" | "code-explain"): Promise<MentorResponse> {
  const response = await fetch(`${API_BASE}/api/mentor/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to generate ${type}`);
  }

  return data;
}