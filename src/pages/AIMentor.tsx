import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Code2,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Target,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  askMentor,
  createMentorSession,
  deleteStudyMaterial,
  fetchStudyMaterials,
  generateMentorContent,
  type MentorResponse,
  type StudyMaterial,
  type UploadedFilePayload,
  uploadStudyMaterials,
} from "@/lib/mentorApi";

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

type VoicePreset = "male" | "female" | "indian" | "us";
type VoiceState = "idle" | "speaking" | "paused";
type ActionType = "summary" | "quiz" | "flashcards" | "interview" | "topics" | "roadmap" | "code-explain";

interface MentorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  structured?: MentorResponse;
  kind?: ActionType | "chat";
  createdAt: number;
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface VoiceSettings {
  autoRead: boolean;
  voicePreset: VoicePreset;
  rate: number;
  pitch: number;
  volume: number;
}

const SUPPORTED_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "txt"];

const ACTIONS: Array<{
  type: ActionType;
  title: string;
  description: string;
  icon: typeof Sparkles;
  accent: string;
}> = [
  { type: "summary", title: "Generate Summary", description: "Concise notes up to two pages.", icon: BookOpen, accent: "from-blue-500/15 to-cyan-500/15" },
  { type: "quiz", title: "Generate Quiz", description: "10 MCQs with answers and explanations.", icon: HelpCircle, accent: "from-amber-500/15 to-orange-500/15" },
  { type: "flashcards", title: "Generate Flashcards", description: "Quick revision cards from your notes.", icon: WandSparkles, accent: "from-violet-500/15 to-fuchsia-500/15" },
  { type: "interview", title: "Interview Questions", description: "Basic to advanced interview prep.", icon: Brain, accent: "from-emerald-500/15 to-teal-500/15" },
  { type: "topics", title: "Important Topics", description: "Rank the most repeated concepts.", icon: Target, accent: "from-rose-500/15 to-pink-500/15" },
  { type: "roadmap", title: "Study Roadmap", description: "Personalized week-by-week plan.", icon: GraduationCap, accent: "from-indigo-500/15 to-sky-500/15" },
  { type: "code-explain", title: "Explain Code", description: "Line-by-line logic for uploaded code.", icon: Code2, accent: "from-slate-500/15 to-zinc-500/15" },
];

const defaultVoiceSettings: VoiceSettings = {
  autoRead: true,
  voicePreset: "us",
  rate: 1,
  pitch: 1,
  volume: 1,
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getFileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function isSupportedFile(file: File) {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file.name));
}

function fileToPayload(file: File): Promise<UploadedFilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.includes(",") ? result.split(",")[1] : result;
      resolve({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data });
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function parseMentorContent(content: string): MentorResponse | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      return parsed as MentorResponse;
    }
  } catch {
    return null;
  }
  return null;
}

function buildSpeechText(message: MentorChatMessage) {
  if (!message.structured) {
    return message.content;
  }

  const data = message.structured;
  const parts: string[] = [];

  if (data.answer) parts.push(`Answer. ${data.answer}`);
  if (data.simpleExplanation) parts.push(`Simple Explanation. ${data.simpleExplanation}`);
  if (data.keyPoints?.length) parts.push(`Key Points. ${data.keyPoints.join(". ")}`);
  if (data.example?.length) parts.push(`Example. ${data.example.join(". ")}`);
  if (data.sourceFile) parts.push(`Source File. ${data.sourceFile}`);
  if (typeof data.confidence === "number") parts.push(`Confidence Score. ${data.confidence} percent.`);

  if (message.kind === "quiz" && data.questions?.length) {
    parts.unshift(`I generated ${data.questions.length} quiz questions from your uploaded materials.`);
  }

  if (message.kind === "flashcards" && data.flashcards?.length) {
    parts.unshift(`I generated ${data.flashcards.length} flashcards from your uploaded materials.`);
  }

  if (message.kind === "interview") {
    parts.unshift("I generated interview questions at basic, intermediate, and advanced levels.");
  }

  if (message.kind === "topics" && data.topics?.length) {
    parts.unshift(`I found ${data.topics.length} important topics from your uploaded materials.`);
  }

  if (message.kind === "roadmap" && data.roadmap?.length) {
    parts.unshift(`I created a ${data.roadmap.length}-week study roadmap from your materials.`);
  }

  return parts.filter(Boolean).join(" ");
}

