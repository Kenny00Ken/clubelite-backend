const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/auth');

// Protected routes - ALL routes require authentication
router.get('/my-teams', protect, teamController.getUserTeams);
router.get('/', protect, teamController.getAllTeams);
router.get('/browse', protect, teamController.browseTeams);

// Specific routes before parameterized routes
router.get('/invitations', protect, teamController.getUserInvitations);
router.post('/invitations/:request_id/accept', protect, teamController.acceptInvitation);
router.post('/invitations/:request_id/reject', protect, teamController.rejectInvitation);

// Parameterized routes
router.get('/:id', protect, teamController.getTeamById);
router.post('/create', protect, teamController.createTeam);
router.put('/:id', protect, teamController.updateTeam);
router.post('/:id/join-league', protect, teamController.joinLeague);
router.post('/invite-player', protect, teamController.invitePlayer);
router.post('/:id/assign-role', protect, teamController.assignRole);
router.post('/:id/remove-player', protect, teamController.removePlayer);
router.post('/:id/leave', protect, teamController.leaveTeam);
router.delete('/:id', protect, authorize('governor', 'council'), teamController.deleteTeam);

// Join request routes
router.post('/:teamId/join-request', protect, teamController.sendJoinRequest);
router.get('/:teamId/join-requests', protect, teamController.getJoinRequests);
router.get('/:teamId/sent-invitations', protect, teamController.getSentInvitations);
router.post('/:teamId/join-requests/:requestId/approve', protect, teamController.approveJoinRequest);
router.post('/:teamId/join-requests/:requestId/reject', protect, teamController.rejectJoinRequest);
router.delete('/:teamId/join-requests/:requestId/cancel', protect, teamController.cancelInvitation);

// Team application approval routes (for governors/admins)
router.post('/approve-application', protect, authorize('governor', 'admin'), teamController.approveTeamApplication);
router.post('/reject-application', protect, authorize('governor', 'admin'), teamController.rejectTeamApplication);

module.exports = router;
