/**
 * ClassNexus RAG Assistant Controller
 * Manages document ingestion (parsing, chunking, embedding) and RAG querying.
 * Includes local NLP fallbacks if Google Gemini API is offline/suspended.
 */

const pdfParse = require('pdf-parse');
const ragService = require('../services/ragService');

// ============================================
// HELPERS
// ============================================

/**
 * Splits text into overlapping chunks
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text) return [];
  const chunks = [];
  let index = 0;
  
  while (index < text.length) {
    const chunkText = text.substr(index, chunkSize).trim();
    if (chunkText.length > 5) {
      chunks.push(chunkText);
    }
    index += (chunkSize - overlap);
    // Safety check to prevent infinite loop
    if (chunkSize <= overlap) break;
  }
  return chunks;
}

/**
 * Deterministically generates a mock normalized 768-dimension embedding vector
 */
function generateMockEmbedding(text) {
  const size = 768;
  const vec = new Array(size).fill(0);
  
  // Hash characters into vector indices
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (i * 31 + charCode) % size;
    vec[index] += charCode;
  }
  
  // Normalize vector to unit length
  const sumOfSquares = vec.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumOfSquares);
  
  if (magnitude > 0) {
    for (let i = 0; i < size; i++) {
      vec[i] = vec[i] / magnitude;
    }
  } else {
    vec[0] = 1.0; // Fallback unit vector
  }
  
  return vec;
}

/**
 * Generates embeddings via Google Gemini API
 */
async function getGeminiEmbedding(text) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    return generateMockEmbedding(text);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${API_KEY}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text }]
        }
      })
    });
    
    const data = await response.json();
    if (response.ok && data.embedding && data.embedding.values) {
      return data.embedding.values;
    }
    
    console.warn(`Gemini Embedding API returned ${response.status}. Using mock embedding.`);
    return generateMockEmbedding(text);
  } catch (e) {
    console.warn(`Gemini Embedding API failed: ${e.message}. Using mock embedding.`);
    return generateMockEmbedding(text);
  }
}

/**
 * Generates simple offline answers based on keyword frequency in retrieved chunks
 */
function generateLocalAnswer(question, chunks) {
  const context = chunks.map(c => c.text).join('\n\n');
  const sentences = context
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const keywords = question.toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !['about', 'would', 'could', 'should', 'their', 'there', 'these', 'those'].includes(w));

  // Find sentences matching query keywords
  const matchedSentences = sentences.filter(s => {
    const sLower = s.toLowerCase();
    return keywords.some(k => sLower.includes(k));
  });

  let responseBody = '';
  if (matchedSentences.length > 0) {
    responseBody = `According to the uploaded documents: ${matchedSentences.slice(0, 3).join(' ')}`;
  } else {
    // Return first 2 sentences as a generic fallback answer
    responseBody = `Based on the retrieved context, I found the following information: ${sentences.slice(0, 2).join(' ')}`;
  }

  return responseBody;
}

// ============================================
// CONTROLLER EXPORTS
// ============================================

/**
 * Ingests a PDF document: extracts text, splits into chunks, embeds, and saves
 */
