const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await db.query(
      'SELECT user_id, email FROM users WHERE user_id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = { user_id: result.rows[0].user_id, email: result.rows[0].email };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      // Check if user has any of the required roles
      const result = await db.query(
        'SELECT role_type FROM user_roles WHERE user_id = $1',
        [req.user.user_id]
      );

      const userRoles = result.rows.map(row => row.role_type);
      const hasRole = roles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({ 
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          userRoles: userRoles
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

module.exports = { protect, authorize };
