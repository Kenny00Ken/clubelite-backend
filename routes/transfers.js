const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Request transfer
router.post('/request', transferController.requestTransfer);

// Get transfer requests
router.get('/requests', transferController.getTransferRequests);

// Approve transfer (Admin/Governor)
router.post('/:transferId/approve', transferController.approveTransfer);

// Reject transfer (Admin/Governor)
router.post('/:transferId/reject', transferController.rejectTransfer);

// Get player transfer history
router.get('/player/:playerId', transferController.getPlayerTransferHistory);

// Get available players
router.get('/available-players', transferController.getAvailablePlayers);

module.exports = router;
