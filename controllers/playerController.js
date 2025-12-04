const db = require('../config/db');

// Get player profile and basic stats
const getPlayerProfile = async (req, res) => {
  const { userId } = req.params;

  try {
    const query = `
      SELECT 
        p.player_id,
        p.user_id,
        p.first_name,
        p.last_name,
        p.gamer_tag,
        p.avatar_url,
        p.bio,
        p.date_of_birth,
        p.nationality,
        p.preferred_positions,
        p.etl_wallet_id,
        w.balance as wallet_balance
      FROM player_profile p
      LEFT JOIN etl_wallet w ON p.etl_wallet_id = w.wallet_id
      WHERE p.user_id = $1
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get player statistics
const getPlayerStats = async (req, res) => {
  const { playerId } = req.params;

  try {
    // Get match stats from existing match_stats table
    const statsQuery = `
      SELECT 
        COUNT(*) as total_matches,
        COALESCE(SUM(goals), 0) as goals,
        COALESCE(SUM(assists), 0) as assists,
        COALESCE(SUM(CASE WHEN clean_sheet = true THEN 1 ELSE 0 END), 0) as clean_sheets,
        COALESCE(SUM(yellow_cards), 0) as yellow_cards,
        COALESCE(SUM(red_cards), 0) as red_cards,
        COALESCE(SUM(CASE WHEN is_mvp = true THEN 1 ELSE 0 END), 0) as mvp_awards,
        COALESCE(SUM(saves), 0) as saves
      FROM match_stats 
      WHERE player_id = $1 AND status = 'approved'
    `;

    const statsResult = await db.query(statsQuery, [playerId]);
    const stats = statsResult.rows[0];

    // Calculate player rating (simplified formula)
    const totalMatches = parseInt(stats.total_matches) || 1;
    const goals = parseInt(stats.goals) || 0;
    const assists = parseInt(stats.assists) || 0;
    const mvps = parseInt(stats.mvp_awards) || 0;
    
    // Rating formula: base 5.0 + (goals * 0.1) + (assists * 0.07) + (mvps * 0.5)
    const playerRating = Math.min(10, 5.0 + ((goals * 0.1) + (assists * 0.07) + (mvps * 0.5)) / totalMatches);

    res.json({
      total_matches: parseInt(stats.total_matches) || 0,
      goals: parseInt(stats.goals) || 0,
      assists: parseInt(stats.assists) || 0,
      clean_sheets: parseInt(stats.clean_sheets) || 0,
      yellow_cards: parseInt(stats.yellow_cards) || 0,
      red_cards: parseInt(stats.red_cards) || 0,
      mvp_awards: parseInt(stats.mvp_awards) || 0,
      saves: parseInt(stats.saves) || 0,
      player_rating: playerRating.toFixed(1)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get player's team assignments
const getPlayerTeams = async (req, res) => {
  const { playerId } = req.params;

  try {
    const query = `
      SELECT 
        t.team_id,
        t.name as team_name,
        t.crest_url,
        t.colors,
        pta.role_in_team,
        pta.jersey_number,
        pta.status,
        l.name as league_name,
        l.region,
        l.league_id
      FROM player_team_assignments pta
      JOIN team_profile t ON pta.team_id = t.team_id
      JOIN team_league_assignments tla ON t.team_id = tla.team_id
      JOIN league_master l ON tla.league_id = l.league_id
      WHERE pta.player_id = $1 
        AND pta.status = 'active'
        AND tla.status = 'active'
      ORDER BY tla.joined_at DESC, pta.joined_at DESC
    `;

    const result = await db.query(query, [playerId]);

    res.json({ teams: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get player's match history
const getPlayerMatches = async (req, res) => {
  const { playerId } = req.params;
  const limit = parseInt(req.query.limit) || 5;

  try {
    // Get upcoming matches
    const upcomingQuery = `
      SELECT DISTINCT
        m.match_id,
        m.match_date,
        m.status,
        home.name as home_team,
        home.team_id as home_team_id,
        home.crest_url as home_crest,
        away.name as away_team,
        away.team_id as away_team_id,
        away.crest_url as away_crest,
        l.name as league_name
      FROM match_master m
      JOIN team_profile home ON m.home_team_id = home.team_id
      JOIN team_profile away ON m.away_team_id = away.team_id
      JOIN league_master l ON m.league_id = l.league_id
      JOIN player_team_assignments pta ON (pta.team_id = home.team_id OR pta.team_id = away.team_id)
      WHERE pta.player_id = $1
        AND m.match_date > NOW()
        AND m.status IN ('scheduled', 'lineups_pending')
      ORDER BY m.match_date ASC
      LIMIT $2
    `;

    const upcomingResult = await db.query(upcomingQuery, [playerId, limit]);

    // Get recent completed matches
    const recentQuery = `
      SELECT DISTINCT
        m.match_id,
        m.match_date,
        m.home_score,
        m.away_score,
        m.status,
        home.name as home_team,
        home.team_id as home_team_id,
        away.name as away_team,
        away.team_id as away_team_id,
        l.name as league_name,
        pta.team_id as player_team_id,
        (SELECT COUNT(*) FROM match_event_approved WHERE match_id = m.match_id AND player_id = $1 AND event_type = 'GOAL') as player_goals,
        (SELECT COUNT(*) FROM match_event_approved WHERE match_id = m.match_id AND player_id = $1 AND event_type = 'ASSIST') as player_assists
      FROM match_master m
      JOIN team_profile home ON m.home_team_id = home.team_id
      JOIN team_profile away ON m.away_team_id = away.team_id
      JOIN league_master l ON m.league_id = l.league_id
      JOIN player_team_assignments pta ON (pta.team_id = home.team_id OR pta.team_id = away.team_id)
      WHERE pta.player_id = $1
        AND m.status = 'completed'
        AND m.match_date <= NOW()
      ORDER BY m.match_date DESC
      LIMIT $2
    `;

    const recentResult = await db.query(recentQuery, [playerId, limit]);

    // Process recent matches to add result and opponent info
    const recentMatches = recentResult.rows.map(match => {
      const isHome = match.player_team_id === match.home_team_id;
      const playerTeamScore = isHome ? match.home_score : match.away_score;
      const opponentScore = isHome ? match.away_score : match.home_score;
      const opponent = isHome ? match.away_team : match.home_team;
      
      let result = 'draw';
      if (playerTeamScore > opponentScore) result = 'win';
      if (playerTeamScore < opponentScore) result = 'loss';

      return {
        match_id: match.match_id,
        match_date: match.match_date,
        result,
        score: `${playerTeamScore}-${opponentScore}`,
        opponent,
        player_goals: parseInt(match.player_goals) || 0,
        player_assists: parseInt(match.player_assists) || 0,
        league_name: match.league_name
      };
    });

    res.json({
      upcoming: upcomingResult.rows,
      recent: recentMatches
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getPlayerProfile,
  getPlayerStats,
  getPlayerTeams,
  getPlayerMatches
};
