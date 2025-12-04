const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// Protected routes (Admin/Governor/Council only)
router.get('/stats', protect, authorize('admin', 'governor', 'council', 'cfo', 'cto'), adminController.getDashboardStats);

module.exports = router;
