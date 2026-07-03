const fs = require('fs');
const os = require('os');
const path = require('path');
const pdfParse = require('pdf-parse');
const ragService = require('./ragService');

let officeParserModule;
try {
  officeParserModule = require('officeparser');
} catch (error) {
  officeParserModule = null;
}

const OfficeParser = officeParserModule?.OfficeParser || officeParserModule?.default?.OfficeParser || officeParserModule;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text, chunkSize = 1200, overlap = 200) {
  const content = normalizeText(text);
  if (!content) return [];

  const chunks = [];
  let index = 0;
  while (index < content.length) {
    const slice = content.slice(index, index + chunkSize).trim();
    if (slice.length > 10) {
      chunks.push(slice);
    }
    index += Math.max(1, chunkSize - overlap);
  }
  return chunks;
}

function generateMockEmbedding(text) {
  const size = 768;
  const vec = new Array(size).fill(0);

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (i * 31 + charCode) % size;
    vec[index] += charCode;
  }

  const sumOfSquares = vec.reduce((sum, value) => sum + value * value, 0);
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude > 0) {
    for (let i = 0; i < size; i++) {
      vec[i] = vec[i] / magnitude;
    }
  } else {
    vec[0] = 1;
  }

  return vec;
}

async function getGeminiEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return generateMockEmbedding(text);
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] }
      })
    });
    const data = await response.json();
    if (response.ok && data.embedding?.values) {
      return data.embedding.values;
    }
  } catch (error) {
    console.warn(`Embedding request failed: ${error.message}`);
  }

  return generateMockEmbedding(text);
}

async function extractTextFromFile(file) {
  const name = file?.name || 'uploaded-material';
  const mimeType = String(file?.mimeType || '').toLowerCase();
  const extension = path.extname(name).toLowerCase();
  const buffer = Buffer.from(file?.data || '', 'base64');

  if (!buffer.length) {
    throw new Error(`File ${name} is empty.`);
  }

  if (mimeType.includes('pdf') || extension === '.pdf') {
    let parsed;
    if (typeof pdfParse === 'function') {
      parsed = await pdfParse(buffer);
    } else if (pdfParse && typeof pdfParse.PDFParse === 'function') {
      const parserInstance = new pdfParse.PDFParse({ data: buffer });
      parsed = await parserInstance.getText();
    } else if (pdfParse && typeof pdfParse.default === 'function') {
      parsed = await pdfParse.default(buffer);
    } else {
      throw new Error('pdf-parse export not callable or instantiable');
    }

    return normalizeText(parsed?.text || '');
  }

  if (mimeType.startsWith('text/') || extension === '.txt') {
    return normalizeText(buffer.toString('utf8'));
  }

  if (!OfficeParser || typeof OfficeParser.parseOffice !== 'function') {
    throw new Error('Office document parsing is unavailable.');
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kai-notes-'));
  const tempPath = path.join(tempDir, name);
  try {
    await fs.promises.writeFile(tempPath, buffer);
    const ast = await OfficeParser.parseOffice(tempPath, {
      ignoreNotes: true,
      ignoreComments: true,
      ignoreHeadersAndFooters: true,
      ignoreSlideMasters: true,
    });
    const textResult = await ast.to('text');
    return normalizeText(textResult?.value || '');
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function ingestFiles(files, category = 'notes') {
  const uploadedDocuments = [];

  for (const file of files) {
    const text = await extractTextFromFile(file);
    if (!text) {
      throw new Error(`No readable text could be extracted from ${file.name}.`);
    }

    const chunks = chunkText(text, 1200, 200);
    const chunksWithEmbeddings = [];
    for (const chunk of chunks) {
      const embedding = await getGeminiEmbedding(chunk);
      chunksWithEmbeddings.push({ text: chunk, embedding });
    }

    const savedDocument = await ragService.saveDocument(
      file.name,
      category,
      file.size || Buffer.byteLength(file.data, 'base64'),
      chunksWithEmbeddings
    );

    uploadedDocuments.push({
      _id: savedDocument._id,
      name: savedDocument.name,
      category: savedDocument.category,
      fileSize: savedDocument.fileSize,
      uploadedAt: savedDocument.uploadedAt,
      textLength: text.length,
      chunksCount: chunks.length,
    });
  }

  return uploadedDocuments;
}

function getUniqueSources(chunks = []) {
  return [...new Set(chunks.map((chunk) => chunk.documentName).filter(Boolean))];
}

function extractTopTopicsFromText(text, limit = 5) {
  const stopwords = new Set(['the', 'and', 'is', 'in', 'to', 'of', 'a', 'an', 'for', 'on', 'with', 'that', 'this', 'these', 'those', 'are', 'as', 'by', 'from', 'or', 'be', 'it', 'at', 'we', 'can', 'has', 'have', 'was', 'were', 'will', 'their', 'its']);
  const words = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));

  const frequencies = Object.create(null);
  for (const word of words) {
    frequencies[word] = (frequencies[word] || 0) + 1;
  }

  return Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function makeTitleFromText(text, fallback) {
  const firstLine = normalizeText(text).split('\n').find((line) => line.trim()) || '';
  const candidate = firstLine.split(/\s+/).slice(0, 8).join(' ').trim();
  return candidate || fallback;
}

function makeLocalSummary(text) {
  const sentences = normalizeText(text)
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const bullets = sentences.slice(0, 8).map((sentence) => sentence.length > 200 ? `${sentence.slice(0, 197)}...` : sentence);
  return {
    title: makeTitleFromText(text, 'Study Summary'),
    bullets,
    keyTopics: extractTopTopicsFromText(text, 5),
    sourceFiles: [],
    confidence: bullets.length ? 78 : 20,
  };
}

function makeLocalQuiz(text) {
  const sentences = normalizeText(text)
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);

  const topics = extractTopTopicsFromText(text, 10);
  const questions = Array.from({ length: 10 }).map((_, index) => {
    const sentence = sentences[index % Math.max(1, sentences.length)] || `Key idea ${index + 1}`;
    const topic = topics[index % Math.max(1, topics.length)] || 'Core Concept';
    return {
      question: `Which statement best matches the material about ${topic}?`,
      options: [sentence.slice(0, 65), 'Related concept', 'Incorrect detail', 'Unsupported detail'],
      correctAnswer: sentence.slice(0, 65),
      explanation: sentence,
      difficultyLevel: index < 3 ? 'Basic' : index < 7 ? 'Intermediate' : 'Advanced',
    };
  });

  return {
    questions,
    sourceFiles: [],
    confidence: questions.length ? 76 : 20,
  };
}

function makeLocalFlashcards(text) {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25)
    .slice(0, 12);

  return {
    flashcards: sentences.map((sentence, index) => ({
      front: `Explain concept ${index + 1}`,
      back: sentence,
    })),
    sourceFiles: [],
    confidence: sentences.length ? 75 : 20,
  };
}

