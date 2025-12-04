const db = require('../config/db');

// Get all users (with optional search)
const getAllUsers = async (req, res) => {
  const { search } = req.query;
  
  try {
    let query = `
      SELECT u.user_id, u.email, u.username,
             p.first_name, p.last_name,
             COALESCE(ur.role_type, 'player') as role,
             ur.scope
      FROM users u
      LEFT JOIN player_profile p ON u.user_id = p.user_id
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    `;
    
    const params = [];
    
    if (search) {
      query += ` WHERE u.email ILIKE $1 OR u.username ILIKE $1 OR p.first_name ILIKE $1 OR p.last_name ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT 50`;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// Update user role
const updateUserRole = async (req, res) => {
  const { id } = req.params; // User ID to update
  const { role, scope } = req.body; // New role and scope
  const { user_id } = req.user; // Requester ID

  try {
    // 1. Check requester's authority
    const requesterRoleResult = await db.query(
      'SELECT role_type FROM user_roles WHERE user_id = $1',
      [user_id]
    );
    
    const requesterRole = requesterRoleResult.rows[0]?.role_type;
    
    // Hierarchy Logic
    const allowed = {
      'council': ['governor', 'cfo', 'cto', 'council', 'admin', 'player'],
      'governor': ['admin', 'player'],
      'admin': ['player'] 
    };

    if (!requesterRole || !allowed[requesterRole] || !allowed[requesterRole].includes(role)) {
      return res.status(403).json({ message: `You are not authorized to assign the role: ${role}` });
    }

    // 2. Handle Role Assignment
    if (role === 'player') {
      // If changing to player, remove from user_roles table
      await db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    } else {
      // For admin roles, update or insert in user_roles table
      const existingRole = await db.query('SELECT * FROM user_roles WHERE user_id = $1', [id]);

      if (existingRole.rows.length > 0) {
        await db.query(
          'UPDATE user_roles SET role_type = $1, scope = $2, assigned_by = $3 WHERE user_id = $4',
          [role, scope || null, user_id, id]
        );
      } else {
        await db.query(
          'INSERT INTO user_roles (user_id, role_type, scope, assigned_by) VALUES ($1, $2, $3, $4)',
          [id, role, scope || null, user_id]
        );
      }
    }

    res.json({ message: `User role updated to ${role}` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  const { user_id } = req.user; // From JWT token
  const { firstName, lastName, username, gamerTag, bio, platform } = req.body;

  try {
    // Update users table with username
    if (username) {
      await db.query(
        'UPDATE users SET username = $1 WHERE user_id = $2',
        [username, user_id]
      );
    }

    // Update player_profile table
    await db.query(
      `UPDATE player_profile 
       SET first_name = $1, last_name = $2, gamer_tag = $3, bio = $4, platform = $5
       WHERE user_id = $6`,
      [firstName, lastName, gamerTag, bio, platform, user_id]
    );

    // Return updated profile
    const result = await db.query(
      'SELECT * FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    res.json({
      message: 'Profile updated successfully',
      profile: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

module.exports = {
  getAllUsers,
  updateUserRole,
  updateProfile
};
