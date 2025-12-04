const db = require('../config/db');

// Submit lineup
const submitLineup = async (req, res) => {
  const { fixture_id, team_id, formation, starting_11, substitutes, captain_id } = req.body;
  const { user_id } = req.user;

  try {
    // Check if fixture exists and is not locked
    const fixtureCheck = await db.query(
      'SELECT * FROM match_fixtures WHERE fixture_id = $1',
      [fixture_id]
    );

    if (fixtureCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    const fixture = fixtureCheck.rows[0];
    const matchDate = new Date(fixture.match_date);
    const now = new Date();
    const thirtyMinsBefore = new Date(matchDate.getTime() - 30 * 60000);

    // Check if we're within 30 mins of match
    if (now >= thirtyMinsBefore) {
      return res.status(400).json({ 
        message: 'Lineup submission closed. Match starts in less than 30 minutes.' 
      });
    }

    // Validate starting_11 has at least 2 players (rest will be filled with AI)
    if (!starting_11 || starting_11.length < 2) {
      return res.status(400).json({ message: 'Starting lineup must have at least 2 players' });
    }

    // Fill remaining positions with AI players if less than 11
    let finalStarting11 = starting_11;
    if (starting_11.length < 11) {
      // Get AI players to fill remaining slots
      const aiPlayers = await db.query(
        `SELECT u.user_id as player_id, pp.first_name, pp.last_name, pp.jersey_number, pp.preferred_positions
         FROM users u
         JOIN player_profile pp ON u.user_id = pp.user_id
         WHERE pp.gamer_tag LIKE 'AI%' 
         ORDER BY RANDOM()
         LIMIT ${11 - starting_11.length}`
      );

      // Add AI players to complete the lineup
      finalStarting11 = [...starting_11, ...aiPlayers.rows.map(ai => ({
        player_id: ai.player_id,
        first_name: ai.first_name,
        last_name: ai.last_name,
        jersey_number: ai.jersey_number,
        preferred_positions: ai.preferred_positions,
        is_ai: true
      }))];
    }

    // Check if lineup already exists
    const existingLineup = await db.query(
      'SELECT * FROM match_lineups WHERE match_id = $1 AND team_id = $2',
      [fixture_id, team_id]
    );

    let result;
    if (existingLineup.rows.length > 0) {
      // Update existing lineup
      result = await db.query(
        `UPDATE match_lineups 
         SET formation = $1, starting_11 = $2, substitutes = $3, captain_id = $4, 
             submitted_by = $5, submitted_at = NOW(), updated_at = NOW()
         WHERE match_id = $6 AND team_id = $7
         RETURNING *`,
        [formation, JSON.stringify(finalStarting11), JSON.stringify(substitutes || []), 
         captain_id, user_id, fixture_id, team_id]
      );
    } else {
      // Create new lineup
      result = await db.query(
        `INSERT INTO match_lineups 
         (match_id, team_id, formation, starting_11, substitutes, captain_id, submitted_by, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [fixture_id, team_id, formation, JSON.stringify(finalStarting11), 
         JSON.stringify(substitutes || []), captain_id, user_id]
      );
    }

    res.status(200).json({
      message: 'Lineup submitted successfully',
      lineup: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit lineup' });
  }
};

// Get match lineups
const getMatchLineups = async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        l.*,
        t.name as team_name,
        t.crest_url as team_crest,
        f.home_team_id,
        f.away_team_id
      FROM match_lineups l
      JOIN team_profile t ON l.team_id = t.team_id
      JOIN match_fixtures f ON l.fixture_id = f.fixture_id
      WHERE l.fixture_id = $1`,
      [fixtureId]
    );

    const lineups = result.rows;
    
    // Separate home and away lineups
    const homeLineup = lineups.find(l => l.team_id === l.home_team_id);
    const awayLineup = lineups.find(l => l.team_id === l.away_team_id);

    res.json({
      home_lineup: homeLineup || null,
      away_lineup: awayLineup || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch lineups' });
  }
};

// Get team's lineup for a fixture
const getTeamLineup = async (req, res) => {
  const { fixtureId, teamId } = req.params;

  try {
    const result = await db.query(
      `SELECT l.*, t.name as team_name, t.crest_url as team_crest
       FROM match_lineups l
       JOIN team_profile t ON l.team_id = t.team_id
       WHERE l.match_id = $1 AND l.team_id = $2`,
      [fixtureId, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lineup not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch lineup' });
  }
};

// Lock lineup (auto-locks 30 mins before match)
const lockLineup = async (req, res) => {
  const { lineupId } = req.params;

  try {
    const result = await db.query(
      `UPDATE match_lineups 
       SET locked = TRUE, locked_at = NOW()
       WHERE lineup_id = $1
       RETURNING *`,
      [lineupId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lineup not found' });
    }

    res.json({
      message: 'Lineup locked successfully',
      lineup: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to lock lineup' });
  }
};

// Delete lineup
const deleteLineup = async (req, res) => {
  const { lineupId } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM match_lineups WHERE lineup_id = $1 RETURNING *',
      [lineupId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lineup not found' });
    }

    res.json({ message: 'Lineup deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete lineup' });
  }
};

// Get team roster (available players for lineup)
const getTeamRoster = async (req, res) => {
  const { teamId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        pp.player_id,
        pp.first_name,
        pp.last_name,
        pp.gamer_tag,
        pp.avatar_url,
        pp.preferred_positions,
        pp.jersey_number,
        pta.role_in_team
      FROM player_profile pp
      JOIN player_team_assignments pta ON pp.player_id = pta.player_id
      WHERE pta.team_id = $1 AND pta.status = 'active'
      ORDER BY pta.role_in_team DESC, pp.last_name ASC`,
      [teamId]
    );

    res.json({
      players: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch team roster' });
  }
};

module.exports = {
  submitLineup,
  getMatchLineups,
  getTeamLineup,
  lockLineup,
  deleteLineup,
  getTeamRoster
};
