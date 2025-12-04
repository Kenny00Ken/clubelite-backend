const db = require('../config/db');

// Calculate season end date based on random pairing algorithm
const calculateSeasonEndDate = (maxTeams, intervalDays, matchType, startDate) => {
  const start = new Date(startDate);
  
  switch (matchType) {
    case 'SINGLE_ROBIN':
      // Each team plays every other team once
      // Total matches = (n * (n-1)) / 2
      // Matches per day = floor(n / 2) 
      // Days needed = ceil(total matches / matches per day) * interval
      const totalSingleMatches = (maxTeams * (maxTeams - 1)) / 2;
      const matchesPerDay = Math.floor(maxTeams / 2);
      const matchDaysSingle = Math.ceil(totalSingleMatches / matchesPerDay);
      const totalDaysSingle = (matchDaysSingle - 1) * intervalDays; // -1 because first day is start date
      const endSingle = new Date(start);
      endSingle.setDate(start.getDate() + totalDaysSingle);
      return endSingle.toISOString().split('T')[0];
      
    case 'ROUND_ROBIN':
      // Each team plays every other team twice (home & away)
      // Just double the single robin calculation
      const totalDoubleMatches = (maxTeams * (maxTeams - 1)); // Double the single matches
      const matchesPerDayDouble = Math.floor(maxTeams / 2);
      const matchDaysDouble = Math.ceil(totalDoubleMatches / matchesPerDayDouble);
      const totalDaysDouble = (matchDaysDouble - 1) * intervalDays;
      const endDouble = new Date(start);
      endDouble.setDate(start.getDate() + totalDaysDouble);
      return endDouble.toISOString().split('T')[0];
      
    case 'KNOCKOUT':
      // Simple knockout bracket
      const knockoutRounds = Math.ceil(Math.log2(maxTeams));
      const totalKnockoutDays = knockoutRounds * intervalDays;
      const endKnockout = new Date(start);
      endKnockout.setDate(start.getDate() + totalKnockoutDays);
      return endKnockout.toISOString().split('T')[0];
      
    default:
      // Default to single robin
      const endDefault = new Date(start);
      endDefault.setDate(start.getDate() + 30); // 1 month default
      return endDefault.toISOString().split('T')[0];
  }
};

