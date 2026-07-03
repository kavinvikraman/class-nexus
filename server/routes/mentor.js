const express = require('express');
const router = express.Router();
const mentorController = require('../controllers/mentorController');

router.post('/upload', mentorController.uploadMaterials);
router.post('/chat', mentorController.chat);
router.post('/summary', mentorController.summary);
router.post('/quiz', mentorController.quiz);
router.post('/flashcards', mentorController.flashcards);
router.post('/interview', mentorController.interview);
router.post('/topics', mentorController.topics);
router.post('/roadmap', mentorController.roadmap);
router.post('/code-explain', mentorController.codeExplain);

module.exports = router;