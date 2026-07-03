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
// Undici Agent for IPv4 fallback
let UndiciAgent;
try {
  UndiciAgent = require('undici').Agent;
} catch (e) {
  UndiciAgent = null;
}

// Optional PDF parsing for uploaded PDFs
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  pdfParse = null;
}

// Import auth routes
const authRoutes = require('./routes/auth');
// Import RAG routes and service
const ragRoutes = require('./routes/rag');
const ragService = require('./services/ragService');

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
// RAG Academic Assistant routes
app.use('/api/rag', ragRoutes);

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

function getFallbackAIResponse(type) {
  if (type === 'summary') {
    return {
      title: 'Study Notes Summary',
      bullets: [
        'Key concept 1: Understanding the fundamentals of the topic',
        'Key concept 2: Important terminology and definitions',
        'Key concept 3: Core principles and their applications',
        'Key concept 4: Common patterns and best practices',
        'Key concept 5: Real-world examples and use cases',
        'Key concept 6: Critical analysis and evaluation methods',
        'Key concept 7: Connections to related topics',
        'Key concept 8: Summary of main takeaways'
      ],
      keyTopics: ['Fundamentals', 'Applications', 'Best Practices']
    };
  }

  return {
    questions: [
      { question: 'What is the primary purpose of this concept?', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0, topic: 'Fundamentals' },
      { question: 'Which of the following best describes the key principle?', options: ['Principle 1', 'Principle 2', 'Principle 3', 'Principle 4'], correctIndex: 1, topic: 'Principles' },
      { question: 'In what scenario would you apply this concept?', options: ['Scenario A', 'Scenario B', 'Scenario C', 'Scenario D'], correctIndex: 2, topic: 'Applications' },
      { question: 'What is the relationship between these elements?', options: ['Direct', 'Inverse', 'Independent', 'Correlated'], correctIndex: 0, topic: 'Relationships' },
      { question: 'Which method is most effective for this purpose?', options: ['Method 1', 'Method 2', 'Method 3', 'Method 4'], correctIndex: 3, topic: 'Methods' },
      { question: 'What is a common misconception about this topic?', options: ['Misconception A', 'Misconception B', 'Misconception C', 'All of the above'], correctIndex: 1, topic: 'Common Errors' },
      { question: 'How does this concept impact the overall system?', options: ['Positively', 'Negatively', 'No impact', 'Depends on context'], correctIndex: 3, topic: 'Impact' },
      { question: 'What prerequisite knowledge is required?', options: ['Basic math', 'Programming', 'Statistics', 'None'], correctIndex: 2, topic: 'Prerequisites' },
      { question: 'Which tool is best suited for this application?', options: ['Tool A', 'Tool B', 'Tool C', 'Tool D'], correctIndex: 0, topic: 'Tools' },
      { question: 'What is the expected outcome of applying this principle?', options: ['Outcome A', 'Outcome B', 'Outcome C', 'Outcome D'], correctIndex: 1, topic: 'Outcomes' }
    ]
  };
}

// Simple local extractive summarizer (works offline when Gemini is unavailable)
function summarizeText(text, bulletsCount = 8) {
  if (!text || typeof text !== 'string') {
    return { title: 'Summary', bullets: [], keyTopics: [] };
  }

  // Split into sentences
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Tokenize and compute word frequencies
  const stopwords = new Set(['the','and','is','in','to','of','a','an','for','on','with','that','this','these','those','are','as','by','from','or','be','which','it','at','we','can','has','have']);
  const freq = Object.create(null);
  const tokens = [];
  for (const s of sentences) {
    const words = s.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (w.length <= 2 || stopwords.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
      tokens.push(w);
    }
  }

  // Score sentences by sum of token frequencies
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);
    let score = 0;
    for (const w of words) {
      if (freq[w]) score += freq[w];
    }
    return { i, sentence: s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top sentences for bullets, preserve original order
  const top = scored.slice(0, Math.min(bulletsCount, scored.length)).sort((a, b) => a.i - b.i).map(s => s.sentence);

  // Key topics: top frequent tokens
  const topics = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 5);

  // Title: first non-empty line or first 6 words
  const title = (text.split('\n').find(l => l.trim()) || sentences[0] || '').split(' ').slice(0, 6).join(' ').replace(/[.?!]$/,'') || 'Study Summary';

  return {
    title: title.length > 60 ? title.slice(0, 57) + '...' : title,
    bullets: top.map(s => s.length > 200 ? s.slice(0,197) + '...' : s),
    keyTopics: topics
  };
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
 * Generate quiz questions locally from text (offline mode)
 * Uses simple NLP to extract key concepts and create questions
 */
