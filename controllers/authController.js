const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const register = async (req, res) => {
  const { 
    email, 
    password, 
    phone,
    firstName, 
    lastName, 
    gamerTag, 
    avatarUrl, 
    bio, 
    dateOfBirth, 
    nationality, 
    preferredPositions,
    jerseyNumber,
    platform
  } = req.body;

  try {
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, req.body.username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await db.query(
      'INSERT INTO users (email, username, password_hash, phone) VALUES ($1, $2, $3, $4) RETURNING user_id, email, username, phone, created_at',
      [email, req.body.username, hashedPassword, phone || null]
    );

    const userId = newUser.rows[0].user_id;

    // Create player profile
    await db.query(
      `INSERT INTO player_profile (
        player_id, 
        user_id, 
        first_name, 
        last_name, 
        gamer_tag, 
        avatar_url, 
        bio, 
        date_of_birth, 
        nationality, 
        preferred_positions,
        platform,
        jersey_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        `CEG-PL-${Date.now()}`, 
        userId, 
        firstName || 'Unknown', 
        lastName || 'Player', 
        gamerTag || `Player${Date.now()}`, 
        avatarUrl || null, 
        bio || null, 
        dateOfBirth || null, 
        nationality || null, 
        preferredPositions && preferredPositions.length > 0 ? preferredPositions : null,
        platform || 'PC',
        jerseyNumber || null
      ]
    );

    // Generate JWT
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        email: newUser.rows[0].email,
        phone: newUser.rows[0].phone,
        firstName: firstName || 'Unknown',
        lastName: lastName || 'Player',
        gamerTag: gamerTag || `Player${Date.now()}`,
        avatarUrl: avatarUrl || null,
        bio: bio || null,
        dateOfBirth: dateOfBirth || null,
        nationality: nationality || null,
        preferredPositions: preferredPositions || []
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check user
    const userResult = await db.query('SELECT * FROM users WHERE email = $1 OR username = $1', [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Get player profile
    const profileResult = await db.query('SELECT * FROM player_profile WHERE user_id = $1', [user.user_id]);
    const profile = profileResult.rows[0] || {};

    // Get user role
    const roleResult = await db.query('SELECT role_type, scope FROM user_roles WHERE user_id = $1', [user.user_id]);
    const userRole = roleResult.rows[0] || { role_type: 'player', scope: null };

    // Generate JWT
    const token = jwt.sign({ id: user.user_id, role: userRole.role_type }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.user_id,
        email: user.email,
        username: user.username,
        phone: user.phone,
        firstName: profile.first_name,
        lastName: profile.last_name,
        gamerTag: profile.gamer_tag,
        avatarUrl: profile.avatar_url,
        bio: profile.bio,
        dateOfBirth: profile.date_of_birth,
        nationality: profile.nationality,
        preferredPositions: profile.preferred_positions || [],
        role: userRole.role_type,
        scope: userRole.scope
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  register,
  login
};
