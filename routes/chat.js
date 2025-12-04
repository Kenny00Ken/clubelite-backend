const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get accessible chat rooms
router.get('/rooms', chatController.getChatRooms);

// Get user's team information
router.get('/user-team-info', chatController.getUserTeamInfo);

// Get messages for a room (with pagination)
router.get('/rooms/:roomId/messages', chatController.getMessages);

// Send message
router.post('/rooms/:roomId/messages', chatController.sendMessage);

// Edit message
router.put('/messages/:messageId', chatController.editMessage);

// Delete message
router.delete('/messages/:messageId', chatController.deleteMessage);

module.exports = router;
