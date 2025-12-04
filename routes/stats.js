const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Submit match stats
router.post('/submit', statsController.submitStats);

// Get match stats
router.get('/match/:fixtureId', statsController.getMatchStats);

// Get player stats for a fixture
router.get('/match/:fixtureId/player/:playerId', statsController.getPlayerStats);

// Approve stats (Admin/Governor)
router.post('/match/:fixtureId/approve', statsController.approveStats);

// Get pending stats for approval
router.get('/pending', statsController.getPendingStats);

// Delete stats
router.delete('/:statsId', statsController.deleteStats);

module.exports = router;
