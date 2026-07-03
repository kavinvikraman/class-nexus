/**
 * Express router for ClassNexus RAG Academic Assistant API
 */

const express = require('express');
const router = express.Router();
const ragController = require('../controllers/ragController');

// Document Ingestion
router.post('/upload', ragController.uploadDocument);
router.get('/documents', ragController.getDocuments);
router.delete('/documents/:documentId', ragController.deleteDocument);

// Vector Search & QA Query
router.post('/query', ragController.queryAssistant);

// Chat History Sessions
router.get('/history', ragController.getSessions);
router.post('/history/new', ragController.createSession);
router.get('/history/:sessionId', ragController.getSession);
router.delete('/history/:sessionId', ragController.deleteSession);

module.exports = router;
