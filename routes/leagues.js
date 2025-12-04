const express = require('express');
const router = express.Router();
const leagueController = require('../controllers/leagueController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.get('/', leagueController.getAllLeagues);
router.get('/:id', leagueController.getLeagueById);
router.get('/:id/teams', leagueController.getLeagueTeams);
router.get('/:id/standings', leagueController.getLeagueStandings);

// Protected routes (Governor only)
router.post('/create', protect, authorize('governor'), leagueController.createLeague);
router.put('/:id', protect, authorize('governor'), leagueController.updateLeague);
router.delete('/:id', protect, authorize('governor'), leagueController.deleteLeague);
router.put('/:id/activate', protect, authorize('governor'), leagueController.activateLeague);

// Team application routes (Governor/Admin only)
router.get('/:league_id/team-applications', protect, authorize('governor', 'admin'), leagueController.getTeamApplications);

module.exports = router;
