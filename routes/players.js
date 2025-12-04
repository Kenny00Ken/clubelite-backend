const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');
const { protect } = require('../middleware/auth');

// Protected routes
router.get('/profile/:userId', protect, playerController.getPlayerProfile);
router.get('/stats/:playerId', protect, playerController.getPlayerStats);
router.get('/teams/:playerId', protect, playerController.getPlayerTeams);
router.get('/matches/:playerId', protect, playerController.getPlayerMatches);

module.exports = router;
