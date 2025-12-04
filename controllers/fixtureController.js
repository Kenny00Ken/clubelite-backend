const db = require('../config/db');

// Create a new fixture (manual)
const createFixture = async (req, res) => {
  const { league_id, home_team_id, away_team_id, match_date, match_week, platform, venue } = req.body;
  const { user_id } = req.user;

  try {
    // Validate teams are in the league
    const teamsCheck = await db.query(
      `SELECT team_id FROM team_profile 
       WHERE team_id IN ($1, $2) AND league_id = $3`,
      [home_team_id, away_team_id, league_id]
    );

    if (teamsCheck.rows.length !== 2) {
      return res.status(400).json({ message: 'One or both teams are not in this league' });
    }

    // Check if teams are playing against themselves
    if (home_team_id === away_team_id) {
      return res.status(400).json({ message: 'A team cannot play against itself' });
    }

    // Create fixture
    const result = await db.query(
      `INSERT INTO match_fixtures 
       (league_id, home_team_id, away_team_id, match_date, match_week, platform, venue, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [league_id, home_team_id, away_team_id, match_date, match_week, platform || 'PS5', venue, user_id]
    );

    res.status(201).json({
      message: 'Fixture created successfully',
      fixture: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create fixture' });
  }
};

// Get all fixtures for a league
const getLeagueFixtures = async (req, res) => {
  const { leagueId } = req.params;
  const { status, week } = req.query;

  try {
    let query = `
      SELECT 
        f.*,
        ht.name as home_team_name,
        ht.crest_url as home_team_crest,
        at.name as away_team_name,
        at.crest_url as away_team_crest,
        l.name as league_name
      FROM match_fixtures f
      JOIN team_profile ht ON f.home_team_id = ht.team_id
      JOIN team_profile at ON f.away_team_id = at.team_id
      JOIN league_master l ON f.league_id = l.league_id
      WHERE f.league_id = $1
    `;

    const params = [leagueId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND f.status = $${paramCount}`;
      params.push(status);
    }

    if (week) {
      paramCount++;
      query += ` AND f.match_week = $${paramCount}`;
      params.push(week);
    }

    query += ` ORDER BY f.match_date ASC`;

    const result = await db.query(query, params);

    res.json({
      fixtures: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch fixtures' });
  }
};

// Get fixture by ID
const getFixtureById = async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        f.*,
        ht.name as home_team_name,
        ht.crest_url as home_team_crest,
        ht.colors as home_team_colors,
        at.name as away_team_name,
        at.crest_url as away_team_crest,
        at.colors as away_team_colors,
        l.name as league_name,
        l.region as league_region
      FROM match_fixtures f
      JOIN team_profile ht ON f.home_team_id = ht.team_id
      JOIN team_profile at ON f.away_team_id = at.team_id
      JOIN league_master l ON f.league_id = l.league_id
      WHERE f.fixture_id = $1`,
      [fixtureId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch fixture' });
  }
};

// Update fixture
const updateFixture = async (req, res) => {
  const { fixtureId } = req.params;
  const { match_date, platform, venue, status, home_score, away_score } = req.body;

  try {
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (match_date !== undefined) {
      paramCount++;
      updates.push(`match_date = $${paramCount}`);
      values.push(match_date);
    }
    if (platform !== undefined) {
      paramCount++;
      updates.push(`platform = $${paramCount}`);
      values.push(platform);
    }
    if (venue !== undefined) {
      paramCount++;
      updates.push(`venue = $${paramCount}`);
      values.push(venue);
    }
    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);
    }
    if (home_score !== undefined) {
      paramCount++;
      updates.push(`home_score = $${paramCount}`);
      values.push(home_score);
    }
    if (away_score !== undefined) {
      paramCount++;
      updates.push(`away_score = $${paramCount}`);
      values.push(away_score);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    paramCount++;
    values.push(fixtureId);

    const query = `
      UPDATE match_fixtures 
      SET ${updates.join(', ')}
      WHERE fixture_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    res.json({
      message: 'Fixture updated successfully',
      fixture: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update fixture' });
  }
};

// Delete fixture
const deleteFixture = async (req, res) => {
  const { fixtureId } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM match_fixtures WHERE fixture_id = $1 RETURNING *',
      [fixtureId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    res.json({ message: 'Fixture deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete fixture' });
  }
};

// Auto-generate fixtures (Random Pairing Algorithm)
const generateFixtures = async (req, res) => {
  const { league_id, matches_per_week, platform } = req.body; // Removed start_date
  const { user_id } = req.user;

  try {
    // First verify league exists and get match start time and season start
    const leagueCheck = await db.query(
      'SELECT league_id, name, match_start_time, season_start, match_type FROM league_master WHERE league_id = $1',
      [league_id]
    );


    if (leagueCheck.rows.length === 0) {
      return res.status(404).json({ message: 'League not found' });
    }

    const league = leagueCheck.rows[0];
    const matchStartTime = league.match_start_time || '19:00:00'; // Default to 7 PM
    const seasonStartDate = league.season_start; // Use league's season start date
    const matchType = league.match_type || 'ROUND_ROBIN'; // Get match type from league

    // Delete existing fixtures for this league first
    const deleteResult = await db.query(
      'DELETE FROM match_fixtures WHERE league_id = $1',
      [league_id]
    );

    // Get all teams in the league
    const teamsResult = await db.query(
      `SELECT t.team_id, t.name, tla.approved_by, tla.approved_at
       FROM team_profile t
       JOIN team_league_assignments tla ON t.team_id = tla.team_id
       WHERE tla.league_id = $1 AND t.status = $2 AND tla.status = 'active'`,
      [league_id, 'active']
    );

    const teams = teamsResult.rows;

    if (teams.length < 2) {
      return res.status(400).json({ message: 'Need at least 2 teams to generate fixtures' });
    }

    // Random pairing algorithm - everyone plays each match day
    const fixtures = [];
    const allPairings = [];
    
    // Generate pairings based on match type
    if (matchType === 'SINGLE_ROBIN') {
      // Single round robin: each team plays every other team once
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          allPairings.push({
            team1: teams[i],
            team2: teams[j]
          });
        }
      }
    } else if (matchType === 'ROUND_ROBIN' || matchType === 'DOUBLE_ROBIN') {
      // Double round robin: each team plays every other team twice (home & away)
      // First create the base pairings, then shuffle them, then add reverse fixtures
      const basePairings = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          basePairings.push({
            team1: teams[i],
            team2: teams[j]
          });
        }
      }
      
      // Shuffle the base pairings to randomize which matchups happen first
      const shuffledBase = [...basePairings].sort(() => Math.random() - 0.5);
      
      // Now add both legs for each shuffled pairing
      for (const pairing of shuffledBase) {
        // First leg: team1 plays team2 at home
        allPairings.push({
          team1: pairing.team1,
          team2: pairing.team2
        });
        // Second leg: team2 plays team1 at home (reverse fixture)
        allPairings.push({
          team1: pairing.team2,
          team2: pairing.team1
        });
      }
    } else if (matchType === 'KNOCKOUT') {
      // Simple knockout: generate pairings for first round
      const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffledTeams.length - 1; i += 2) {
        if (i + 1 < shuffledTeams.length) {
          allPairings.push({
            team1: shuffledTeams[i],
            team2: shuffledTeams[i + 1]
          });
        }
      }
    } else {
      // Default to round robin for unknown types
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          allPairings.push({
            team1: teams[i],
            team2: teams[j]
          });
        }
      }
    }
    
    // For single robin and knockout, shuffle the pairings
    // For double robin, they're already properly ordered
    if (matchType === 'SINGLE_ROBIN' || matchType === 'KNOCKOUT') {
      allPairings.sort(() => Math.random() - 0.5);
    }
    
    
    // Calculate how many match days needed
    const matchesPerDay = Math.floor(teams.length / 2);
    const totalMatchDays = Math.ceil(allPairings.length / matchesPerDay);
    
    
    // Schedule matches across days
    let currentDate = new Date(seasonStartDate); // Use league's season start date
    let matchWeek = 1;
    let pairingIndex = 0;
    
    
    for (let day = 0; day < totalMatchDays; day++) {
      const matchesThisDay = [];
      
      // Create matches for this day
      for (let match = 0; match < matchesPerDay && pairingIndex < allPairings.length; match++) {
        const pairing = allPairings[pairingIndex];
        
        // For double robin, use the home/away as defined in the pairing
        // For single robin and knockout, randomly decide home/away
        let homeTeam, awayTeam;
        if (matchType === 'ROUND_ROBIN' || matchType === 'DOUBLE_ROBIN') {
          homeTeam = pairing.team1;
          awayTeam = pairing.team2;
        } else {
          const isHomeFirst = Math.random() < 0.5;
          homeTeam = isHomeFirst ? pairing.team1 : pairing.team2;
          awayTeam = isHomeFirst ? pairing.team2 : pairing.team1;
        }
        
        // Combine date and time for match datetime
        const matchDateTime = new Date(currentDate);
        const [hours, minutes, seconds] = matchStartTime.split(':');
        matchDateTime.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds) || 0);
        
        fixtures.push({
          league_id,
          home_team_id: homeTeam.team_id,
          away_team_id: awayTeam.team_id,
          match_date: matchDateTime,
          match_week: matchWeek,
          platform: platform || 'Playstation',
          created_by: user_id
        });
        
        matchesThisDay.push(`${homeTeam.name} vs ${awayTeam.name} at ${matchStartTime}`);
        pairingIndex++;
      }
      
      
      // Move to next match day (use matches_per_week as days interval)
      currentDate.setDate(currentDate.getDate() + (matches_per_week || 2));
      
      // Increment week every 7 days
      if (currentDate.getDay() < new Date(seasonStartDate).getDay()) {
        matchWeek++;
      }
    }


    // Insert all fixtures
    const insertPromises = fixtures.map(fixture =>
      db.query(
        `INSERT INTO match_fixtures 
         (league_id, home_team_id, away_team_id, match_date, match_week, platform, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [fixture.league_id, fixture.home_team_id, fixture.away_team_id, 
         fixture.match_date, fixture.match_week, fixture.platform, fixture.created_by]
      )
    );

    const results = await Promise.all(insertPromises);

    res.status(201).json({
      message: `Fixtures regenerated successfully! Deleted ${deleteResult.rowCount} old fixtures and created ${results.length} new fixtures.`,
      fixtures: results.map(r => r.rows[0]),
      total: results.length,
      deleted: deleteResult.rowCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate fixtures' });
  }
};

module.exports = {
  createFixture,
  getLeagueFixtures,
  getFixtureById,
  updateFixture,
  deleteFixture,
  generateFixtures
};