function makeLocalInterviewQuestions(text) {
  const topics = extractTopTopicsFromText(text, 12);
  const buildQuestions = (level, count) => Array.from({ length: count }).map((_, index) => ({
    question: `How would you explain ${topics[index % Math.max(1, topics.length)] || 'this topic'} in a ${level.toLowerCase()} interview?`,
    answerHint: 'Base your answer only on the uploaded material.',
  }));

  return {
    basic: buildQuestions('Basic', 4),
    intermediate: buildQuestions('Intermediate', 3),
    advanced: buildQuestions('Advanced', 3),
    sourceFiles: [],
    confidence: topics.length ? 73 : 20,
  };
}

function makeLocalRoadmap(text) {
  const topics = extractTopTopicsFromText(text, 8);
  const roadmap = topics.map((topic, index) => ({
    week: `Week ${index + 1}`,
    focus: topic,
    goals: [
      `Understand ${topic}`,
      `Practice retrieval from study materials`,
      `Review examples and notes`,
    ],
  }));

  return {
    roadmap,
    sourceFiles: [],
    confidence: roadmap.length ? 74 : 20,
  };
}

function makeLocalCodeExplain(text) {
  const snippet = normalizeText(text).split('\n').filter(Boolean).slice(0, 20).join('\n');
  return {
    answer: snippet ? 'The uploaded code appears to define the core logic shown below.' : "I couldn't find code in your uploaded study materials.",
    simpleExplanation: snippet ? 'This is a best-effort explanation from the uploaded code snippet.' : "I couldn't find this answer in your uploaded study materials.",
    keyPoints: snippet ? ['Read the flow from top to bottom', 'Identify inputs, logic, and outputs', 'Check error-handling and edge cases'] : [],
    example: snippet ? ['Look at the first function or class declaration.', 'Trace each branch to see how the output is produced.'] : [],
    sourceFile: '',
    confidence: snippet ? 68 : 20,
  };
}

async function callGeminiStructuredPrompt(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return null;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return null;
    }

    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      return null;
    }

    return JSON.parse(textContent);
  } catch (error) {
    console.warn(`Gemini mentor request failed: ${error.message}`);
    return null;
  }
}

async function buildCorpusText() {
  const chunks = await ragService.getAllChunks();
  const sourceFiles = getUniqueSources(chunks);
  const corpusText = chunks.map((chunk) => `[Source: ${chunk.documentName}] ${chunk.text}`).join('\n\n');
  return { chunks, sourceFiles, corpusText };
}

