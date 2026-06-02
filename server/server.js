/**
 * ClassNexus - Classroom Mode Backend Server
 * Express server with in-memory storage for classroom management
 * Also serves the React frontend in production
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });

// Also force-apply GEMINI_API_KEY from the file in case the parent process has it set
try {
  const fs = require('fs');
  const p = require('path').join(__dirname, '.env');
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(/^GEMINI_API_KEY=(.*)$/m);
  if (m && m[1]) {
    const val = m[1].trim().replace(/^"|"$/g, '');
    // log masked file value for debugging
    const maskedFile = val.length > 8 ? `${val.slice(0,4)}...${val.slice(-4)}` : '****';
    console.log(`GEMINI_API_KEY from file: ${maskedFile}`);
    process.env.GEMINI_API_KEY = val;
  }
} catch (e) {
  // ignore
}

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import auth routes
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Log masked GEMINI key so we can confirm which key is being used at runtime
const rawGeminiKey = process.env.GEMINI_API_KEY || '';
if (rawGeminiKey) {
  const masked = rawGeminiKey.length > 8 ? `${rawGeminiKey.slice(0,4)}...${rawGeminiKey.slice(-4)}` : '****';
  console.log(`Using GEMINI_API_KEY: ${masked}`);
} else {
  console.log('No GEMINI_API_KEY found in environment');
}

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// Authentication routes
app.use('/api/auth', authRoutes);

// Serve static files from the React app build
app.use(express.static(path.join(__dirname, '../dist')));

// ============================================
// IN-MEMORY STORAGE
// ============================================

/**
 * Classroom data structure:
 * {
 *   "AB12CD": {
 *     name: "CS Department",
 *     students: [
 *       { name: "Kavin", score: 0 }
 *     ]
 *   }
 * }
 */
const classrooms = {};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a random 6-character uppercase alphanumeric code
 * @returns {string} Unique classroom code
 */
function generateClassroomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  // Ensure code is unique
  if (classrooms[code]) {
    return generateClassroomCode();
  }
  return code;
}

// ============================================
// API ROUTES
// ============================================

/**
 * POST /create-classroom
 * Create a new classroom with a unique code
 * Body: { className: "CS Department" }
 * Response: { code: "AB12CD", name: "CS Department" }
 */
app.post('/create-classroom', (req, res) => {
  try {
    const { className } = req.body;

    // Validate input
    if (!className || className.trim() === '') {
      return res.status(400).json({ error: 'Classroom name is required' });
    }

    // Generate unique code
    const code = generateClassroomCode();

    // Create classroom
    classrooms[code] = {
      name: className.trim(),
      students: [],
      createdAt: new Date().toISOString()
    };

    console.log(`✅ Classroom created: ${code} - ${className}`);

    res.status(201).json({
      code,
      name: classrooms[code].name
    });
  } catch (error) {
    console.error('Error creating classroom:', error);
    res.status(500).json({ error: 'Failed to create classroom' });
  }
});

/**
 * POST /join-classroom
 * Student joins a classroom using the code
 * Body: { code: "AB12CD", studentName: "Kavin" }
 * Response: { success: true, classroom: "CS Department" }
 */
