const db = require('../config/db');

// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
  try {
    // 1. Get Counts
    const userCount = await db.query('SELECT COUNT(*) FROM users');
    const teamCount = await db.query('SELECT COUNT(*) FROM team_profile');
    const leagueCount = await db.query('SELECT COUNT(*) FROM league_master WHERE status = $1', ['active']);
    
    // 2. Get Pending Events (Mock for now, or real if table exists)
    // For MVP, we'll return 0 pending if no table yet
    let pendingCount = 0;
    try {
      const pending = await db.query('SELECT COUNT(*) FROM match_events WHERE status = $1', ['pending']);
      pendingCount = parseInt(pending.rows[0].count);
    } catch (e) {
      // Table might not exist yet
    }

    res.json({
      activeUsers: parseInt(userCount.rows[0].count),
      totalTeams: parseInt(teamCount.rows[0].count),
      activeLeagues: parseInt(leagueCount.rows[0].count),
      pendingEvents: pendingCount,
      etlDistributed: 245890 // Hardcoded for MVP demo
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch admin stats' });
  }
};

module.exports = {
  getDashboardStats
};