function generateQuizFromText(text, questionsCount = 10) {
  if (!text || typeof text !== 'string') {
    return { questions: [] };
  }

  // Split into sentences
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  if (sentences.length < 3) {
    return { questions: [] };
  }

  // Extract key phrases and concepts
  const stopwords = new Set(['the','and','is','in','to','of','a','an','for','on','with','that','this','these','those','are','as','by','from','or','be','which','it','at','we','can','has','have','what','which','when','where','why','how']);
  const concepts = [];
  
  for (const sentence of sentences) {
    const words = sentence.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
    concepts.push(...words);
  }

  // Get unique key terms
  const freq = {};
  for (const c of concepts) {
    freq[c] = (freq[c] || 0) + 1;
  }
  
  const keyTerms = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, Math.min(15, Object.keys(freq).length));

  // Generate questions from sentences
  const questions = [];
  const usedSentences = new Set();

  for (let i = 0; i < Math.min(questionsCount, sentences.length); i++) {
    const sentenceIndex = Math.floor((i / questionsCount) * sentences.length);
    if (usedSentences.has(sentenceIndex)) continue;
    usedSentences.add(sentenceIndex);

    const sentence = sentences[sentenceIndex];
    const words = sentence.split(/\s+/).filter(w => w.length > 3);
    
    // Create question from sentence
    if (words.length > 5) {
      const keyWord = words[Math.floor(Math.random() * words.length)];
      const topic = keyTerms[i % keyTerms.length] || 'General';
      
      questions.push({
        question: sentence.length > 120 ? sentence.slice(0, 117) + '...' : sentence,
        options: [
          words[0] || 'Option A',
          words[Math.min(2, words.length - 1)] || 'Option B',
          keyTerms[(i + 1) % keyTerms.length] || 'Option C',
          keyTerms[(i + 2) % keyTerms.length] || 'Option D'
        ],
        correctIndex: Math.floor(Math.random() * 4),
        topic: topic
      });
    }
  }

  // Ensure we have at least some questions
  if (questions.length === 0) {
    return { questions: [] };
  }

  return { questions: questions.slice(0, questionsCount) };
}

/**
 * POST /api/generate-notes
 * Generate summary or quiz from notes using Google Gemini API
 * Body: { type: "summary" | "quiz", notes: "...", file?: base64, fileMimeType?: string }
 */
