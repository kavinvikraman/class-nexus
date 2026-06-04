import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Play, Download, CheckCircle, Sparkles, BookOpen, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

// API base URL
// In production on Vercel, use relative path (proxied via vercel.json)
const API_BASE = import.meta.env.DEV 
  ? "http://localhost:3001" 
  : "";

interface Summary {
  title: string;
  bullets: string[];
  keyTopics: string[];
}

const SummaryPage = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const raw = sessionStorage.getItem("classnexus_summary");
    if (!raw) {
      navigate("/notes");
      return;
    }
    setSummary(JSON.parse(raw));
  }, [navigate]);

  const handleStartQuiz = async () => {
    setQuizLoading(true);
    try {
      const notes = sessionStorage.getItem("classnexus_notes");
      const fileBase64 = sessionStorage.getItem("classnexus_file");
      const fileMime = sessionStorage.getItem("classnexus_fileMime");
      if (!notes && !fileBase64) throw new Error("Notes not found");
      const body: Record<string, any> = { type: "quiz" };
      if (notes) body.notes = notes;
      if (fileBase64 && fileMime) {
        body.file = fileBase64;
        body.fileMimeType = fileMime;
      }
      const response = await fetch(`${API_BASE}/api/generate-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate quiz');
      if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("No quiz questions could be generated. Please make sure your notes have enough text content.");
      }
      sessionStorage.setItem("classnexus_quiz", JSON.stringify(data));
      navigate("/quiz");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate quiz", variant: "destructive" });
    } finally {
      setQuizLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!summary) return;
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(summary.title, 20, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    let y = 40;
    summary.bullets.forEach((b, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${b}`, 170);
      doc.text(lines, 20, y);
      y += lines.length * 6 + 4;
    });
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Key Topics:", 20, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(summary.keyTopics.join(", "), 20, y);
    doc.save("classnexus-revision-sheet.pdf");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  };

  if (!summary) return null;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-b from-background via-background to-accent/10">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -left-32 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <motion.header
        className="px-6 py-5 flex items-center gap-2.5 max-w-4xl mx-auto w-full relative z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => navigate("/")}>
          <div className="relative">
            <Brain className="h-7 w-7 text-primary transition-transform group-hover:scale-110" />
            <Sparkles className="h-3 w-3 text-primary absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">ClassNexus</span>
        </div>
      </motion.header>

      <main className="flex-1 px-6 pb-12 relative z-10">
        <motion.div
          className="max-w-3xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="mb-8">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-3 py-1.5 rounded-full text-sm font-medium mb-4 backdrop-blur-sm">
              <BookOpen className="h-3.5 w-3.5" />
              Step 2 of 3
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">
              <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {summary.title}
              </span>
            </h1>
            <p className="text-muted-foreground text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Your smart summary — <strong className="text-foreground">{summary.bullets.length} key points</strong>
            </p>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 space-y-4 mb-8 shadow-lg shadow-primary/5"
          >
            {summary.bullets.map((b, i) => (
              <motion.div
                key={i}
                className="flex gap-4 items-start group"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 + 0.2 }}
              >
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-foreground leading-relaxed pt-0.5">{b}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={itemVariants} className="mb-10">
            <p className="text-sm text-muted-foreground mb-3 font-medium">Key topics covered:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {summary.keyTopics.map((t, i) => (
                <motion.span
                  key={t}
                  className="bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 text-primary px-4 py-2 rounded-full text-sm font-medium hover:scale-105 transition-transform cursor-default"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 + 0.4 }}
                >
                  {t}
                </motion.span>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="flex gap-4 flex-wrap">
            <Button
              onClick={handleStartQuiz}
              disabled={quizLoading}
              size="lg"
              className="gap-2 font-display font-semibold rounded-xl px-8 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-105 transition-all duration-300 disabled:shadow-none disabled:hover:scale-100"
            >
              {quizLoading ? (
                <>
                  <span className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Generating Quiz…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Start Quiz
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleDownloadPDF}
              className="gap-2 font-display rounded-xl hover:scale-105 transition-all duration-300"
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </motion.div>

          <AnimatePresence>
            {quizLoading && (
              <motion.div
                className="mt-10 flex flex-col items-center gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="relative w-64">
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary via-purple-500 to-primary rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 15, ease: "linear" }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Brain className="h-4 w-4 text-primary animate-pulse" />
                  <p className="animate-pulse">AI is generating your quiz…</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default SummaryPage;
