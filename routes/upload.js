const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');

// Upload avatar endpoint (protected - requires authentication)
router.post('/avatar', protect, uploadController.upload.single('avatar'), uploadController.uploadAvatar);

// Upload team crest endpoint (protected - requires authentication, same as avatar)
router.post('/team-crest/:teamId', protect, uploadController.upload.single('crest'), uploadController.uploadTeamCrest);

module.exports = router;
