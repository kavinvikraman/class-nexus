import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, Sparkles, Send, Upload, Plus, Trash2, FileText, 
  BookOpen, Loader2, HelpCircle, Briefcase, Scale, 
  MessageSquare, Clock, ArrowLeft, CheckCircle, AlertCircle, X, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// API base URL - relative in production, localhost in development
const API_BASE = import.meta.env.DEV 
  ? "http://localhost:3001" 
  : "";

interface Document {
  _id: string;
  name: string;
  category: string;
  fileSize: number;
  uploadedAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  createdAt?: string;
}

interface Session {
  _id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
}

const CATEGORIES = [
  { id: 'notes', label: 'Notes', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20' },
  { id: 'syllabus', label: 'Syllabus', icon: BookOpen, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20' },
  { id: 'questions', label: 'Question Bank', icon: HelpCircle, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
  { id: 'regulations', label: 'Regulations', icon: Scale, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
  { id: 'placement', label: 'Placement Materials', icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
];

const AIAssistant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // RAG States
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  
  // Selection / Form States
  const [question, setQuestion] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState<string>("notes");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Loading states
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(true);
  const [queryLoading, setQueryLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSessions();
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentSession?.messages, queryLoading]);

  // ============================================
  // API CALLS
  // ============================================

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rag/history`);
      const data = await response.json();
      if (response.ok) {
        setSessions(data.sessions);
        if (data.sessions.length > 0 && !currentSession) {
          // Select most recent session
          fetchSessionDetail(data.sessions[0]._id);
        }
      }
    } catch (e: any) {
      console.error("Failed to load chat history:", e);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchSessionDetail = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/rag/history/${id}`);
      const data = await response.json();
      if (response.ok) {
        setCurrentSession(data.session);
      }
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to load session details", variant: "destructive" });
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rag/documents`);
      const data = await response.json();
      if (response.ok) {
        setDocuments(data.documents);
      }
    } catch (e: any) {
      console.error("Failed to load documents:", e);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rag/history/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Academic Session #${sessions.length + 1}` })
      });
      const data = await response.json();
      if (response.ok) {
        setSessions([data.session, ...sessions]);
        setCurrentSession(data.session);
        toast({ title: "New session started", description: "You can now ask questions about your documents." });
      }
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to start new chat session", variant: "destructive" });
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/api/rag/history/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const filtered = sessions.filter(s => s._id !== id);
        setSessions(filtered);
        if (currentSession?._id === id) {
          if (filtered.length > 0) {
            fetchSessionDetail(filtered[0]._id);
          } else {
            setCurrentSession(null);
          }
        }
        toast({ title: "Session deleted" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to delete session", variant: "destructive" });
    }
  };

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document? This will remove it from the assistant's context.")) return;
    try {
      const response = await fetch(`${API_BASE}/api/rag/documents/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        toast({ title: "Success", description: "Document deleted successfully." });
        fetchDocuments();
      } else {
        const errData = await response.json();
        toast({ title: "Error", description: errData.error || "Failed to delete document.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Network error while deleting document.", variant: "destructive" });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Unsupported file", description: "Only PDF files are supported.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadLoading(true);
    try {
      const base64 = await fileToBase64(selectedFile);
      const response = await fetch(`${API_BASE}/api/rag/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedFile.name,
          category: uploadCategory,
          fileSize: selectedFile.size,
          file: base64
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      
      toast({ title: "Document ingested", description: `Successfully split and embedded ${selectedFile.name}` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDocuments();
    } catch (e: any) {
      toast({ title: "Upload Failed", description: e.message || "Failed to process PDF file", variant: "destructive" });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || queryLoading) return;
    
    let activeSession = currentSession;
    
    // Auto-create session if none active
    if (!activeSession) {
      try {
        const response = await fetch(`${API_BASE}/api/rag/history/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: question.length > 25 ? question.slice(0, 22) + '...' : question })
        });
        const data = await response.json();
        if (response.ok) {
          activeSession = data.session;
          setSessions([data.session, ...sessions]);
          setCurrentSession(data.session);
        } else {
          return;
        }
      } catch (err) {
        toast({ title: "Error", description: "Failed to initialize session", variant: "destructive" });
        return;
      }
    }

    if (!activeSession) return;

    const userMsg: Message = { role: 'user', content: question };
    
    // Optimistic Update
    const updatedMessages = [...(activeSession.messages || []), userMsg];
    setCurrentSession({ ...activeSession, messages: updatedMessages });
    const originalQuestion = question;
    setQuestion("");
    setQueryLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession._id,
          question: originalQuestion,
          category: categoryFilter === 'all' ? null : categoryFilter
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to query assistant');
      
      // Update with server session details containing assistant response
      setCurrentSession(data.session);
      
      // Update sidebar session item
      setSessions(prev => prev.map(s => s._id === activeSession?._id ? data.session : s));
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message || "Failed to generate response", variant: "destructive" });
      // Rollback user message on error
      setCurrentSession(activeSession);
      setQuestion(originalQuestion);
    } finally {
      setQueryLoading(false);
    }
  };

  // ============================================
  // DRAG & DROP HANDLERS
  // ============================================

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Unsupported file", description: "Only PDF files are supported.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-hidden">
      
      {/* 1. SIDEBAR PANEL */}
      <aside className="w-80 border-r border-border/50 bg-card/40 backdrop-blur-md flex flex-col h-screen relative z-20">
        
        {/* Header */}
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/classroom/dashboard")}>
            <ArrowLeft className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            <span className="font-display font-bold text-sm">Dashboard</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleCreateSession} title="New Chat">
            <Plus className="h-5 w-5 text-primary" />
          </Button>
        </div>

        {/* Tab Selection for Document Upload / Sessions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          
          {/* Document Ingestion Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upload Materials</h3>
            
            <div 
              className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all duration-300 ${
                isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".pdf" 
                onChange={handleFileSelect} 
              />
              <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs font-semibold">Drag & drop or Click</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">PDF notes, syllabus, regs (Max 10MB)</p>
            </div>

            {selectedFile && (
              <div className="bg-card border border-border/60 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                
                {/* Category select buttons */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Select Category:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setUploadCategory(cat.id)}
                        className={`text-[10px] p-1.5 rounded-lg border text-left truncate transition-colors ${
                          uploadCategory === cat.id 
                            ? "border-primary/50 bg-primary/10 text-primary font-medium" 
                            : "border-border/60 hover:bg-muted"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleUpload} 
                  disabled={uploadLoading} 
                  className="w-full text-xs h-8 rounded-lg"
                >
                  {uploadLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      Chunking & Embedding...
                    </>
                  ) : (
                    'Index Document (RAG)'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Session History List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chat History</h3>
            
            {sessionsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-2">No past sessions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sessions.map(s => {
                  const isActive = currentSession?._id === s._id;
                  return (
                    <div
                      key={s._id}
                      onClick={() => fetchSessionDetail(s._id)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                        isActive 
                          ? "bg-primary/10 border-primary/30 text-primary shadow-sm" 
                          : "bg-transparent border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="h-4 w-4 flex-shrink-0" />
                        <span className="text-xs font-medium truncate">{s.title}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteSession(s._id, e)}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded transition-opacity"
                        style={{ opacity: isActive ? 1 : undefined }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ingested Documents List */}
          <div className="space-y-2 border-t border-border/40 pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ingested Files</h3>
            {docsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />
            ) : documents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic p-1">No documents indexed yet.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
                {documents.map(doc => {
                  const cat = CATEGORIES.find(c => c.id === doc.category);
                  return (
                    <div key={doc._id} className="group relative bg-card/30 border border-border/40 rounded-xl p-2.5 flex items-start justify-between gap-2 text-left hover:border-primary/20 transition-all duration-300">
                      <div className="flex items-start gap-2 min-w-0">
                        <FileText className={`h-4.5 w-4.5 mt-0.5 flex-shrink-0 ${cat?.color || 'text-primary'}`} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold truncate text-foreground pr-4">{doc.name}</p>
                          <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full border border-border/40 inline-block mt-1 font-medium">
                            {cat?.label || doc.category}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteDocument(doc._id, e)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-opacity duration-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. CHAT PANEL */}
      <main className="flex-1 flex flex-col h-screen relative z-10 bg-gradient-to-b from-background via-background to-accent/5">
        
        {/* Header bar */}
        <header className="p-4 border-b border-border/50 bg-background/50 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
              <Brain className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sm">ClassNexus Academic Assistant</h2>
              <p className="text-[10px] text-muted-foreground">Retrieval-Augmented Intelligent Tutor (RAG)</p>
            </div>
          </div>

          {/* RAG Context Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Search Filter:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-card border border-border/60 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            >
              <option value="all">🔍 Search All Materials</option>
              <option value="notes">📘 Only Notes</option>
              <option value="syllabus">📗 Only Syllabus</option>
              <option value="questions">📙 Only Question Banks</option>
              <option value="regulations">📕 Only Regulations</option>
              <option value="placement">📓 Only Placement Guides</option>
            </select>
          </div>
        </header>

        {/* Chat Messages Scrolling Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center border border-primary/20">
                <Brain className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-xl font-bold text-foreground">Ask anything about your syllabus!</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload lecture notes, academic regulations, syllabi, or placement papers. Our assistant will extract the text, build context vectors, and answer your query using direct evidence.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 w-full pt-4">
                <Button variant="outline" onClick={() => setQuestion("What are the criteria for placement eligibility?")} className="text-xs p-4 rounded-xl text-left h-auto justify-start border-border/60 hover:bg-muted truncate">
                  <ChevronRight className="h-3 w-3 mr-1 flex-shrink-0" />
                  Placement eligibility?
                </Button>
                <Button variant="outline" onClick={() => setQuestion("Can you explain the grading system and course credits?")} className="text-xs p-4 rounded-xl text-left h-auto justify-start border-border/60 hover:bg-muted truncate">
                  <ChevronRight className="h-3 w-3 mr-1 flex-shrink-0" />
                  Grading regulations?
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {currentSession.messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm border transition-all ${
                      isUser 
                        ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-none'
                        : 'bg-card border-border/50 text-foreground rounded-tl-none'
                    }`}>
                      {/* Message Content */}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                      {/* Source attribution tags */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 border-t border-border/40 pt-2">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            Retrieved Sources:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {msg.sources.map((src, sIdx) => (
                              <span 
                                key={sIdx} 
                                className="text-[9px] bg-muted/80 text-muted-foreground border border-border/50 px-2 py-0.5 rounded-md font-medium truncate max-w-[200px]"
                                title={src}
                              >
                                {src}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Typing Loader State */}
              {queryLoading && (
                <motion.div 
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="bg-card border border-border/50 rounded-2xl rounded-tl-none p-4 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground animate-pulse">Scanning documents and synthesizing answer...</span>
                  </div>
                </motion.div>
              )}
              
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar Form */}
        <footer className="p-4 bg-background/50 border-t border-border/50">
          <form onSubmit={handleSendQuery} className="max-w-3xl mx-auto flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                documents.length === 0 
                  ? "Upload a PDF document first in the sidebar to start asking..." 
                  : "Ask about your notes, syllabus regulations, placement papers..."
              }
              className="flex-1 bg-card border border-border/60 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all text-foreground"
            />
            <Button
              type="submit"
              disabled={queryLoading || !question.trim()}
              className="h-auto px-6 rounded-2xl shadow-md hover:scale-105 transition-transform"
            >
              <Send className="h-4.5 w-4.5" />
            </Button>
          </form>
        </footer>

      </main>
    </div>
  );
};

export default AIAssistant;