// Create a new league (Governor only)
const createLeague = async (req, res) => {
  const {
    name,
    region,
    season,
    description,
    season_start,
    season_end,
    prize_pool_etl = 0,
    max_teams = 12,
    match_interval_days = 2,
    match_type = 'ROUND_ROBIN',
    match_start_time = '19:00:00' // Default 7 PM
  } = req.body;

  const { user_id } = req.user; // From JWT middleware

  try {
    // Generate league ID
    const league_id = `CEG-LG-${Date.now()}`;

    // Calculate season end if not provided
    let calculatedSeasonEnd = season_end;
    if (!calculatedSeasonEnd && season_start) {
      const start = new Date(season_start);
      const end = new Date(start);
      // Add 10 days for a typical season (can be adjusted)
      end.setDate(start.getDate() + 10);
      calculatedSeasonEnd = end.toISOString().split('T')[0];
    }


    // Insert league (removed league_type column)
    const result = await db.query(
      `INSERT INTO league_master (
        league_id, name, region, season, description,
        created_by, governor_id, status, season_start, season_end,
        prize_pool_etl, max_teams, match_interval_days, match_type, match_start_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        league_id, name, region, season, description,
        user_id, user_id, 'draft', season_start, calculatedSeasonEnd,
        prize_pool_etl, max_teams, match_interval_days, match_type, match_start_time
      ]
    );

    // Create League Chat Room
    await db.query(
      `INSERT INTO chat_rooms (room_id, room_type, league_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (room_id) DO NOTHING`,
      [
        `league_${league_id}`, // room_id: "league_CEG-LG-1234567890"
        'league',              // room_type
        league_id,             // league_id
        `${name} Chat`,        // name: "Pro League Chat"
        `Chat room for ${name} participants`, // description
        user_id                // created_by
      ]
    );


    res.status(201).json({
      message: 'League created successfully',
      league: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create league', error: error.message });
  }
};

// Get all leagues
const getAllLeagues = async (req, res) => {
  try {
    const { status, region } = req.query;

    let query = `
      SELECT 
        l.*,
        u.email as governor_email,
        (SELECT COUNT(*) FROM team_league_assignments WHERE league_id = l.league_id AND status = 'active') as team_count
      FROM league_master l
      LEFT JOIN users u ON l.governor_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND l.status = $${params.length}`;
    }

    if (region) {
      params.push(region);
      query += ` AND l.region = $${params.length}`;
    }

    query += ` ORDER BY l.created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      leagues: result.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch leagues', error: error.message });
  }
};

// Get league by ID
const getLeagueById = async (req, res) => {
  const { id } = req.params;

  try {
    const leagueResult = await db.query(
      `SELECT 
        l.*,
        u.email as governor_email,
        pp.first_name as governor_first_name,
        pp.last_name as governor_last_name,
        (SELECT COUNT(*) FROM team_league_assignments WHERE league_id = l.league_id AND status = 'active') as team_count
      FROM league_master l
      LEFT JOIN users u ON l.governor_id = u.user_id
      LEFT JOIN player_profile pp ON u.user_id = pp.user_id
      WHERE l.league_id = $1`,
      [id]
    );

    if (leagueResult.rows.length === 0) {
      return res.status(404).json({ message: 'League not found' });
    }

    // Get teams in league
    const teamsResult = await db.query(
      `SELECT 
        t.*,
        (SELECT COUNT(*) FROM player_team_assignments WHERE team_id = t.team_id AND status = 'active') as player_count
      FROM team_profile t
      JOIN team_league_assignments tla ON t.team_id = tla.team_id
      WHERE tla.league_id = $1
      ORDER BY t.created_at`,
      [id]
    );

    // Get match stats
    const statsResult = await db.query(
      `SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_matches,
        SUM(home_score + away_score) as total_goals
      FROM match_fixtures
      WHERE league_id = $1`,
      [id]
    );

    res.json({
      league: leagueResult.rows[0],
      teams: teamsResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch league', error: error.message });
  }
};

// Activate league (Governor only)
const activateLeague = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is the governor of this league
    const leagueCheck = await db.query(
      `SELECT * FROM league_master WHERE league_id = $1 AND governor_id = $2`,
      [id, user_id]
    );

    if (leagueCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only the league governor can activate this league' });
    }

    // Update status to active
    const result = await db.query(
      `UPDATE league_master 
       SET status = 'active', approved_by = $1
       WHERE league_id = $2
       RETURNING *`,
      [user_id, id]
    );

    res.json({
      message: 'League activated successfully',
      league: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to activate league', error: error.message });
  }
};

// Get teams in a league
const getLeagueTeams = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        t.*,
        (SELECT COUNT(*) FROM player_team_assignments WHERE team_id = t.team_id AND status = 'active') as player_count,
        (SELECT COUNT(*) FROM match_fixtures WHERE (home_team_id = t.team_id OR away_team_id = t.team_id) AND status = 'completed') as matches_played
      FROM team_profile t
      JOIN team_league_assignments tla ON t.team_id = tla.team_id
      WHERE tla.league_id = $1
      ORDER BY t.created_at`,
      [id]
    );

    res.json({
      teams: result.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch teams', error: error.message });
  }
};

// Get league standings
const getLeagueStandings = async (req, res) => {
  const { id } = req.params;

  try {
    // Get all teams in league with match statistics
    const result = await db.query(
      `SELECT 
        t.team_id,
        t.name,
        t.crest_url,
        COUNT(DISTINCT m.fixture_id) as played,
        SUM(CASE 
          WHEN (m.home_team_id = t.team_id AND m.home_score > m.away_score) OR
               (m.away_team_id = t.team_id AND m.away_score > m.home_score)
          THEN 1 ELSE 0 
        END) as won,
        SUM(CASE 
          WHEN m.home_score = m.away_score AND m.status = 'completed'
          THEN 1 ELSE 0 
        END) as drawn,
        SUM(CASE 
          WHEN (m.home_team_id = t.team_id AND m.home_score < m.away_score) OR
               (m.away_team_id = t.team_id AND m.away_score < m.home_score)
          THEN 1 ELSE 0 
        END) as lost,
        SUM(CASE 
          WHEN m.home_team_id = t.team_id THEN COALESCE(m.home_score, 0)
          WHEN m.away_team_id = t.team_id THEN COALESCE(m.away_score, 0)
          ELSE 0
        END) as goals_for,
        SUM(CASE 
          WHEN m.home_team_id = t.team_id THEN COALESCE(m.away_score, 0)
          WHEN m.away_team_id = t.team_id THEN COALESCE(m.home_score, 0)
          ELSE 0
        END) as goals_against
      FROM team_profile t
      JOIN team_league_assignments tla ON t.team_id = tla.team_id
      LEFT JOIN match_fixtures m ON (
        (m.home_team_id = t.team_id OR m.away_team_id = t.team_id) 
        AND m.status = 'completed'
        AND m.league_id = $1
      )
      WHERE tla.league_id = $1
      GROUP BY t.team_id, t.name, t.crest_url`,
      [id]
    );

    // Calculate points and goal difference
    const standings = result.rows.map(team => {
      const won = parseInt(team.won) || 0;
      const drawn = parseInt(team.drawn) || 0;
      const goalsFor = parseInt(team.goals_for) || 0;
      const goalsAgainst = parseInt(team.goals_against) || 0;
      
      return {
        team_id: team.team_id,
        name: team.name,
        crest_url: team.crest_url,
        played: parseInt(team.played) || 0,
        won,
        drawn,
        lost: parseInt(team.lost) || 0,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst,
        points: (won * 3) + (drawn * 1)
      };
    });

    // Sort by points DESC, then goal difference DESC, then goals for DESC
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    // Add rank
    const rankedStandings = standings.map((team, index) => ({
      rank: index + 1,
      ...team
    }));

    // Get recent form (last 5 matches) for each team
    for (const team of rankedStandings) {
      const formResult = await db.query(
        `SELECT 
          CASE 
            WHEN (m.home_team_id = $1 AND m.home_score > m.away_score) OR
                 (m.away_team_id = $1 AND m.away_score > m.home_score)
            THEN 'W'
            WHEN m.home_score = m.away_score THEN 'D'
            ELSE 'L'
          END as result
        FROM match_fixtures m
        WHERE (m.home_team_id = $1 OR m.away_team_id = $1)
          AND m.status = 'completed'
          AND m.league_id = $2
        ORDER BY m.match_date DESC
        LIMIT 5`,
        [team.team_id, id]
      );
      
      team.form = formResult.rows.map(r => r.result).reverse();
    }

    res.json({
      standings: rankedStandings
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch standings', error: error.message });
  }
};

// Update league (Governor only)
const updateLeague = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    region,
    season,
    description,
    season_start,
    season_end,
    prize_pool_etl,
    max_teams,
    match_interval_days,
    match_type,
    match_start_time,
    status  // Add status field
  } = req.body;

  const { user_id } = req.user; // From JWT middleware

  try {
    // Check if user is the governor of this league
    const leagueCheck = await db.query(
      `SELECT * FROM league_master WHERE league_id = $1 AND governor_id = $2`,
      [id, user_id]
    );

    if (leagueCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only the league governor can update this league' });
    }

    const currentLeague = leagueCheck.rows[0];

    // Check if status is being changed to 'completed'
    const isCompletingLeague = status === 'completed' && currentLeague.status !== 'completed';

    // Start transaction for status change cleanup
    if (isCompletingLeague) {
      await db.query('BEGIN');
    }

    // Update league
    const result = await db.query(
      `UPDATE league_master 
       SET name = $1, region = $2, season = $3, description = $4,
           season_start = $5, season_end = $6, prize_pool_etl = $7,
           max_teams = $8, match_interval_days = $9, match_type = $10, match_start_time = $11,
           status = $12
       WHERE league_id = $13
       RETURNING *`,
      [name, region, season, description, season_start, season_end,
       prize_pool_etl, max_teams, match_interval_days, match_type, match_start_time, status, id]
    );

    // If league is being completed, clean up chat room and messages
    if (isCompletingLeague) {
      const leagueRoomId = `league_${id}`;
      
      
      // Delete all messages for the league chat room
      await db.query(
        'DELETE FROM chat_messages WHERE room_id = $1',
        [leagueRoomId]
      );
      
      // Delete the league chat room
      await db.query(
        'DELETE FROM chat_rooms WHERE room_id = $1',
        [leagueRoomId]
      );
      
      
      await db.query('COMMIT');
    }

    res.json({
      message: status === 'completed' ? 'League completed and chat room cleaned up successfully' : 'League updated successfully',
      league: result.rows[0]
    });
  } catch (error) {
    // If we started a transaction, roll it back
    if (req.body.status === 'completed') {
      await db.query('ROLLBACK');
    }
    res.status(500).json({ message: 'Failed to update league', error: error.message });
  }
};

// Delete league (Governor only, draft leagues only)
const deleteLeague = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is the governor of this league
    const leagueCheck = await db.query(
      `SELECT * FROM league_master WHERE league_id = $1 AND governor_id = $2`,
      [id, user_id]
    );

    if (leagueCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only the league governor can delete this league' });
    }

    const league = leagueCheck.rows[0];

    // Check if league is in draft status
    if (league.status !== 'draft') {
      return res.status(403).json({ message: 'Only draft leagues can be deleted' });
    }

    // Check if there are any teams in the league
    const teamsCheck = await db.query(
      'SELECT COUNT(*) as team_count FROM team_league_assignments WHERE league_id = $1 AND status = \'active\'',
      [id]
    );

    if (parseInt(teamsCheck.rows[0].team_count) > 0) {
      return res.status(403).json({ message: 'Cannot delete league with registered teams' });
    }

    // Delete the league
    await db.query('DELETE FROM league_master WHERE league_id = $1', [id]);

    res.json({
      message: 'League deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete league', error: error.message });
  }
};

// Get team applications for a league
const getTeamApplications = async (req, res) => {
  const { league_id } = req.params;
  const { user_id } = req.user;

  try {
    // Get team applications with team details
    const result = await db.query(
      `SELECT 
        tla.team_id,
        tla.league_id,
        tla.status,
        tla.joined_at,
        tla.approved_by,
        tla.approved_at,
        tp.name as team_name,
        tp.crest_url,
        tp.platform,
        tp.server_region,
        u.username as owner_username,
        u.email as owner_email
       FROM team_league_assignments tla
       JOIN team_profile tp ON tla.team_id = tp.team_id
       JOIN users u ON tp.created_by = u.user_id
       WHERE tla.league_id = $1 AND tla.status = 'pending'
       ORDER BY tla.joined_at DESC`,
      [league_id]
    );

    res.json({ applications: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch team applications', error: error.message });
  }
};

module.exports = {
  createLeague,
  getAllLeagues,
  getLeagueById,
  updateLeague,
  deleteLeague,
  activateLeague,
  getLeagueTeams,
  getLeagueStandings,
  getTeamApplications
};
