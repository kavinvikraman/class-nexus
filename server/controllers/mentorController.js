const ragService = require('../services/ragService');
const mentorService = require('../services/mentorService');

async function uploadMaterials(req, res) {
  try {
    const { files, category = 'notes' } = req.body;
    const incomingFiles = Array.isArray(files) ? files : [];

    if (!incomingFiles.length) {
      return res.status(400).json({ error: 'Please provide at least one file.' });
    }

    const uploaded = await mentorService.ingestFiles(incomingFiles, category);
    return res.status(201).json({
      message: 'Files uploaded successfully.',
      documents: uploaded,
    });
  } catch (error) {
    console.error('Error uploading mentor materials:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload study materials.' });
  }
}

async function chat(req, res) {
  try {
    const { sessionId, question } = req.body;
    if (!sessionId || !question) {
      return res.status(400).json({ error: 'Missing required parameters: sessionId and question.' });
    }

    const answer = await mentorService.buildChatAnswer(question);
    await ragService.addMessageToSession(sessionId, 'user', question);
    const session = await ragService.addMessageToSession(
      sessionId,
      'assistant',
      answer.unavailable ? answer.answer : JSON.stringify(answer),
      answer.sourceFiles || []
    );

    return res.json({
      ...answer,
      session,
    });
  } catch (error) {
    console.error('Error answering mentor chat:', error);
    return res.status(500).json({ error: error.message || 'Failed to answer question.' });
  }
}

function buildGenerateHandler(type) {
  return async (req, res) => {
    try {
      const result = await mentorService.generateContent(type);
      return res.json(result);
    } catch (error) {
      console.error(`Error generating mentor ${type}:`, error);
      return res.status(500).json({ error: error.message || `Failed to generate ${type}.` });
    }
  };
}

module.exports = {
  uploadMaterials,
  chat,
  summary: buildGenerateHandler('summary'),
  quiz: buildGenerateHandler('quiz'),
  flashcards: buildGenerateHandler('flashcards'),
  interview: buildGenerateHandler('interview'),
  topics: buildGenerateHandler('topics'),
  roadmap: buildGenerateHandler('roadmap'),
  codeExplain: buildGenerateHandler('code-explain'),
};