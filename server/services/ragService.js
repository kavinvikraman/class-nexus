/**
 * ClassNexus RAG Data Service
 * Supports MongoDB (via Mongoose) when connected, or falls back to local JSON file storage.
 * Implements Cosine Similarity search for vector embeddings.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// File paths for JSON fallback
const DATA_DIR = path.join(__dirname, '../data');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'rag_documents.json');
const CHUNKS_FILE = path.join(DATA_DIR, 'rag_chunks.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'rag_sessions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global flag to track MongoDB connection
let isDbConnected = false;

// ============================================
// MONGOOSE SCHEMAS & MODELS
// ============================================

const DocumentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true }, // 'notes' | 'syllabus' | 'questions' | 'regulations' | 'placement'
  uploadedAt: { type: Date, default: Date.now },
  fileSize: { type: Number, required: true }
});

const ChunkSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicDocument', required: true },
  documentName: { type: String, required: true },
  category: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true } // The vector embedding float array
});

const ChatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  sources: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const ChatSessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  messages: [ChatMessageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

let AcademicDocumentModel;
let DocumentChunkModel;
let ChatSessionModel;

try {
  AcademicDocumentModel = mongoose.model('AcademicDocument', DocumentSchema);
  DocumentChunkModel = mongoose.model('DocumentChunk', ChunkSchema);
  ChatSessionModel = mongoose.model('ChatSession', ChatSessionSchema);
} catch (e) {
  AcademicDocumentModel = mongoose.model('AcademicDocument');
  DocumentChunkModel = mongoose.model('DocumentChunk');
  ChatSessionModel = mongoose.model('ChatSession');
}

// ============================================
// DATABASE CONNECTION INITIALIZER
// ============================================

async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/classnexus';
  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // 5 seconds timeout
    });
    isDbConnected = true;
    console.log('✅ MongoDB connected successfully for RAG Assistant.');
  } catch (error) {
    isDbConnected = false;
    console.warn(`⚠️ MongoDB connection failed: ${error.message}`);
    console.warn('ℹ️ RAG Assistant will run in local-file mode (storing data in server/data/*.json).');
  }
}

function isConnected() {
  return isDbConnected && mongoose.connection.readyState === 1;
}

// ============================================
// JSON FALLBACK HELPERS
// ============================================

function readJsonFile(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`Error writing to ${filePath}:`, e.message);
    return false;
  }
}

// ============================================
// COSINE SIMILARITY MATHS
// ============================================

/**
 * Calculates cosine similarity between two vector arrays of the same length
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================
// SERVICE INTERFACE METHODS
// ============================================

/**
 * Saves a document and its parsed text chunks
 */
async function saveDocument(name, category, fileSize, chunks) {
  if (isConnected()) {
    // 1. Save document metadata
    const doc = new AcademicDocumentModel({ name, category, fileSize });
    await doc.save();

    // 2. Save document chunks with embeddings
    const chunkPromises = chunks.map((c, idx) => {
      return new DocumentChunkModel({
        documentId: doc._id,
        documentName: name,
        category,
        chunkIndex: idx,
        text: c.text,
        embedding: c.embedding
      }).save();
    });
    await Promise.all(chunkPromises);
    return doc;
  } else {
    // JSON Fallback
    const docs = readJsonFile(DOCUMENTS_FILE);
    const newDoc = {
      _id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name,
      category,
      fileSize,
      uploadedAt: new Date().toISOString()
    };
    docs.push(newDoc);
    writeJsonFile(DOCUMENTS_FILE, docs);

    const allChunks = readJsonFile(CHUNKS_FILE);
    chunks.forEach((c, idx) => {
      allChunks.push({
        _id: 'chunk_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5),
        documentId: newDoc._id,
        documentName: name,
        category,
        chunkIndex: idx,
        text: c.text,
        embedding: c.embedding
      });
    });
    writeJsonFile(CHUNKS_FILE, allChunks);
    return newDoc;
  }
}

/**
 * Retrieves all academic documents
 */
async function getDocuments() {
  if (isConnected()) {
    return await AcademicDocumentModel.find().sort({ uploadedAt: -1 });
  } else {
    return readJsonFile(DOCUMENTS_FILE).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }
}

/**
 * Deletes an academic document and all its chunks
 */
