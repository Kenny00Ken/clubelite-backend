const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get wallet balance
router.get('/balance', walletController.getWalletBalance);

// Get transaction history
router.get('/transactions', walletController.getTransactionHistory);

// Get earnings summary
router.get('/earnings', walletController.getEarningsSummary);

module.exports = router;
