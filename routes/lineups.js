const express = require('express');
const router = express.Router();
const lineupController = require('../controllers/lineupController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Submit lineup
router.post('/submit', lineupController.submitLineup);

// Get match lineups (both teams)
router.get('/match/:fixtureId', lineupController.getMatchLineups);

// Get team's lineup for a fixture
router.get('/match/:fixtureId/team/:teamId', lineupController.getTeamLineup);

// Lock lineup
router.post('/:lineupId/lock', lineupController.lockLineup);

// Delete lineup
router.delete('/:lineupId', lineupController.deleteLineup);

// Get team roster (available players)
router.get('/roster/:teamId', lineupController.getTeamRoster);

module.exports = router;