async function uploadDocument(req, res) {
  try {
    const { name, category, file, fileSize } = req.body;

    if (!name || !category || !file || !fileSize) {
      return res.status(400).json({ error: 'Missing required fields: name, category, file, or fileSize.' });
    }

    console.log(`Processing file: ${name} (${category})`);

    // Decode base64 PDF
    const pdfBuffer = Buffer.from(file, 'base64');

    // Extract text from PDF
    let extractedText = '';
    if (pdfParse) {
      try {
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
        extractedText = (parsed && parsed.text) ? parsed.text.trim() : '';
      } catch (err) {
        console.error('Failed to parse PDF text:', err);
        return res.status(500).json({ error: 'Failed to parse PDF document text: ' + err.message });
      }
    } else {
      return res.status(500).json({ error: 'pdf-parse library is unavailable.' });
    }

    if (!extractedText) {
      return res.status(400).json({ error: 'No readable text could be extracted from the PDF.' });
    }

    // Chunk text
    const textChunks = chunkText(extractedText, 1000, 200);
    console.log(`Split text into ${textChunks.length} chunks.`);

    // Generate embeddings for chunks
    const chunksWithEmbeddings = [];
    for (let i = 0; i < textChunks.length; i++) {
      const embedding = await getGeminiEmbedding(textChunks[i]);
      chunksWithEmbeddings.push({
        text: textChunks[i],
        embedding
      });
    }

    // Save document to storage
    const savedDoc = await ragService.saveDocument(name, category, fileSize, chunksWithEmbeddings);
    res.status(201).json({
      message: 'Document successfully ingested and embedded.',
      document: savedDoc,
      chunksCount: textChunks.length
    });
  } catch (error) {
    console.error('Error uploading RAG document:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

/**
 * Returns all ingested documents
 */
async function getDocuments(req, res) {
  try {
    const docs = await ragService.getDocuments();
    res.json({ documents: docs });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
}

/**
 * Core RAG QA endpoint: embeds query, retrieves chunks, constructs prompt, calls Gemini
 */
async function queryAssistant(req, res) {
  try {
    const { sessionId, question, category } = req.body;

    if (!sessionId || !question) {
      return res.status(400).json({ error: 'Missing required parameters: sessionId and question.' });
    }

    console.log(`RAG query in session ${sessionId}: "${question}"`);

    // 1. Generate query embedding
    const queryEmbedding = await getGeminiEmbedding(question);

    // 2. Retrieve top 3 relevant chunks
    const relevantChunks = await ragService.searchChunks(queryEmbedding, question, category, 3);
    const sources = [...new Set(relevantChunks.map(c => c.documentName))];

    if (relevantChunks.length === 0) {
      const noDocMsg = "I couldn't find any uploaded academic documents. Please upload syllabus notes, regulations, or materials first using the sidebar upload section.";
      await ragService.addMessageToSession(sessionId, 'user', question);
      const savedReply = await ragService.addMessageToSession(sessionId, 'assistant', noDocMsg, []);
      return res.json({ content: noDocMsg, sources: [], session: savedReply });
    }

    // 3. Compile prompt context
    const contextText = relevantChunks.map((c, i) => `[Source: ${c.documentName}] ${c.text}`).join('\n\n');
    
    const systemPrompt = `You are a helpful AI Academic Assistant for the ClassNexus classroom portal.
Your job is to answer the student's question based strictly on the retrieved academic context provided below.

Rules:
1. Rely ONLY on the facts mentioned in the context. Do not make up facts or use external knowledge.
2. If the context does not contain the answer, politely state: "I cannot find the answer to this question in the uploaded academic documents."
3. Keep your response clear, structured, and easy for students to read (use formatting/bullet points where helpful).

Retrieved Context:
${contextText}

Question:
${question}

Answer:`;

    // 4. Call Gemini generateContent API
    let answerText = '';
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      answerText = generateLocalAnswer(question, relevantChunks);
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048
            }
          })
        });

        const data = await response.json();
        if (response.ok && data.candidates && data.candidates[0].content.parts[0].text) {
          answerText = data.candidates[0].content.parts[0].text.trim();
        } else {
          console.warn(`Gemini QA generation failed. Response status: ${response.status}. Using local fallback.`);
          answerText = generateLocalAnswer(question, relevantChunks);
        }
      } catch (err) {
        console.warn(`Failed to generate answer from Gemini: ${err.message}. Using local fallback.`);
        answerText = generateLocalAnswer(question, relevantChunks);
      }
    }

    // 5. Save interaction to database chat history
    await ragService.addMessageToSession(sessionId, 'user', question);
    const updatedSession = await ragService.addMessageToSession(sessionId, 'assistant', answerText, sources);

    res.json({
      content: answerText,
      sources,
      session: updatedSession
    });
  } catch (error) {
    console.error('Error querying RAG assistant:', error);
    res.status(500).json({ error: 'Failed to process question: ' + error.message });
  }
}

/**
 * Returns all chat sessions
 */
async function getSessions(req, res) {
  try {
    const sessions = await ragService.getChatSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Failed to retrieve chat history.' });
  }
}

/**
 * Retrieves a specific session's messages
 */
async function getSession(req, res) {
  try {
    const session = await ragService.getChatSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Chat session not found.' });
    res.json({ session });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to retrieve chat session.' });
  }
}

/**
 * Creates a new chat session
 */
async function createSession(req, res) {
  try {
    const { title } = req.body;
    const session = await ragService.saveChatSession(title || 'New Academic Chat');
    res.status(201).json({ session });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Failed to create new chat session.' });
  }
}

/**
 * Deletes a chat session
 */
async function deleteSession(req, res) {
  try {
    await ragService.deleteChatSession(req.params.sessionId);
    res.json({ success: true, message: 'Chat session deleted successfully.' });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Failed to delete chat session.' });
  }
}

/**
 * Deletes an ingested document and its chunks
 */
async function deleteDocument(req, res) {
  try {
    const { documentId } = req.params;
    await ragService.deleteDocument(documentId);
    res.json({ success: true, message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document: ' + error.message });
  }
}

module.exports = {
  uploadDocument,
  getDocuments,
  deleteDocument,
  queryAssistant,
  getSessions,
  getSession,
  createSession,
  deleteSession
};