async function generateContent(type) {
  const { chunks, sourceFiles, corpusText } = await buildCorpusText();
  if (!corpusText.trim()) {
    return {
      empty: true,
      message: "I couldn't find this answer in your uploaded study materials.",
      sourceFiles: [],
      confidence: 0,
    };
  }

  const promptBase = `You are Kai Notes AI Mentor. Answer strictly from the uploaded study materials below. Do not use external knowledge. If the answer is not available, respond exactly with: \"I couldn't find this answer in your uploaded study materials.\" Return valid JSON only.`;

  const promptMap = {
    summary: `${promptBase}\n\nCreate a concise study summary. Return JSON with title, bullets (max 8), keyTopics (3-5 items), sourceFiles, and confidence.`,
    quiz: `${promptBase}\n\nCreate 10 MCQs from the materials. Return JSON with questions array. Each question must include question, options (4), correctAnswer, explanation, difficultyLevel, sourceFile. Also include sourceFiles and confidence.`,
    flashcards: `${promptBase}\n\nCreate flashcards from the materials. Return JSON with flashcards array where each item has front and back. Include sourceFiles and confidence.`,
    interview: `${promptBase}\n\nCreate interview questions grouped into basic, intermediate, and advanced. Return JSON with basic, intermediate, advanced arrays. Include sourceFiles and confidence.`,
    topics: `${promptBase}\n\nExtract the most important repeated concepts and rank them. Return JSON with topics array containing topic, rank, whyImportant. Include sourceFiles and confidence.`,
    roadmap: `${promptBase}\n\nCreate a personalized study roadmap grouped by week. Return JSON with roadmap array containing week, focus, goals. Include sourceFiles and confidence.`,
    'code-explain': `${promptBase}\n\nIf the uploaded materials contain code, explain it in detail. Return JSON with answer, simpleExplanation, keyPoints, example, sourceFile, confidence. If there is no code, say the answer is unavailable.`,
  };

  const geminiResult = await callGeminiStructuredPrompt(`${promptMap[type]}\n\nUploaded Materials:\n${corpusText}`);
  if (geminiResult) {
    return {
      ...geminiResult,
      sourceFiles: geminiResult.sourceFiles || sourceFiles,
      confidence: typeof geminiResult.confidence === 'number' ? geminiResult.confidence : 88,
    };
  }

  const text = chunks.map((chunk) => chunk.text).join('\n\n');
  switch (type) {
    case 'summary':
      return { ...makeLocalSummary(text), sourceFiles };
    case 'quiz':
      return { ...makeLocalQuiz(text), sourceFiles };
    case 'flashcards':
      return { ...makeLocalFlashcards(text), sourceFiles };
    case 'interview':
      return { ...makeLocalInterviewQuestions(text), sourceFiles };
    case 'topics':
      return {
        topics: extractTopTopicsFromText(text, 8).map((topic, index) => ({
          topic,
          rank: index + 1,
          whyImportant: `This concept appears frequently across the uploaded study materials.`,
        })),
        sourceFiles,
        confidence: 74,
      };
    case 'roadmap':
      return { ...makeLocalRoadmap(text), sourceFiles };
    case 'code-explain':
      return { ...makeLocalCodeExplain(text), sourceFiles };
    default:
      return { ...makeLocalSummary(text), sourceFiles };
  }
}

async function buildChatAnswer(question) {
  const queryEmbedding = await getGeminiEmbedding(question);
  const relevantChunks = await ragService.searchChunks(queryEmbedding, question, null, 5);
  const sourceFiles = getUniqueSources(relevantChunks);

  if (!relevantChunks.length) {
    return {
      answer: "I couldn't find this answer in your uploaded study materials.",
      simpleExplanation: "Upload relevant study materials, then ask again so I can answer only from those notes.",
      keyPoints: [],
      example: [],
      sourceFile: '',
      confidence: 0,
      sourceFiles: [],
      unavailable: true,
    };
  }

  const contextText = relevantChunks.map((chunk) => `[Source: ${chunk.documentName}] ${chunk.text}`).join('\n\n');
  const prompt = `You are Kai Notes AI Mentor. Answer strictly from the uploaded study materials below. Do not use external knowledge. If the answer is not available, respond exactly with: \"I couldn't find this answer in your uploaded study materials.\" Return valid JSON only with this structure:\n{\n  \"answer\": \"...\",\n  \"simpleExplanation\": \"...\",\n  \"keyPoints\": [\"...\"],\n  \"example\": [\"...\"],\n  \"sourceFile\": \"...\",\n  \"confidence\": 0-100\n}\n\nQuestion: ${question}\n\nUploaded Materials:\n${contextText}`;

  const geminiResult = await callGeminiStructuredPrompt(prompt);
  if (geminiResult) {
    return {
      ...geminiResult,
      sourceFiles: geminiResult.sourceFiles || sourceFiles,
      sourceFile: geminiResult.sourceFile || sourceFiles[0] || '',
      confidence: typeof geminiResult.confidence === 'number' ? geminiResult.confidence : 90,
      unavailable: false,
    };
  }

  const bestChunk = relevantChunks[0];
  const bestSentence = normalizeText(bestChunk.text).split(/(?<=[.!?])\s+/).find(Boolean) || bestChunk.text;
  return {
    answer: `According to ${bestChunk.documentName}, ${bestSentence}`,
    simpleExplanation: bestSentence,
    keyPoints: extractTopTopicsFromText(bestChunk.text, 3),
    example: [bestChunk.documentName],
    sourceFile: bestChunk.documentName,
    confidence: Math.min(96, Math.round((bestChunk.score || 0) * 100) + 55),
    sourceFiles,
    unavailable: false,
  };
}

module.exports = {
  ingestFiles,
  generateContent,
  buildChatAnswer,
};