const express = require('express');
const router = express.Router();
const rewardsController = require('../controllers/rewardsController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Calculate rewards from approved stats
router.post('/calculate/:fixtureId', rewardsController.calculateRewards);

// Get pending rewards
router.get('/pending', rewardsController.getPendingRewards);

// Execute batch payout (CFO only)
router.post('/payout', rewardsController.executeBatchPayout);

// Get transaction history
router.get('/transactions', rewardsController.getTransactionHistory);

module.exports = router;
