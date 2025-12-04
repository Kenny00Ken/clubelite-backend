const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Protected routes
router.get('/', protect, userController.getAllUsers);
router.post('/:id/role', protect, userController.updateUserRole);
router.put('/profile', protect, userController.updateProfile);

module.exports = router;