app.post('/join-classroom', (req, res) => {
  try {
    const { code, studentName } = req.body;

    // Validate input
    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Classroom code is required' });
    }
    if (!studentName || studentName.trim() === '') {
      return res.status(400).json({ error: 'Student name is required' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = studentName.trim();

    // Check if classroom exists
    if (!classrooms[normalizedCode]) {
      return res.status(404).json({ error: 'Classroom not found. Please check the code.' });
    }

    // Check if student already joined
    const existingStudent = classrooms[normalizedCode].students.find(
      s => s.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (existingStudent) {
      // Student already exists, return success (allow rejoining)
      return res.json({
        success: true,
        classroom: classrooms[normalizedCode].name,
        message: 'Welcome back!'
      });
    }

    // Add student to classroom
    classrooms[normalizedCode].students.push({
      name: normalizedName,
      score: 0,
      joinedAt: new Date().toISOString()
    });

    console.log(`✅ Student joined: ${normalizedName} -> ${normalizedCode}`);

    res.json({
      success: true,
      classroom: classrooms[normalizedCode].name,
      message: 'Successfully joined classroom!'
    });
  } catch (error) {
    console.error('Error joining classroom:', error);
    res.status(500).json({ error: 'Failed to join classroom' });
  }
});

/**
 * POST /submit-quiz
 * Submit quiz score for a student
 * Body: { code: "AB12CD", studentName: "Kavin", score: 8 }
 * Response: { success: true, rank: 1 }
 */
app.post('/submit-quiz', (req, res) => {
  try {
    const { code, studentName, score } = req.body;

    // Validate input
    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Classroom code is required' });
    }
    if (!studentName || studentName.trim() === '') {
      return res.status(400).json({ error: 'Student name is required' });
    }
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Valid score is required' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = studentName.trim();

    // Check if classroom exists
    if (!classrooms[normalizedCode]) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    // Find student
    const student = classrooms[normalizedCode].students.find(
      s => s.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found in this classroom. Please join first.' });
    }

    // Update score (keep highest score)
    student.score = Math.max(student.score, score);
    student.lastAttempt = new Date().toISOString();

    // Calculate rank
    const sortedStudents = [...classrooms[normalizedCode].students].sort((a, b) => b.score - a.score);
    const rank = sortedStudents.findIndex(s => s.name === student.name) + 1;

    console.log(`✅ Quiz submitted: ${normalizedName} scored ${score} (Rank: ${rank})`);

    res.json({
      success: true,
      score: student.score,
      rank,
      totalStudents: sortedStudents.length
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

/**
 * GET /leaderboard/:code
 * Get leaderboard for a classroom
 * Response: [{ name: "Kavin", score: 8 }, ...]
 */
app.get('/leaderboard/:code', (req, res) => {
  try {
    const normalizedCode = req.params.code.trim().toUpperCase();

    // Check if classroom exists
    if (!classrooms[normalizedCode]) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    // Sort students by score (highest first)
    const leaderboard = classrooms[normalizedCode].students
      .map(s => ({ name: s.name, score: s.score }))
      .sort((a, b) => b.score - a.score);

    res.json({
      classroom: classrooms[normalizedCode].name,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /classroom/:code
 * Get classroom details
 */
app.get('/classroom/:code', (req, res) => {
  try {
    const normalizedCode = req.params.code.trim().toUpperCase();

    if (!classrooms[normalizedCode]) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    res.json({
      code: normalizedCode,
      name: classrooms[normalizedCode].name,
      studentCount: classrooms[normalizedCode].students.length
    });
  } catch (error) {
    console.error('Error fetching classroom:', error);
    res.status(500).json({ error: 'Failed to fetch classroom' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// AI GENERATE NOTES ENDPOINT
// ============================================

/**
 * POST /api/generate-notes
 * Generate summary or quiz from notes using Google Gemini API
 * Body: { type: "summary" | "quiz", notes: "...", file?: base64, fileMimeType?: string }
 */
app.post('/api/generate-notes', async (req, res) => {
  try {
    const { type, notes, file, fileMimeType } = req.body;
    
    if (!type || !['summary', 'quiz'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use "summary" or "quiz"' });
    }
    
    if (!notes && !file) {
      return res.status(400).json({ error: 'Please provide notes or a file' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    // If no API key or placeholder, return mock data for development
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.log('⚠️ No valid GEMINI_API_KEY set, returning mock data');
      console.log('ℹ️ To enable AI: Add your key to server/.env file');
      
      if (type === 'summary') {
        return res.json({
          title: "Study Notes Summary",
          bullets: [
            "Key concept 1: Understanding the fundamentals of the topic",
            "Key concept 2: Important terminology and definitions",
            "Key concept 3: Core principles and their applications",
            "Key concept 4: Common patterns and best practices",
            "Key concept 5: Real-world examples and use cases",
            "Key concept 6: Critical analysis and evaluation methods",
            "Key concept 7: Connections to related topics",
            "Key concept 8: Summary of main takeaways"
          ],
          keyTopics: ["Fundamentals", "Applications", "Best Practices"]
        });
      } else {
        return res.json({
          questions: [
            { question: "What is the primary purpose of this concept?", options: ["Option A", "Option B", "Option C", "Option D"], correctIndex: 0, topic: "Fundamentals" },
            { question: "Which of the following best describes the key principle?", options: ["Principle 1", "Principle 2", "Principle 3", "Principle 4"], correctIndex: 1, topic: "Principles" },
            { question: "In what scenario would you apply this concept?", options: ["Scenario A", "Scenario B", "Scenario C", "Scenario D"], correctIndex: 2, topic: "Applications" },
            { question: "What is the relationship between these elements?", options: ["Direct", "Inverse", "Independent", "Correlated"], correctIndex: 0, topic: "Relationships" },
            { question: "Which method is most effective for this purpose?", options: ["Method 1", "Method 2", "Method 3", "Method 4"], correctIndex: 3, topic: "Methods" },
            { question: "What is a common misconception about this topic?", options: ["Misconception A", "Misconception B", "Misconception C", "All of the above"], correctIndex: 1, topic: "Common Errors" },
            { question: "How does this concept impact the overall system?", options: ["Positively", "Negatively", "No impact", "Depends on context"], correctIndex: 3, topic: "Impact" },
            { question: "What prerequisite knowledge is required?", options: ["Basic math", "Programming", "Statistics", "None"], correctIndex: 2, topic: "Prerequisites" },
            { question: "Which tool is best suited for this application?", options: ["Tool A", "Tool B", "Tool C", "Tool D"], correctIndex: 0, topic: "Tools" },
            { question: "What is the expected outcome of applying this principle?", options: ["Outcome A", "Outcome B", "Outcome C", "Outcome D"], correctIndex: 1, topic: "Outcomes" }
          ]
        });
      }
    }

    // Build prompt for Gemini
    let prompt = '';
    
    if (type === 'summary') {
      prompt = `You are a study assistant. Analyze the student's notes provided below and create a concise, accurate summary.

IMPORTANT: Generate content based ONLY on the actual notes provided. Do NOT make up or add generic content.

Return your response as valid JSON with this exact structure:
{
  "title": "A specific title based on the actual topic of the notes",
  "bullets": ["bullet 1", "bullet 2", ...],
  "keyTopics": ["topic1", "topic2", ...]
}

Rules:
- bullets: Create exactly 8-10 bullet points capturing key concepts FROM the notes
- keyTopics: Extract 3-5 actual topic names from the notes
- Everything must come directly from the provided material

Here are the student's notes to analyze:

${notes}

Return ONLY the JSON object, no other text.`;
    } else {
      prompt = `You are a quiz generator for students. Analyze the study notes provided below and generate EXACTLY 10 multiple-choice questions.

CRITICAL RULES:
1. Every question MUST be directly answerable from the provided notes
2. Questions should test understanding of the ACTUAL concepts in the notes
3. Do NOT create generic or made-up questions
4. Each question must have exactly 4 options with exactly ONE correct answer
5. Correct answers must be based on facts FROM the notes

Return your response as valid JSON with this exact structure:
{
  "questions": [
    {
      "question": "A specific question about the notes content",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "topic": "Actual topic from notes"
    }
  ]
}

Here are the student's notes to analyze:

${notes}

Generate exactly 10 questions based ONLY on the content above. Return ONLY the JSON object, no other text.`;
    }

    // Build request parts for Gemini
    const parts = [];
    
    // Add file if provided (for multimodal)
    if (file && fileMimeType) {
      parts.push({
        inlineData: {
          mimeType: fileMimeType,
          data: file
        }
      });
      parts.push({
        text: notes 
          ? `Additional context from notes:\n${notes}\n\n${prompt}`
          : prompt
      });
    } else {
      parts.push({ text: prompt });
    }

    // Call Google Gemini API (debug mode) - parse and log raw provider response
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      })
    };

    const response = await fetch(url, options);
    const data = await response.json();

    console.log('Gemini provider Status:', response.status);
    console.log('Gemini provider Response:', JSON.stringify(data, null, 2));

    // Return the raw provider response for debugging (temporary)
    return res.status(response.status >= 200 && response.status < 300 ? 200 : response.status).json(data);
    
  } catch (error) {
    console.error('Error generating notes:', error);
    res.status(500).json({ error: 'Failed to generate content: ' + error.message });
  }
});

// ============================================
// SERVE REACT FRONTEND (Catch-all for SPA routing)
// ============================================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     🎓 ClassNexus Server Running                ║
║     http://localhost:${PORT}                        ║
║     Frontend + API served from same origin      ║
╚══════════════════════════════════════════════════╝
  `);
});