function selectVoice(voices: SpeechSynthesisVoice[], preset: VoicePreset) {
  const normalized = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));

  const byPreset: Record<VoicePreset, SpeechSynthesisVoice | undefined> = {
    male: normalized.find((voice) => /male/i.test(voice.name)) || normalized[0],
    female: normalized.find((voice) => /female/i.test(voice.name)) || normalized[1] || normalized[0],
    indian: voices.find((voice) => voice.lang.toLowerCase().startsWith("en-in")) || normalized.find((voice) => /india/i.test(voice.name)) || normalized[0],
    us: voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) || normalized[0],
  };

  return byPreset[preset] || normalized[0];
}

const AIMentor = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sessionId, setSessionId] = useState<string>("");
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [messages, setMessages] = useState<MentorChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content: "Upload your study materials, then ask questions. I will answer only from your uploaded notes.",
      kind: "chat",
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(defaultVoiceSettings);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [listeningMessage, setListeningMessage] = useState<string>("");
  const [currentSpeechText, setCurrentSpeechText] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const autoRestartListeningRef = useRef(false);
  const latestSpeechMessageIdRef = useRef<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("kai_ai_mentor_voice_settings");
    if (stored) {
      try {
        setVoiceSettings({ ...defaultVoiceSettings, ...JSON.parse(stored) });
      } catch {
        setVoiceSettings(defaultVoiceSettings);
      }
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setListeningMessage("Speech recognition is not supported in this browser.");
    } else {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-IN";
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .slice(event.resultIndex)
          .map((result: any) => result[0]?.transcript || "")
          .join(" ")
          .trim();

        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = (event: any) => {
        setListeningMessage(event?.error === "not-allowed" ? "Microphone access was denied." : "Speech recognition failed. Please try again.");
        setIsListening(false);
        autoRestartListeningRef.current = false;
      };
      recognition.onend = () => {
        if (autoRestartListeningRef.current) {
          try {
            recognition.start();
            return;
          } catch {
            // fall through
          }
        }
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    }

    const handleVoicesChanged = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    handleVoicesChanged();
    window.speechSynthesis?.addEventListener?.("voiceschanged", handleVoicesChanged);

    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", handleVoicesChanged);
      stopSpeaking();
      autoRestartListeningRef.current = false;
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("kai_ai_mentor_voice_settings", JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!sessionId) {
      createMentorSession("AI Mentor Session")
        .then((session) => setSessionId(session._id))
        .catch((error) => {
          console.error(error);
          toast({ title: "Error", description: "Failed to create AI Mentor session.", variant: "destructive" });
        });
    }

    loadMaterials();
  }, []);

  useEffect(() => {
    if (loading) {
      stopSpeaking();
    }
  }, [loading]);

  const currentVoice = useMemo(() => selectVoice(voices, voiceSettings.voicePreset), [voices, voiceSettings.voicePreset]);

  const loadMaterials = async () => {
    try {
      setMaterialsLoading(true);
      const data = await fetchStudyMaterials();
      setMaterials(data);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to load study materials.", variant: "destructive" });
    } finally {
      setMaterialsLoading(false);
    }
  };

  function stopSpeaking() {
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
  }

  function speakMessage(message: MentorChatMessage) {
    if (!window.speechSynthesis) {
      toast({ title: "Voice output unavailable", description: "Speech synthesis is not supported in this browser.", variant: "destructive" });
      return;
    }

    const speechText = buildSpeechText(message);
    if (!speechText.trim()) {
      return;
    }

    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(speechText);
    if (currentVoice) {
      utterance.voice = currentVoice;
    }
    utterance.rate = voiceSettings.rate;
    utterance.pitch = voiceSettings.pitch;
    utterance.volume = voiceSettings.volume;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    utterance.onerror = () => setVoiceState("idle");
    setCurrentSpeechText(speechText);
    window.speechSynthesis.speak(utterance);
  }

  function triggerAutoRead(message: MentorChatMessage) {
    latestSpeechMessageIdRef.current = message.id;
    if (voiceSettings.autoRead) {
      speakMessage(message);
    }
  }

  async function handleUploadFileList(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    const invalidFile = fileArray.find((file) => !isSupportedFile(file));
    if (invalidFile) {
      toast({
        title: "Unsupported file",
        description: "Supported formats are PDF, DOC, DOCX, PPT, PPTX, and TXT.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    for (const file of fileArray) {
      const taskId = uid();
      const task: UploadTask = { id: taskId, name: file.name, progress: 0, status: "queued" };
      setUploadTasks((prev) => [task, ...prev]);

      try {
        const payload = await fileToPayload(file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API_BASE}/api/mentor/upload`);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadTasks((prev) => prev.map((item) => item.id === taskId ? { ...item, progress: percent, status: "uploading" } : item));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadTasks((prev) => prev.map((item) => item.id === taskId ? { ...item, progress: 100, status: "done" } : item));
              resolve();
            } else {
              reject(new Error("Upload failed"));
            }
          };
          xhr.onerror = () => reject(new Error("Network error while uploading file"));
          xhr.send(JSON.stringify({ files: [payload], category: "notes" }));
        });
      } catch (error: any) {
        setUploadTasks((prev) => prev.map((item) => item.id === taskId ? { ...item, status: "error", error: error.message || "Upload failed" } : item));
        toast({ title: "Upload failed", description: error.message || `Failed to upload ${file.name}.`, variant: "destructive" });
      }
    }

    await loadMaterials();
    setUploading(false);
  }

  async function handleDeleteMaterial(id: string) {
    try {
      await deleteStudyMaterial(id);
      toast({ title: "Deleted", description: "Study material removed from the mentor library." });
      await loadMaterials();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message || "Could not delete the file.", variant: "destructive" });
    }
  }

  async function handleSendQuestion(questionText?: string) {
    const question = (questionText || input).trim();
    if (!question || !sessionId || loading) return;

    setLoading(true);
    setActiveAction(null);
    stopSpeaking();

    const userMessage: MentorChatMessage = {
      id: uid(),
      role: "user",
      content: question,
      createdAt: Date.now(),
      kind: "chat",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await askMentor(sessionId, question);
      const assistantMessage: MentorChatMessage = {
        id: uid(),
        role: "assistant",
        content: response.empty || response.message ? response.message || "I couldn't find this answer in your uploaded study materials." : response.answer || JSON.stringify(response),
        structured: response,
        kind: "chat",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      triggerAutoRead(assistantMessage);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to get an AI response.", variant: "destructive" });
      setMessages((prev) => [...prev, {
        id: uid(),
        role: "assistant",
        content: "I couldn't find this answer in your uploaded study materials.",
        createdAt: Date.now(),
        kind: "chat",
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(type: ActionType) {
    if (loading) return;
    setLoading(true);
    setActiveAction(type);
    stopSpeaking();

    try {
      const response = await generateMentorContent(type);
      const assistantMessage: MentorChatMessage = {
        id: uid(),
        role: "assistant",
        content: response.message || response.answer || `Generated ${type}.`,
        structured: response,
        kind: type,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      triggerAutoRead(assistantMessage);
    } catch (error: any) {
      toast({ title: "Generation failed", description: error.message || `Could not generate ${type}.`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    if (!speechSupported || !recognitionRef.current) {
      setListeningMessage("Speech recognition is not supported in this browser.");
      toast({ title: "Voice input unavailable", description: "Speech recognition is not supported in this browser.", variant: "destructive" });
      return;
    }

    try {
      recognitionRef.current.lang = voiceSettings.voicePreset === "indian" ? "en-IN" : "en-US";
      autoRestartListeningRef.current = true;
      recognitionRef.current.start();
      setIsListening(true);
      setListeningMessage("Listening...");
    } catch {
      setListeningMessage("Voice input is already active.");
    }
  }

  function stopListening() {
    autoRestartListeningRef.current = false;
    recognitionRef.current?.stop?.();
    setIsListening(false);
    setListeningMessage("");
  }

  function handleVoiceToggle() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendQuestion();
    }
  }

  function playLatestResponse() {
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!lastAssistant) return;
    speakMessage(lastAssistant);
  }

  function pauseSpeech() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setVoiceState("paused");
  }

  function replaySpeech() {
    if (!currentSpeechText) {
      playLatestResponse();
      return;
    }

    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(currentSpeechText);
    if (currentVoice) {
      utterance.voice = currentVoice;
    }
    utterance.rate = voiceSettings.rate;
    utterance.pitch = voiceSettings.pitch;
    utterance.volume = voiceSettings.volume;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    window.speechSynthesis.speak(utterance);
  }

  const renderMarkdown = (value: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => <table className="w-full border-collapse rounded-xl overflow-hidden text-sm">{children}</table>,
        th: ({ children }) => <th className="border border-border/70 bg-muted/70 px-3 py-2 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-border/70 px-3 py-2 align-top">{children}</td>,
        code: ({ className, children, inline }) =>
          inline ? (
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.92em]">{children}</code>
          ) : (
            <pre className="overflow-x-auto rounded-2xl bg-zinc-950 px-4 py-3 text-sm text-zinc-50 shadow-inner shadow-black/20">
              <code className={className}>{children}</code>
            </pre>
          ),
      }}
    >
      {value}
    </ReactMarkdown>
  );

  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  const renderStructuredMessage = (message: MentorChatMessage) => {
    const data = message.structured;
    if (!data) {
      return <div className="prose prose-sm max-w-none text-sm text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-table:text-foreground">{renderMarkdown(message.content)}</div>;
    }

    if (data.questions?.length) {
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data.questions.map((question, index) => (
              <div key={index} className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="font-semibold text-sm text-foreground">Question {index + 1}</h4>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{question.difficultyLevel || "Basic"}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{question.question}</p>
                {question.options?.length ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-foreground/90">
                        {String.fromCharCode(65 + optionIndex)}. {option}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 space-y-2 text-sm text-foreground/90">
                  <p><span className="font-semibold text-foreground">Correct Answer:</span> {question.correctAnswer || "See the uploaded material"}</p>
                  <p><span className="font-semibold text-foreground">Explanation:</span> {question.explanation || "Generated from your uploaded material."}</p>
                  {question.sourceFile ? <p><span className="font-semibold text-foreground">Source File:</span> {question.sourceFile}</p> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p><span className="font-semibold">Confidence Score:</span> {data.confidence ?? 0}%</p>
            {data.sourceFiles?.length ? <p className="mt-1 text-foreground/70">Source Files: {data.sourceFiles.join(", ")}</p> : null}
          </div>
        </div>
      );
    }

    if (data.flashcards?.length) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {data.flashcards.map((flashcard, index) => (
            <div key={index} className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <Lightbulb className="h-4 w-4" /> Front
              </div>
              <p className="text-sm font-medium text-foreground">{flashcard.front}</p>
              <div className="my-4 h-px bg-border/60" />
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <Brain className="h-4 w-4" /> Back
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{flashcard.back}</p>
            </div>
          ))}
          <div className="md:col-span-2 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p><span className="font-semibold">Confidence Score:</span> {data.confidence ?? 0}%</p>
          </div>
        </div>
      );
    }

    if (data.basic || data.intermediate || data.advanced) {
      const sections = [
        { title: "Basic", items: data.basic || [] },
        { title: "Intermediate", items: data.intermediate || [] },
        { title: "Advanced", items: data.advanced || [] },
      ];

      return (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <h4 className="mb-3 text-sm font-semibold text-foreground">{section.title}</h4>
              <div className="space-y-3">
                {section.items.map((item, index) => (
                  <div key={index} className="rounded-xl bg-muted/30 px-3 py-3 text-sm text-foreground/90">
                    {item.question}
                    {item.answerHint ? <p className="mt-1 text-xs text-muted-foreground">Hint: {item.answerHint}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p><span className="font-semibold">Confidence Score:</span> {data.confidence ?? 0}%</p>
          </div>
        </div>
      );
    }

    if (data.topics?.length) {
      return (
        <div className="space-y-4">
          {data.topics.map((topic) => (
            <div key={topic.rank} className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{topic.topic}</h4>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Rank {topic.rank}</span>
              </div>
              <p className="mt-2 text-sm text-foreground/90">{topic.whyImportant}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p><span className="font-semibold">Confidence Score:</span> {data.confidence ?? 0}%</p>
          </div>
        </div>
      );
    }

    if (data.roadmap?.length) {
      return (
        <div className="space-y-4">
          {data.roadmap.map((item, index) => (
            <div key={index} className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{item.week}</h4>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Study Plan</span>
              </div>
              <p className="mt-2 text-sm text-foreground/90">Focus: {item.focus}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/80">
                {item.goals.map((goal, goalIndex) => <li key={goalIndex}>{goal}</li>)}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p><span className="font-semibold">Confidence Score:</span> {data.confidence ?? 0}%</p>
          </div>
        </div>
      );
    }

    if (data.answer || data.simpleExplanation) {
      return (
        <div className="space-y-4">
          {data.answer ? (
            <section className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Answer</h4>
              <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-table:text-foreground">{renderMarkdown(data.answer)}</div>
            </section>
          ) : null}
          {data.simpleExplanation ? (
            <section className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Simple Explanation</h4>
              <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-table:text-foreground">{renderMarkdown(data.simpleExplanation)}</div>
            </section>
          ) : null}
          {data.keyPoints?.length ? (
            <section className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Key Points</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {data.keyPoints.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
            </section>
          ) : null}
          {data.example?.length ? (
            <section className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Example</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {data.example.map((example, index) => <li key={index}>{example}</li>)}
              </ul>
            </section>
          ) : null}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
              <h4 className="mb-2 font-semibold text-foreground">Source File</h4>
              <p className="text-foreground/80">{data.sourceFile || data.sourceFiles?.join(", ") || "Source not available"}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
              <h4 className="mb-2 font-semibold text-foreground">Confidence Score</h4>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500" style={{ width: `${Math.min(100, data.confidence ?? 0)}%` }} />
                </div>
                <span className="font-semibold text-foreground">{data.confidence ?? 0}%</span>
              </div>
            </div>
          </section>
        </div>
      );
    }

    return <div className="prose prose-sm max-w-none text-foreground">{renderMarkdown(message.content)}</div>;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_20%),linear-gradient(to_bottom,theme(colors.background),theme(colors.background))] text-foreground">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-1/3 left-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1700px] flex-col px-4 py-4 lg:px-6">
        <motion.header
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-border/60 bg-card/60 px-5 py-4 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-amber-400 to-amber-600 shadow-[0_12px_40px_rgba(245,158,11,0.25)] ring-1 ring-white/35 dark:ring-white/10">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">AI Mentor</h1>
              <p className="text-sm text-muted-foreground">Learn only from your uploaded study materials.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 shadow-sm backdrop-blur-sm">ChatGPT-style study workspace</span>
            <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 shadow-sm backdrop-blur-sm">RAG-only answers</span>
            <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 shadow-sm backdrop-blur-sm">Markdown, tables, code blocks</span>
          </div>
        </motion.header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 xl:gap-6">
          <aside className="min-h-0 overflow-hidden rounded-[2rem] border border-border/60 bg-card/60 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:col-span-3">
            <div className="flex h-full flex-col">
              <div className="border-b border-border/50 bg-gradient-to-b from-background/60 to-transparent px-5 py-4">
                <h2 className="font-display text-lg font-semibold">Study Materials</h2>
                <p className="mt-1 text-sm text-muted-foreground">Upload notes and documents to power your mentor.</p>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div
                  className={`group cursor-pointer rounded-[1.75rem] border-2 border-dashed p-5 text-center transition-all duration-300 ${isDragging ? "border-primary bg-primary/5 scale-[1.01] shadow-[0_20px_50px_rgba(59,130,246,0.12)]" : "border-border/70 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_20px_50px_rgba(59,130,246,0.08)]"}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    await handleUploadFileList(event.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                    onChange={async (event) => {
                      if (event.target.files) {
                        await handleUploadFileList(event.target.files);
                        event.target.value = "";
                      }
                    }}
                  />
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-amber-500/10 to-cyan-500/10 text-primary ring-1 ring-primary/10 transition-transform duration-300 group-hover:scale-105">
                    <Upload className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold tracking-tight">Upload files</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, DOC, DOCX, PPT, PPTX, TXT</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUPPORTED_EXTENSIONS.map((ext) => (
                      <span key={ext} className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {ext}
                      </span>
                    ))}
                  </div>
                </div>

                {listeningMessage ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {listeningMessage}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Upload Progress</h3>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                  </div>
                  {uploadTasks.length ? (
                    <div className="space-y-3">
                      {uploadTasks.map((task) => (
                        <div key={task.id} className="rounded-2xl border border-border/60 bg-background/55 p-3 shadow-sm backdrop-blur-sm">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-medium">{task.name}</span>
                            <span className="text-xs text-muted-foreground">{task.status === "done" ? "Done" : task.status === "error" ? "Error" : `${task.progress}%`}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${task.status === "error" ? "bg-red-500" : "bg-gradient-to-r from-primary via-sky-500 to-amber-500"}`} style={{ width: `${task.status === "done" ? 100 : task.progress}%` }} />
                          </div>
                          {task.error ? <p className="mt-2 text-xs text-red-500">{task.error}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                      Upload multiple files to build your study library.
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Uploaded Files</h3>
                  <ScrollArea className="h-[360px] pr-3">
                    {materialsLoading ? (
                      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading materials...
                      </div>
                    ) : materials.length ? (
                      <div className="space-y-3">
                        {materials.map((material) => (
                          <div key={material._id} className="rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-amber-500/15 text-primary ring-1 ring-primary/10">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(material.uploadedAt)}</p>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-red-500" onClick={() => handleDeleteMaterial(material._id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                        No study materials uploaded yet.
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-h-0 overflow-hidden rounded-[2rem] border border-border/60 bg-card/60 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:col-span-6">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border/50 bg-gradient-to-b from-background/60 to-transparent px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold">AI Mentor</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Chat only from uploaded notes. Answers include source details and confidence.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                    <span className={`h-2 w-2 rounded-full ${voiceState === "speaking" ? "bg-emerald-500" : voiceState === "paused" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                    {voiceState === "speaking" ? "Speaking" : voiceState === "paused" ? "Paused" : "Idle"}
                  </div>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 px-5 py-4">
                <div className="space-y-5">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-full rounded-[1.75rem] border px-4 py-4 shadow-sm transition-all duration-300 ${message.role === "user" ? "border-primary/20 bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground shadow-[0_20px_45px_rgba(59,130,246,0.18)]" : "border-border/60 bg-background/80 text-foreground shadow-[0_12px_35px_rgba(15,23,42,0.04)] backdrop-blur-sm"}`}>
                        {message.role === "assistant" ? (
                          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary">
                            <Brain className="h-4 w-4" /> AI Mentor
                          </div>
                        ) : null}
                        {message.role === "user" ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                        ) : (
                          renderStructuredMessage(message)
                        )}
                        {message.role === "assistant" ? (
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 rounded-full border-primary/20 text-xs" onClick={() => speakMessage(message)}>
                              <Play className="mr-2 h-3.5 w-3.5" /> Play
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={pauseSpeech}>
                              <Pause className="mr-2 h-3.5 w-3.5" /> Pause
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={stopSpeaking}>
                              <Square className="mr-2 h-3.5 w-3.5" /> Stop
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={replaySpeech}>
                              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Replay
                            </Button>
                            {message.structured?.sourceFiles?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {message.structured.sourceFiles.map((source) => (
                                  <span key={source} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                                    {source}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  <AnimatePresence>
                    {loading ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex justify-start"
                      >
                        <div className="rounded-3xl border border-border/60 bg-background/70 px-4 py-4 shadow-sm">
                          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary">
                            <Loader2 className="h-4 w-4 animate-spin" /> Thinking
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/70" />
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/50 [animation-delay:150ms]" />
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/30 [animation-delay:300ms]" />
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-border/50 bg-gradient-to-b from-transparent to-background/70 px-5 py-4 backdrop-blur-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shadow-sm" onClick={playLatestResponse}>
                    <Play className="mr-2 h-3.5 w-3.5" /> Play Latest
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shadow-sm" onClick={pauseSpeech}>
                    <Pause className="mr-2 h-3.5 w-3.5" /> Pause
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shadow-sm" onClick={stopSpeaking}>
                    <Square className="mr-2 h-3.5 w-3.5" /> Stop
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shadow-sm" onClick={replaySpeech}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" /> Replay
                  </Button>
                  <div className="ml-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                    <span>Auto Read</span>
                    <button
                      type="button"
                      onClick={() => setVoiceSettings((prev) => ({ ...prev, autoRead: !prev.autoRead }))}
                      className={`relative h-5 w-10 rounded-full transition-colors ${voiceSettings.autoRead ? "bg-primary" : "bg-muted"}`}
                      aria-label="Toggle auto read"
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${voiceSettings.autoRead ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                  <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-3 shadow-inner shadow-black/5 ring-1 ring-white/20">
                    <Textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder="Ask anything about your uploaded notes..."
                      className="min-h-[120px] resize-none border-0 bg-transparent px-2 py-1 text-sm shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0"
                      aria-label="Ask AI Mentor a question"
                    />
                  </div>

                  <div className="flex items-end gap-2 xl:flex-col xl:items-stretch">
                    <Button
                      onClick={handleVoiceToggle}
                      variant="outline"
                      className={`h-12 rounded-2xl px-4 shadow-sm ${isListening ? "border-red-500/30 bg-red-500/10 text-red-500" : ""}`}
                      aria-label={isListening ? "Stop listening" : "Start voice input"}
                    >
                      {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                      {isListening ? "Stop Listening" : "Voice Input"}
                    </Button>

                    <Button
                      onClick={() => handleSendQuestion()}
                      disabled={loading || !input.trim()}
                      className="h-12 rounded-2xl px-5 shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-[1.01]"
                      aria-label="Send question"
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Send
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Voice Selection</label>
                    <select
                      value={voiceSettings.voicePreset}
                      onChange={(event) => setVoiceSettings((prev) => ({ ...prev, voicePreset: event.target.value as VoicePreset }))}
                      className="mt-2 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none"
                      aria-label="Voice selection"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="indian">Indian English</option>
                      <option value="us">US English</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Speech Speed</label>
                    <select
                      value={voiceSettings.rate}
                      onChange={(event) => setVoiceSettings((prev) => ({ ...prev, rate: Number(event.target.value) }))}
                      className="mt-2 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none"
                      aria-label="Speech speed"
                    >
                      <option value={0.75}>0.75x</option>
                      <option value={1}>1x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Voice Status</label>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      {speechSupported ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-red-500" />}
                      <span>{speechSupported ? "Voice features ready" : "Speech recognition unavailable"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Pitch</label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={voiceSettings.pitch}
                      onChange={(event) => setVoiceSettings((prev) => ({ ...prev, pitch: Number(event.target.value) }))}
                      className="mt-3 w-full"
                      aria-label="Pitch slider"
                    />
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Volume</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceSettings.volume}
                      onChange={(event) => setVoiceSettings((prev) => ({ ...prev, volume: Number(event.target.value) }))}
                      className="mt-3 w-full"
                      aria-label="Volume slider"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-hidden rounded-[2rem] border border-border/60 bg-card/60 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:col-span-3">
            <div className="flex h-full flex-col">
              <div className="border-b border-border/50 bg-gradient-to-b from-background/60 to-transparent px-5 py-4">
                <h2 className="font-display text-lg font-semibold">Quick AI Actions</h2>
                <p className="mt-1 text-sm text-muted-foreground">Generate study assets from your uploaded materials.</p>
              </div>

              <ScrollArea className="min-h-0 flex-1 px-5 py-4">
                <div className="grid gap-3">
                  {ACTIONS.map((action) => (
                    <button
                      key={action.type}
                      type="button"
                      onClick={() => handleAction(action.type)}
                      className={`group rounded-[1.5rem] border border-border/60 bg-gradient-to-br ${action.accent} p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5`}
                      aria-label={action.title}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-background/75 text-primary shadow-sm ring-1 ring-white/30 backdrop-blur-sm">
                          <action.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="font-display text-sm font-semibold text-foreground">{action.title}</h3>
                            {activeAction === action.type && loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-border/60 bg-background/60 p-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <h3 className="font-display text-sm font-semibold">Supported Outputs</h3>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>Summary with important concepts</li>
                    <li>10-question MCQ quiz</li>
                    <li>Flashcards for quick revision</li>
                    <li>Basic, intermediate, and advanced interview questions</li>
                    <li>Important topics and study roadmap</li>
                    <li>Code explanation for uploaded code files</li>
                  </ul>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-border/60 bg-background/60 p-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-sm font-semibold">Current Session</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{sessionId ? `Session ready: ${sessionId.slice(0, 8)}` : "Preparing session..."}</p>
                  {latestAssistant?.structured?.sourceFiles?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestAssistant.structured.sourceFiles.map((source) => (
                        <span key={source} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                          {source}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AIMentor;