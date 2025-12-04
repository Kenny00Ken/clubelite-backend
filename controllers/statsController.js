const db = require('../config/db');

// Submit match stats
const submitStats = async (req, res) => {
  const { fixture_id, team_id, player_stats, final_score } = req.body;
  const { user_id } = req.user;

  try {
    // Check if fixture exists
    const fixtureCheck = await db.query(
      'SELECT * FROM match_fixtures WHERE fixture_id = $1',
      [fixture_id]
    );

    if (fixtureCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    // Update fixture score if provided
    if (final_score) {
      await db.query(
        `UPDATE match_fixtures 
         SET home_score = $1, away_score = $2, status = 'completed'
         WHERE fixture_id = $3`,
        [final_score.home, final_score.away, fixture_id]
      );
    }

    // Insert stats for each player
    const insertPromises = player_stats.map(stat =>
      db.query(
        `INSERT INTO match_stats 
         (fixture_id, player_id, team_id, goals, assists, saves, clean_sheet, 
          yellow_cards, red_cards, minutes_played, is_mvp, submitted_by, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (fixture_id, player_id) 
         DO UPDATE SET 
           goals = $4, assists = $5, saves = $6, clean_sheet = $7,
           yellow_cards = $8, red_cards = $9, minutes_played = $10, 
           is_mvp = $11, submitted_by = $12, submitted_at = NOW()
         RETURNING *`,
        [
          fixture_id,
          stat.player_id,
          team_id,
          stat.goals || 0,
          stat.assists || 0,
          stat.saves || 0,
          stat.clean_sheet || false,
          stat.yellow_cards || 0,
          stat.red_cards || 0,
          stat.minutes_played || 90,
          stat.is_mvp || false,
          user_id
        ]
      )
    );

    const results = await Promise.all(insertPromises);

    res.status(200).json({
      message: 'Stats submitted successfully',
      stats: results.map(r => r.rows[0])
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit stats' });
  }
};

// Get match stats
const getMatchStats = async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        s.*,
        p.first_name,
        p.last_name,
        p.gamer_tag,
        p.avatar_url,
        t.name as team_name
      FROM match_stats s
      JOIN player_profile p ON s.player_id = p.player_id
      JOIN team_profile t ON s.team_id = t.team_id
      WHERE s.fixture_id = $1
      ORDER BY s.team_id, s.goals DESC`,
      [fixtureId]
    );

    res.json({
      stats: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

// Get player stats for a fixture
const getPlayerStats = async (req, res) => {
  const { fixtureId, playerId } = req.params;

  try {
    const result = await db.query(
      `SELECT s.*, p.first_name, p.last_name, p.gamer_tag
       FROM match_stats s
       JOIN player_profile p ON s.player_id = p.player_id
       WHERE s.fixture_id = $1 AND s.player_id = $2`,
      [fixtureId, playerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Stats not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch player stats' });
  }
};

// Approve stats (Admin/Governor)
const approveStats = async (req, res) => {
  const { fixtureId } = req.params;
  const { approved, notes } = req.body;
  const { user_id } = req.user;

  try {
    const status = approved ? 'approved' : 'rejected';
    
    const result = await db.query(
      `UPDATE match_stats 
       SET status = $1, approved_by = $2, approved_at = NOW()
       WHERE fixture_id = $3
       RETURNING *`,
      [status, user_id, fixtureId]
    );

    res.json({
      message: `Stats ${status} successfully`,
      stats: result.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve stats' });
  }
};

// Get pending stats (for approval)
const getPendingStats = async (req, res) => {
  const { leagueId } = req.query;

  try {
    let query = `
      SELECT 
        f.fixture_id,
        f.match_date,
        f.home_score,
        f.away_score,
        ht.name as home_team_name,
        at.name as away_team_name,
        COUNT(s.stats_id) as total_stats
      FROM match_fixtures f
      JOIN team_profile ht ON f.home_team_id = ht.team_id
      JOIN team_profile at ON f.away_team_id = at.team_id
      LEFT JOIN match_stats s ON f.fixture_id = s.fixture_id AND s.status = 'pending'
      WHERE f.status = 'completed'
    `;

    const params = [];
    if (leagueId) {
      params.push(leagueId);
      query += ` AND f.league_id = $1`;
    }

    query += `
      GROUP BY f.fixture_id, f.match_date, f.home_score, f.away_score, 
               ht.name, at.name
      HAVING COUNT(s.stats_id) > 0
      ORDER BY f.match_date DESC
    `;

    const result = await db.query(query, params);

    res.json({
      fixtures: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch pending stats' });
  }
};

// Delete stats
const deleteStats = async (req, res) => {
  const { statsId } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM match_stats WHERE stats_id = $1 RETURNING *',
      [statsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Stats not found' });
    }

    res.json({ message: 'Stats deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete stats' });
  }
};

module.exports = {
  submitStats,
  getMatchStats,
  getPlayerStats,
  approveStats,
  getPendingStats,
  deleteStats
};