async function deleteDocument(id) {
  if (isConnected()) {
    await AcademicDocumentModel.findByIdAndDelete(id);
    await DocumentChunkModel.deleteMany({ documentId: id });
    return { success: true };
  } else {
    // JSON Fallback
    const docs = readJsonFile(DOCUMENTS_FILE);
    const filteredDocs = docs.filter(d => d._id !== id);
    writeJsonFile(DOCUMENTS_FILE, filteredDocs);

    const chunks = readJsonFile(CHUNKS_FILE);
    const filteredChunks = chunks.filter(c => c.documentId !== id);
    writeJsonFile(CHUNKS_FILE, filteredChunks);
    return { success: true };
  }
}

/**
 * Searches for top K most similar chunks
 */
async function searchChunks(queryEmbedding, queryText, category = null, limit = 3) {
  let chunks = [];
  if (isConnected()) {
    const filter = category ? { category } : {};
    chunks = await DocumentChunkModel.find(filter);
  } else {
    chunks = readJsonFile(CHUNKS_FILE);
    if (category) {
      chunks = chunks.filter(c => c.category === category);
    }
  }

  if (chunks.length === 0) return [];

  // Compute similarity score for each chunk
  const scoredChunks = chunks.map(chunk => {
    let score = 0;
    
    // Check if we have valid numerical embeddings
    if (queryEmbedding && chunk.embedding && queryEmbedding.length === chunk.embedding.length) {
      score = cosineSimilarity(queryEmbedding, chunk.embedding);
    } else {
      // Fallback text matching score if embeddings are unavailable/mismatched
      const queryWords = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const chunkTextLower = chunk.text.toLowerCase();
      let matchCount = 0;
      queryWords.forEach(word => {
        if (chunkTextLower.includes(word)) matchCount++;
      });
      score = matchCount / Math.max(1, queryWords.length);
    }

    return {
      documentName: chunk.documentName,
      category: chunk.category,
      text: chunk.text,
      chunkIndex: chunk.chunkIndex,
      score
    };
  });

  // Sort by score descending and take top K
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Retrieves all chat sessions
 */
async function getChatSessions() {
  if (isConnected()) {
    return await ChatSessionModel.find().sort({ updatedAt: -1 });
  } else {
    return readJsonFile(SESSIONS_FILE).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

/**
 * Retrieves a specific chat session with its messages
 */
async function getChatSession(id) {
  if (isConnected()) {
    return await ChatSessionModel.findById(id);
  } else {
    const sessions = readJsonFile(SESSIONS_FILE);
    return sessions.find(s => s._id === id) || null;
  }
}

/**
 * Saves/creates a new chat session
 */
async function saveChatSession(title) {
  if (isConnected()) {
    const session = new ChatSessionModel({ title, messages: [] });
    return await session.save();
  } else {
    const sessions = readJsonFile(SESSIONS_FILE);
    const newSession = {
      _id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    sessions.push(newSession);
    writeJsonFile(SESSIONS_FILE, sessions);
    return newSession;
  }
}

/**
 * Appends a message to a session
 */
async function addMessageToSession(sessionId, role, content, sources = []) {
  const newMessage = {
    role,
    content,
    sources,
    createdAt: new Date()
  };

  if (isConnected()) {
    return await ChatSessionModel.findByIdAndUpdate(
      sessionId,
      { 
        $push: { messages: newMessage },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  } else {
    const sessions = readJsonFile(SESSIONS_FILE);
    const session = sessions.find(s => s._id === sessionId);
    if (session) {
      newMessage._id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      newMessage.createdAt = new Date().toISOString();
      session.messages.push(newMessage);
      session.updatedAt = new Date().toISOString();
      writeJsonFile(SESSIONS_FILE, sessions);
      return session;
    }
    throw new Error('Chat session not found');
  }
}

/**
 * Deletes a chat session
 */
async function deleteChatSession(id) {
  if (isConnected()) {
    return await ChatSessionModel.findByIdAndDelete(id);
  } else {
    const sessions = readJsonFile(SESSIONS_FILE);
    const filtered = sessions.filter(s => s._id !== id);
    writeJsonFile(SESSIONS_FILE, filtered);
    return { success: true };
  }
}

module.exports = {
  connectDB,
  isConnected,
  saveDocument,
  getDocuments,
  deleteDocument,
  searchChunks,
  getChatSessions,
  getChatSession,
  saveChatSession,
  addMessageToSession,
  deleteChatSession
};
