import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Brain, Zap, Sparkles, ArrowRight, Users, LogIn, MessageSquare, Send, X, FileText, Loader2 } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { isAuthenticated, getUser } from "@/services/authApi";

// API base URL - relative in production, localhost in development
const API_BASE = import.meta.env.DEV 
  ? "http://localhost:3001" 
  : "";

const Landing = () => {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const user = getUser();

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; sources?: string[] }>>([
    { role: 'assistant', content: "Hi! I am the ClassNexus AI Assistant. Ask me anything based on the uploaded notes, syllabus, question banks, or regulations!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId] = useState(() => 'session_landing_' + Math.random().toString(36).substring(2, 9));

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question: userMessage
        })
      });

      const data = await response.json();
      if (response.ok && data.content) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.content, 
          sources: data.sources 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Sorry, I encountered an error. Please make sure the backend server is running." 
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Network error. Please make sure the backend server is running." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  const features = [
    {
      icon: BookOpen,
      title: "Smart Summaries",
      desc: "Get 8–10 key bullet points from your notes instantly.",
      gradient: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-500",
    },
    {
      icon: Brain,
      title: "AI Quizzes",
      desc: "10 MCQ questions generated from your content.",
      gradient: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-500",
    },
    {
      icon: Zap,
      title: "Instant Feedback",
      desc: "See your score, weak topics, and improvement tips.",
      gradient: "from-amber-500/20 to-orange-500/20",
      iconColor: "text-amber-500",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-b from-background via-background to-accent/20">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <motion.header 
        className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full relative z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2.5 group cursor-pointer">
          <div className="relative">
            <Brain className="h-8 w-8 text-primary transition-transform group-hover:scale-110" />
            <Sparkles className="h-3 w-3 text-primary absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-display text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            ClassNexus
          </span>
        </div>
        
        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              <span className="text-sm text-muted-foreground hidden sm:block">
                Hi, {user?.name?.split(' ')[0]}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => navigate("/ai-assistant")}
              >
                AI Assistant (RAG)
              </Button>
              <Button
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => navigate("/notes")}
              >
                Go to App
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => navigate("/login")}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Log In
              </Button>
              <Button
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => navigate("/signup")}
              >
                Sign Up
              </Button>
            </>
          )}
        </div>
      </motion.header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-4 py-2 rounded-full text-sm font-medium mb-8 backdrop-blur-sm">
              <Sparkles className="h-4 w-4" />
              AI-Powered Study Tool
            </div>
          </motion.div>

          <motion.h1 
            className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-8"
            variants={itemVariants}
          >
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              Turn your notes into
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary via-primary to-purple-500 bg-clip-text text-transparent">
              exam-ready
            </span>
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              {" "}material
            </span>
          </motion.h1>

          <motion.p 
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed"
            variants={itemVariants}
          >
            Paste your study notes and instantly get smart summaries, quizzes, and
            personalized feedback to ace your exams.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="text-lg px-10 py-7 rounded-2xl font-display font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all duration-300 group"
              onClick={() => navigate(authenticated ? "/notes" : "/signup")}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-10 py-7 rounded-2xl font-display font-semibold hover:scale-105 transition-all duration-300 group border-primary/40 hover:border-primary/60 hover:bg-primary/5 shadow-md shadow-primary/5"
              onClick={() => navigate(authenticated ? "/ai-assistant" : "/signup")}
            >
              <Sparkles className="mr-2 h-5 w-5 text-primary animate-pulse" />
              AI Assistant (RAG)
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-10 py-7 rounded-2xl font-display font-semibold hover:scale-105 transition-all duration-300 group border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/10"
              onClick={() => navigate(authenticated ? "/classroom" : "/login")}
            >
              <Users className="mr-2 h-5 w-5 text-purple-500" />
              Classroom Mode
            </Button>
          </motion.div>

          {/* Features */}
          <motion.div
            className="grid md:grid-cols-3 gap-6 mt-24"
            variants={containerVariants}
          >
            {features.map((f, i) => (
              <motion.div
                key={i}
                className={`group relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-7 text-left hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 cursor-default`}
                variants={itemVariants}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative z-10">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <f.icon className={`h-6 w-6 ${f.iconColor}`} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-3">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </main>

      {/* Floating Chatbot Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        {/* Toggle Button */}
        <motion.button
          onClick={() => setChatOpen(!chatOpen)}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-primary to-purple-600 shadow-xl flex items-center justify-center cursor-pointer text-primary-foreground hover:scale-110 active:scale-95 transition-transform duration-200"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          {chatOpen ? <X className="h-6 w-6 text-white" /> : <MessageSquare className="h-6 w-6 text-white" />}
        </motion.button>

        {/* Chat Window */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute bottom-16 right-0 w-[320px] sm:w-[380px] h-[480px] bg-background/95 border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-md"
            >
              {/* Header */}
              <div className="p-4 bg-gradient-to-r from-primary/10 to-purple-500/10 border-b border-border/60 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-semibold text-foreground">ClassNexus AI Assistant</h4>
                  <p className="text-[9px] text-muted-foreground">Retrieval-Augmented Generation (RAG)</p>
                </div>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin text-left">
                {messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground text-left' 
                          : 'bg-muted border border-border/50 text-foreground text-left'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                        {msg.sources.map((src, sIdx) => (
                          <div 
                            key={sIdx} 
                            className="inline-flex items-center gap-1 text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-medium"
                          >
                            <FileText className="h-2.5 w-2.5" />
                            {src}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-[10px] p-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-border/60 flex items-center gap-2 bg-muted/20">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-background/50 border border-border/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  disabled={loading}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                  disabled={loading || !input.trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Landing;
