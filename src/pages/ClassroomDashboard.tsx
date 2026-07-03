import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, Sparkles, Users, Play, Trophy, ArrowRight, Clock, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getLeaderboard, LeaderboardEntry } from "@/lib/classroomApi";

// API base URL - relative path in production for Vercel proxy
const API_BASE = import.meta.env.DEV 
  ? "http://localhost:3001" 
  : "";

const ClassroomDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [classroomCode, setClassroomCode] = useState<string | null>(null);
  const [classroomName, setClassroomName] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] = useState(false);

  useEffect(() => {
    const code = sessionStorage.getItem("kai_classroom_code");
    const name = sessionStorage.getItem("kai_classroom_name");
    const student = sessionStorage.getItem("kai_student_name");
    const teacher = sessionStorage.getItem("kai_is_teacher") === "true";
    
    if (!code) {
      navigate("/classroom");
      return;
    }
    
    setClassroomCode(code);
    setClassroomName(name);
    setStudentName(student);
    setIsTeacher(teacher);
    
    fetchLeaderboard(code);
  }, [navigate]);

  const fetchLeaderboard = async (code: string) => {
    try {
      const result = await getLeaderboard(code);
      setLeaderboard(result.leaderboard);
    } catch (error: any) {
      console.log("No leaderboard data yet");
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuiz = async () => {
    // Check if user has notes in session
    const existingNotes = sessionStorage.getItem("classnexus_notes");
    const existingQuiz = sessionStorage.getItem("classnexus_quiz");
    
    if (existingQuiz) {
      // Quiz already exists, go to classroom quiz
      navigate("/classroom/quiz");
      return;
    }
    
    if (!existingNotes) {
      toast({ 
        title: "No Study Material", 
        description: "Please add study notes first before taking a quiz.", 
        variant: "destructive" 
      });
      navigate("/notes");
      return;
    }
    
    // Generate quiz from existing notes
    setQuizLoading(true);
    try {
      const notes = sessionStorage.getItem("classnexus_notes");
      const fileBase64 = sessionStorage.getItem("classnexus_file");
      const fileMime = sessionStorage.getItem("classnexus_fileMime");
      
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
      
      sessionStorage.setItem("classnexus_quiz", JSON.stringify(data));
      navigate("/classroom/quiz");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate quiz", variant: "destructive" });
    } finally {
      setQuizLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-accent/10">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-b from-background via-background to-accent/10">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -left-32 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <motion.header
        className="px-6 py-5 flex items-center justify-between max-w-4xl mx-auto w-full relative z-10"
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
        <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 text-purple-500 px-3 py-1.5 rounded-full text-sm font-medium">
          <Users className="h-4 w-4" />
          {classroomCode}
        </div>
      </motion.header>

      <main className="flex-1 px-6 pb-12 relative z-10">
        <motion.div
          className="max-w-3xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Welcome Card */}
          <motion.div
            variants={itemVariants}
            className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-3xl p-8 mb-8 shadow-xl shadow-primary/5"
          >
            <div className="text-center">
              <h1 className="font-display text-3xl font-bold mb-2">
                <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                  {classroomName}
                </span>
              </h1>
              <p className="text-muted-foreground mb-6">
                {isTeacher ? "You are the teacher of this classroom" : `Welcome, ${studentName}!`}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-center">
                  <Users className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{leaderboard.length}</p>
                  <p className="text-xs text-muted-foreground">Participants</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 text-center">
                  <Trophy className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">
                    {leaderboard[0]?.score || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Top Score</p>
                </div>
              </div>

              <div className="flex gap-4 justify-center flex-wrap">
                <Button
                  onClick={() => navigate("/ai-assistant")}
                  variant="outline"
                  size="lg"
                  className="gap-2 font-display rounded-xl border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 hover:scale-105 transition-all duration-300"
                >
                  <Brain className="h-4 w-4 text-purple-500" />
                  AI Assistant (RAG)
                </Button>
                {!isTeacher && (
                  <>
                    <Button
                      onClick={() => navigate("/notes")}
                      variant="outline"
                      size="lg"
                      className="gap-2 font-display rounded-xl hover:scale-105 transition-all duration-300"
                    >
                      <FileText className="h-4 w-4" />
                      Add Notes
                    </Button>
                    <Button
                      onClick={handleStartQuiz}
                      disabled={quizLoading}
                      size="lg"
                      className="gap-2 font-display font-semibold rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-105 transition-all duration-300"
                    >
                      {quizLoading ? (
                        <>
                          <span className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Start Quiz
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>

          {/* Leaderboard */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-display text-xl font-semibold text-foreground">Leaderboard</h2>
            </div>
            
            {leaderboard.length > 0 ? (
              <div className="space-y-3">
                {leaderboard.map((entry, index) => {
                  const isCurrentUser = entry.name.toLowerCase() === studentName?.toLowerCase();
                  const medalColors = ["text-amber-500", "text-gray-400", "text-amber-700"];
                  
                  return (
                    <motion.div
                      key={entry.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                        isCurrentUser
                          ? "bg-primary/10 border-primary/30"
                          : "bg-card/50 border-border/50 hover:border-primary/20"
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${
                        index < 3 
                          ? `bg-gradient-to-br from-amber-500/20 to-yellow-500/20 ${medalColors[index]}`
                          : "bg-muted/50 text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isCurrentUser ? "text-primary" : "text-foreground"}`}>
                          {entry.name}
                          {isCurrentUser && <span className="text-xs text-muted-foreground ml-2">(You)</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-foreground">{entry.score}</p>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-card/30 border border-border/30 rounded-2xl p-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No quiz attempts yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Be the first to complete the quiz!</p>
              </div>
            )}
          </motion.div>

          {/* Refresh Button */}
          <motion.div variants={itemVariants} className="mt-8 text-center">
            <Button
              variant="ghost"
              onClick={() => classroomCode && fetchLeaderboard(classroomCode)}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4 rotate-90" />
              Refresh Leaderboard
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default ClassroomDashboard;
