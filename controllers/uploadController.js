const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure multer to use temporary storage first
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join('uploads', 'temp');
    ensureDirectoryExists(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `temp-${uniqueSuffix}${ext}`);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload avatar controller
const uploadAvatar = async (req, res) => {
  const db = require('../config/db');
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Get user_id from JWT token (set by protect middleware)
    const { user_id } = req.user;
    
    if (!user_id) {
      // Clean up temp file
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Create user-specific folder using user_id
    const userDir = path.join('uploads', 'profile-images', user_id);
    
    // Ensure user directory exists
    ensureDirectoryExists('uploads');
    ensureDirectoryExists(path.join('uploads', 'profile-images'));
    ensureDirectoryExists(userDir);
    
    // Delete old avatar if it exists
    const existingFiles = fs.readdirSync(userDir);
    existingFiles.forEach(file => {
      if (file.startsWith('avatar')) {
        fs.unlinkSync(path.join(userDir, file));
      }
    });
    
    // Move file from temp to user directory with timestamp for cache-busting
    const ext = path.extname(req.file.originalname);
    const timestamp = Date.now();
    const finalFilename = `avatar-${timestamp}${ext}`;
    const finalPath = path.join(userDir, finalFilename);
    
    // Move the file
    fs.renameSync(req.file.path, finalPath);
    
    // Return the relative path that will be stored in database
    const avatarPath = `uploads/profile-images/${user_id}/${finalFilename}`;
    
    // Update avatar_url in player_profile table
    await db.query(
      'UPDATE player_profile SET avatar_url = $1 WHERE user_id = $2',
      [avatarPath, user_id]
    );
    
    res.json({
      message: 'Avatar uploaded successfully',
      avatarPath: avatarPath,
      fileName: finalFilename
    });
  } catch (error) {
    // Clean up temp file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// Upload team crest controller
const uploadTeamCrest = async (req, res) => {
  const db = require('../config/db');
  
  try {
    if (!req.file) {
      console.error('❌ [UPLOAD] No file in request');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { user_id } = req.user;
    const { teamId } = req.params;

    if (!user_id) {
      console.error('❌ [UPLOAD] User not authenticated');
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!teamId) {
      console.error('❌ [UPLOAD] Team ID missing');
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Team ID is required' });
    }

    // Verify ownership
    const teamCheck = await db.query(
      'SELECT team_id FROM team_profile WHERE team_id = $1 AND created_by = $2',
      [teamId, user_id]
    );

    if (teamCheck.rows.length === 0) {
      console.error('❌ [UPLOAD] User does not own this team');
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'You do not own this team' });
    }

    const team_id = teamId;

    // Create team-specific folder
    const teamDir = path.join('uploads', 'team-crests', team_id);
    
    // Ensure directories exist
    ensureDirectoryExists('uploads');
    ensureDirectoryExists(path.join('uploads', 'team-crests'));
    ensureDirectoryExists(teamDir);
    
    // Delete old crest if it exists
    try {
      const existingFiles = fs.readdirSync(teamDir);
      existingFiles.forEach(file => {
        if (file.startsWith('crest')) {
          const oldPath = path.join(teamDir, file);
          fs.unlinkSync(oldPath);
        }
      });
    } catch (readError) {
      console.warn('⚠️ [UPLOAD] Could not read directory for cleanup:', readError.message);
    }
    
    // Move file from temp to team directory
    const ext = path.extname(req.file.originalname);
    const timestamp = Date.now();
    const finalFilename = `crest-${timestamp}${ext}`;
    const finalPath = path.join(teamDir, finalFilename);
    
    fs.renameSync(req.file.path, finalPath);
    
    // Relative path for DB
    const crestPath = `uploads/team-crests/${team_id}/${finalFilename}`;
    
    // Update DB
    await db.query(
      'UPDATE team_profile SET crest_url = $1 WHERE team_id = $2',
      [crestPath, team_id]
    );
    
    res.json({
      message: 'Team crest uploaded successfully',
      crestPath: crestPath,
      fileName: finalFilename
    });
  } catch (error) {
    console.error('❌ [UPLOAD] Upload failed with error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

module.exports = {
  upload,
  uploadAvatar,
  uploadTeamCrest
};