app.post('/api/generate-notes', async (req, res) => {
  try {
    let { type, notes, file, fileMimeType } = req.body;

    // Debug: log received file metadata
    try {
      console.log('Received generate request:', { type, hasFile: !!file, fileMimeType: fileMimeType || null, fileBase64Length: file ? file.length : 0, pdfParseAvailable: !!pdfParse });
    } catch (e) {
      // ignore logging errors
    }

    // If a PDF file was uploaded (base64), try to extract text server-side
    let effectiveNotes = notes || '';
    if (file && fileMimeType && fileMimeType.toLowerCase().includes('pdf')) {
      if (pdfParse) {
        try {
          const pdfBuffer = Buffer.from(file, 'base64');
          // Support both function-based imports and class-based imports (e.g. mehmet-kozan/pdf-parse class PDFParse)
          let parsed;
          if (typeof pdfParse === 'function') {
            parsed = await pdfParse(pdfBuffer);
          } else if (pdfParse && typeof pdfParse.PDFParse === 'function') {
            const parserInstance = new pdfParse.PDFParse({ data: pdfBuffer });
            parsed = await parserInstance.getText();
          } else if (pdfParse && typeof pdfParse.default === 'function') {
            parsed = await pdfParse.default(pdfBuffer);
          } else {
            throw new Error('pdf-parse export not callable or instantiable');
          }
          const extracted = (parsed && parsed.text) ? parsed.text.trim() : '';
          if (extracted) {
            effectiveNotes = (effectiveNotes ? effectiveNotes + '\n\n' : '') + extracted;
            console.log('✅ Extracted text from uploaded PDF, length:', extracted.length);
          } else {
            console.warn('PDF parsed but no text extracted');
          }
        } catch (err) {
          console.warn('Failed to parse uploaded PDF:', err && err.message ? err.message : err);
        }
      } else {
        console.warn('pdf-parse not installed — PDF uploads will be sent raw');
      }
    }
    
    if (!type || !['summary', 'quiz'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use "summary" or "quiz"' });
    }
    
    if (!notes && !file) {
      return res.status(400).json({ error: 'Please provide notes or a file' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    // If no API key or placeholder, try local summarizer first
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.log('⚠️ No valid GEMINI_API_KEY set, using local summarizer');
      console.log('ℹ️ To enable AI: Add your key to server/.env file');
      if (effectiveNotes && effectiveNotes.trim().length > 0) {
        if (type === 'summary') {
          return res.json(summarizeText(effectiveNotes, 8));
        } else {
          // For quiz, generate simple questions from the text
          return res.json(generateQuizFromText(effectiveNotes));
        }
      }
      return res.json(getFallbackAIResponse(type));
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

${effectiveNotes}

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

${effectiveNotes}

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

    // Try primary fetch
    let response;
    let data;
    try {
      response = await fetch(url, options);
      data = await response.json();

      if (!response.ok) {
        console.warn(`Gemini returned ${response.status}; falling back to local content`);
        console.log('Gemini provider Response:', JSON.stringify(data, null, 2));
        if (type === 'summary' && effectiveNotes && effectiveNotes.trim().length > 0) {
          console.log('Using local summarizer due to Gemini non-2xx response');
          return res.status(200).json(summarizeText(effectiveNotes, 8));
        } else if (type === 'quiz' && effectiveNotes && effectiveNotes.trim().length > 0) {
          console.log('Using local quiz generator due to Gemini non-2xx response');
          return res.status(200).json(generateQuizFromText(effectiveNotes));
        }
        return res.status(200).json(getFallbackAIResponse(type));
      }
    } catch (err) {
      // If connect timeout, retry forcing IPv4 if available
      const code = err && err.cause && err.cause.code;
      console.warn('Primary fetch failed:', code || err.message);
      if (code === 'UND_ERR_CONNECT_TIMEOUT' && UndiciAgent) {
        console.log('Connect timeout detected — retrying with IPv4-only Agent');
        const agent = new UndiciAgent({ connect: { family: 4 } });
        const retryOptions = Object.assign({}, options, { dispatcher: agent });
        response = await fetch(url, retryOptions);
        data = await response.json();
      } else {
        console.warn('Gemini unavailable, returning fallback response instead:', err.message);
        if (type === 'summary' && effectiveNotes && effectiveNotes.trim().length > 0) {
          console.log('Using local summarizer due to Gemini fetch error');
          return res.status(200).json(summarizeText(effectiveNotes, 8));
        } else if (type === 'quiz' && effectiveNotes && effectiveNotes.trim().length > 0) {
          console.log('Using local quiz generator due to Gemini fetch error');
          return res.status(200).json(generateQuizFromText(effectiveNotes));
        }
        return res.status(200).json(getFallbackAIResponse(type));
      }
    }

    console.log('Gemini provider Status:', response.status);
    console.log('Gemini provider Response:', JSON.stringify(data, null, 2));

    // If provider returned non-2xx, fall back to local summarizer when possible
    if (!(response.status >= 200 && response.status < 300)) {
      if (type === 'summary' && effectiveNotes && effectiveNotes.trim().length > 0) {
        console.log('Using local summarizer due to Gemini non-2xx final response');
        return res.status(200).json(summarizeText(effectiveNotes, 8));
      } else if (type === 'quiz' && effectiveNotes && effectiveNotes.trim().length > 0) {
        console.log('Using local quiz generator due to Gemini non-2xx final response');
        return res.status(200).json(generateQuizFromText(effectiveNotes));
      }
      return res.status(200).json(getFallbackAIResponse(type));
    }

    // Extract the actual content from Gemini's response structure
    try {
      if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
        const textContent = data.candidates[0].content.parts[0].text;
        if (textContent) {
          const parsedContent = JSON.parse(textContent);
          console.log(`✅ Successfully extracted and parsed ${type} from Gemini response`);
          return res.status(200).json(parsedContent);
        }
      }
      console.warn('Failed to extract content from Gemini response structure');
      return res.status(200).json(getFallbackAIResponse(type));
    } catch (parseErr) {
      console.warn('Failed to parse Gemini response:', parseErr.message);
      if (type === 'summary' && effectiveNotes && effectiveNotes.trim().length > 0) {
        console.log('Using local summarizer due to parse error');
        return res.status(200).json(summarizeText(effectiveNotes, 8));
      } else if (type === 'quiz' && effectiveNotes && effectiveNotes.trim().length > 0) {
        console.log('Using local quiz generator due to parse error');
        return res.status(200).json(generateQuizFromText(effectiveNotes));
      }
      return res.status(200).json(getFallbackAIResponse(type));
    }
    
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

// Connect to MongoDB (with local JSON fallback)
ragService.connectDB();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     🎓 ClassNexus Server Running                ║
║     http://localhost:${PORT}                        ║
║     Frontend + API served from same origin      ║
╚══════════════════════════════════════════════════╝
  `);
});
