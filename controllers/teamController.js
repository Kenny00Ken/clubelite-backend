const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// Create a new team
const createTeam = async (req, res) => {
  const { name, crest_url, colors, platform, description, team_size, server_region } = req.body;
  const { user_id } = req.user;


  try {
    // Check if user has a player profile first
    const playerCheck = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerCheck.rows.length === 0) {
      return res.status(400).json({ message: 'You must create a player profile before creating a team' });
    }


    // Check if user already owns a team (optional restriction, can be removed)
    const existingTeam = await db.query(
      'SELECT * FROM team_profile WHERE created_by = $1',
      [user_id]
    );

    if (existingTeam.rows.length > 0) {
      // For now, allow multiple teams, but maybe warn? 
      // Or restrict to 1 team per user for MVP? 
      // Let's allow multiple for now.
    }

    const team_id = `CEG-TM-${Date.now()}`;

    // Start transaction
    await db.query('BEGIN');

    // 1. Create Team
    const teamResult = await db.query(
      `INSERT INTO team_profile (
        team_id, name, crest_url, colors, platform, 
        description, team_size, server_region,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
      RETURNING *`,
      [team_id, name, crest_url, colors, platform, description, team_size, server_region, user_id]
    );


    // 2. Assign Creator as Owner & Player
    await db.query(
      `INSERT INTO player_team_assignments (
        player_id, team_id, role_in_team, status, assigned_by
      ) VALUES (
        (SELECT player_id FROM player_profile WHERE user_id = $1),
        $2, 'owner', 'active', $1
      )`,
      [user_id, team_id]
    );


    // 3. Create Team Chat Room
    await db.query(
      `INSERT INTO chat_rooms (room_id, room_type, team_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (room_id) DO NOTHING`,
      [
        `team_${team_id}`,  // room_id: "team_123"
        'team',            // room_type
        team_id,           // team_id
        `${name} Chat`,    // name: "Team Alpha Chat"
        `Chat room for ${name} members`, // description
        user_id            // created_by
      ]
    );


    await db.query('COMMIT');

    res.status(201).json({
      message: 'Team created successfully',
      team: teamResult.rows[0]
    });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ message: 'Failed to create team', error: error.message });
  }
};

// Get all teams for authenticated user
// Get all teams user is a member of (not just owner)
const getUserTeams = async (req, res) => {
  try {
    const { user_id } = req.user;
    
    const result = await db.query(`
      SELECT 
        t.*,
        u.username as owner_username,
        pta.role_in_team,
        pta.joined_at,
        (SELECT COUNT(*) FROM player_team_assignments WHERE team_id = t.team_id AND status = 'active') as player_count,
        (SELECT JSON_AGG(
          json_build_object(
            'league_id', l.league_id,
            'name', l.name,
            'status', tla.status,
            'joined_at', tla.joined_at,
            'approved_by', tla.approved_by,
            'approved_at', tla.approved_at
          )
        ) FROM team_league_assignments tla 
         JOIN league_master l ON tla.league_id = l.league_id 
         WHERE tla.team_id = t.team_id AND (tla.status = 'active' OR tla.status = 'pending')
        ) as leagues
      FROM team_profile t
      LEFT JOIN users u ON t.created_by = u.user_id
      JOIN player_team_assignments pta ON t.team_id = pta.team_id
      JOIN player_profile pp ON pta.player_id = pp.player_id
      WHERE pp.user_id = $1 AND pta.status = 'active'
      ORDER BY pta.joined_at DESC
    `, [user_id]);

    res.json({ teams: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user teams', error: error.message });
  }
};

const getAllTeams = async (req, res) => {
  try {
    const { user_id } = req.user;
    
    const result = await db.query(`
      SELECT 
        t.*,
        u.username as owner_username,
        (SELECT COUNT(*) FROM player_team_assignments WHERE team_id = t.team_id AND status = 'active') as player_count,
        (SELECT JSON_AGG(
          json_build_object(
            'league_id', l.league_id,
            'name', l.name,
            'status', tla.status,
            'joined_at', tla.joined_at,
            'approved_by', tla.approved_by,
            'approved_at', tla.approved_at
          )
        ) FROM team_league_assignments tla 
         JOIN league_master l ON tla.league_id = l.league_id 
         WHERE tla.team_id = t.team_id AND (tla.status = 'active' OR tla.status = 'pending')
        ) as leagues
      FROM team_profile t
      LEFT JOIN users u ON t.created_by = u.user_id
      WHERE t.created_by = $1
      ORDER BY t.created_at DESC
    `, [user_id]);

    res.json({ teams: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch teams', error: error.message });
  }
};

// Browse teams (public directory - limited info for security)
const browseTeams = async (req, res) => {
  try {
    const { platform, server, league } = req.query;
    const { user_id } = req.user; // Get current user ID
    
    // First get the player_id for this user
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );
    
    if (playerResult.rows.length === 0) {
      // User has no player profile, show all teams
      var player_id = null;
    } else {
      var player_id = playerResult.rows[0].player_id;
    }
    
    let query = `
      SELECT 
        t.team_id,
        t.name,
        t.crest_url,
        t.colors,
        t.platform,
        t.server_region,
        t.status,
        t.team_size,
        (SELECT array_agg(l.name) 
         FROM league_master l 
         INNER JOIN team_league_assignments tla ON l.league_id = tla.league_id 
         WHERE tla.team_id = t.team_id AND tla.status = 'active') as leagues,
        (SELECT COUNT(*) FROM player_team_assignments WHERE team_id = t.team_id AND status = 'active') as player_count,
        u.username as owner_username
      FROM team_profile t
      LEFT JOIN users u ON t.created_by = u.user_id
      WHERE t.status = 'active'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Only exclude teams if user has a player profile
    if (player_id) {
      query += ` AND t.team_id NOT IN (
        -- Exclude teams where user is owner
        SELECT team_id FROM team_profile WHERE created_by = $${paramIndex++}
        UNION
        -- Exclude teams where user is a member (any role)
        SELECT team_id FROM player_team_assignments WHERE player_id = $${paramIndex++} AND status = 'active'
      )`;
      params.push(user_id, player_id); // user_id for owner check, player_id for member check
    }

    if (platform && platform !== 'All') {
      params.push(platform);
      query += ` AND t.platform = $${paramIndex++}`;
    }

    if (server && server !== 'All') {
      params.push(server);
      query += ` AND t.server_region = $${paramIndex++}`;
    }

    if (league) {
      params.push(league);
      query += ` AND EXISTS (
        SELECT 1 FROM team_league_assignments tla 
        WHERE tla.team_id = t.team_id AND tla.league_id = $${paramIndex++} AND tla.status = 'active'
      )`;
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ teams: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to browse teams', error: error.message });
  }
};

// Get team by ID (public access for browsing, with role info for team members)
const getTeamById = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.user;

  try {
    // First, get basic team info (public access)
    const teamResult = await db.query(
      `SELECT 
        t.*,
        u.email as owner_email
      FROM team_profile t
      LEFT JOIN users u ON t.created_by = u.user_id
      WHERE t.team_id = $1`,
      [id]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if user is a member to get role info
    const memberResult = await db.query(
      `SELECT 
        pta.role_in_team,
        pta.joined_at
      FROM player_team_assignments pta
      LEFT JOIN player_profile pp ON pta.player_id = pp.player_id
      WHERE pta.team_id = $1 AND pp.user_id = $2 AND pta.status = 'active'`,
      [id, user_id]
    );

    // Add role info if user is a member
    const teamData = {
      ...teamResult.rows[0],
      role_in_team: memberResult.rows.length > 0 ? memberResult.rows[0].role_in_team : null,
      joined_at: memberResult.rows.length > 0 ? memberResult.rows[0].joined_at : null
    };

    // Get Leagues
    const leaguesResult = await db.query(
      `SELECT l.*, tla.status, tla.joined_at, tla.approved_by, tla.approved_at
       FROM team_league_assignments tla
       JOIN league_master l ON tla.league_id = l.league_id
       WHERE tla.team_id = $1`,
      [id]
    );

    // Get Roster
    const rosterResult = await db.query(
      `SELECT 
        pta.*,
        pp.first_name, pp.last_name, pp.preferred_positions, pp.gamer_tag,
        u.email
      FROM player_team_assignments pta
      JOIN player_profile pp ON pta.player_id = pp.player_id
      JOIN users u ON pp.user_id = u.user_id
      WHERE pta.team_id = $1 AND pta.status = 'active'`,
      [id]
    );

    res.json({
      team: {
        ...teamData,
        leagues: leaguesResult.rows
      },
      roster: rosterResult.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch team', error: error.message });
  }
};

// Update team
const updateTeam = async (req, res) => {
  const { id } = req.params;
  const { name, platform, primaryColor, secondaryColor, description, teamSize, serverRegion, crestUrl, crest_url, colors } = req.body;
  const { user_id } = req.user;

  try {
    // Verify ownership
    const teamCheck = await db.query(
      'SELECT * FROM team_profile WHERE team_id = $1 AND created_by = $2',
      [id, user_id]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only the team owner can update the team' });
    }

    // Build dynamic update query - only update provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (platform !== undefined) {
      updates.push(`platform = $${paramIndex++}`);
      values.push(platform);
    }
    
    // Handle colors - support both individual colors and colors object
    if (colors !== undefined) {
      updates.push(`colors = $${paramIndex++}`);
      values.push(colors);
    } else if (primaryColor !== undefined || secondaryColor !== undefined) {
      const currentColors = teamCheck.rows[0].colors || {};
      const newColors = {
        primary: primaryColor !== undefined ? primaryColor : currentColors.primary,
        secondary: secondaryColor !== undefined ? secondaryColor : currentColors.secondary
      };
      updates.push(`colors = $${paramIndex++}`);
      values.push(newColors);
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (teamSize !== undefined) {
      updates.push(`team_size = $${paramIndex++}`);
      values.push(teamSize);
    }
    if (serverRegion !== undefined) {
      updates.push(`server_region = $${paramIndex++}`);
      values.push(serverRegion);
    }
    
    // Handle crest_url - accept both snake_case and camelCase
    const finalCrestUrl = crest_url !== undefined ? crest_url : crestUrl;
    if (finalCrestUrl !== undefined) {
      updates.push(`crest_url = $${paramIndex++}`);
      values.push(finalCrestUrl);
    }

    // Add team_id as the last parameter
    values.push(id);

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Update team with dynamic query
    const result = await db.query(
      `UPDATE team_profile 
       SET ${updates.join(', ')}
       WHERE team_id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json({
      message: 'Team updated successfully',
      team: result.rows[0]
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: 'Failed to update team', error: error.message });
  }
};

// Join League (Apply)
const joinLeague = async (req, res) => {
  const { id } = req.params; // Team ID
  const { league_id } = req.body;
  const { user_id } = req.user;

  try {
    // Verify ownership
    const teamCheck = await db.query(
      'SELECT * FROM team_profile WHERE team_id = $1 AND created_by = $2',
      [id, user_id]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only the team owner can join a league' });
    }

    // Verify league exists and has space
    const leagueCheck = await db.query(
      `SELECT 
        l.*,
        (SELECT COUNT(*) FROM team_league_assignments WHERE league_id = l.league_id AND status = 'active') as current_teams
      FROM league_master l
      WHERE l.league_id = $1`,
      [league_id]
    );

    if (leagueCheck.rows.length === 0) {
      return res.status(404).json({ message: 'League not found' });
    }

    const league = leagueCheck.rows[0];
    if (league.current_teams >= league.max_teams) {
      return res.status(400).json({ message: 'League is full' });
    }

    // Check if already in this league
    const existingAssignment = await db.query(
      'SELECT * FROM team_league_assignments WHERE team_id = $1 AND league_id = $2',
      [id, league_id]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({ message: 'Team is already in this league' });
    }

    // Insert into team_league_assignments
    await db.query(
      `INSERT INTO team_league_assignments (team_id, league_id, status, joined_at)
       VALUES ($1, $2, 'pending', NOW())`,
      [id, league_id]
    );

    res.json({ message: 'Team application submitted and is pending approval' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to join league', error: error.message });
  }
};

// Approve Team Application
const approveTeamApplication = async (req, res) => {
  const { team_id, league_id } = req.body;
  const { user_id } = req.user;

  try {
    // Check if application exists and is pending
    const applicationCheck = await db.query(
      'SELECT * FROM team_league_assignments WHERE team_id = $1 AND league_id = $2 AND status = $3',
      [team_id, league_id, 'pending']
    );

    if (applicationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Pending application not found' });
    }

    // Update application to approved
    await db.query(
      `UPDATE team_league_assignments 
       SET status = 'active', approved_by = $1, approved_at = NOW()
       WHERE team_id = $2 AND league_id = $3`,
      [user_id, team_id, league_id]
    );

    res.json({ message: 'Team application approved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve team application', error: error.message });
  }
};

// Reject Team Application
const rejectTeamApplication = async (req, res) => {
  const { team_id, league_id } = req.body;
  const { user_id } = req.user;

  try {
    // Check if application exists and is pending
    const applicationCheck = await db.query(
      'SELECT * FROM team_league_assignments WHERE team_id = $1 AND league_id = $2 AND status = $3',
      [team_id, league_id, 'pending']
    );

    if (applicationCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Pending application not found' });
    }

    // Delete the application (remove from table)
    await db.query(
      'DELETE FROM team_league_assignments WHERE team_id = $1 AND league_id = $2',
      [team_id, league_id]
    );

    res.json({ message: 'Team application rejected and removed' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject team application', error: error.message });
  }
};

// Invite Player
const invitePlayer = async (req, res) => {
  const { id } = req.params; // Team ID
  const { email, username } = req.body; // Accept both email and username
  const { user_id } = req.user;

  try {
    // 1. Verify requester is owner/captain
    const requesterRole = await db.query(
      `SELECT role_in_team FROM player_team_assignments 
       WHERE team_id = $1 AND player_id = (SELECT player_id FROM player_profile WHERE user_id = $2)
       AND status = 'active'`,
      [id, user_id]
    );

    if (requesterRole.rows.length === 0 || !['owner', 'captain'].includes(requesterRole.rows[0].role_in_team)) {
      return res.status(403).json({ message: 'Only team owners and captains can invite players' });
    }

    // 2. Find user to invite (by email or username)
    let userToInvite;
    
    if (email) {
      // Find by email
      userToInvite = await db.query(
        'SELECT u.user_id, p.player_id FROM users u JOIN player_profile p ON u.user_id = p.user_id WHERE u.email = $1',
        [email]
      );
    } else if (username) {
      // Find by username
      userToInvite = await db.query(
        'SELECT u.user_id, p.player_id FROM users u JOIN player_profile p ON u.user_id = p.user_id WHERE u.username = $1',
        [username]
      );
    } else {
      return res.status(400).json({ message: 'Either email or username is required' });
    }

    if (userToInvite.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const playerId = userToInvite.rows[0].player_id;

    // 3. Check if already in team (only check active assignments)
    const existingAssignment = await db.query(
      'SELECT * FROM player_team_assignments WHERE team_id = $1 AND player_id = $2 AND status = $3',
      [id, playerId, 'active']
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({ message: 'Player is already in the team' });
    }

    // 4. Check if there's already a pending invitation
    const existingRequest = await db.query(
      'SELECT * FROM team_join_requests WHERE team_id = $1 AND player_id = $2 AND status = $3',
      [id, playerId, 'pending']
    );

    if (existingRequest.rows.length > 0) {
      return res.status(400).json({ message: 'Player already has a pending invitation' });
    }

    // 5. Create a pending invitation request
    await db.query(
      `INSERT INTO team_join_requests (
        team_id, player_id, status, request_type
      ) VALUES ($1, $2, 'pending', 'invitation')`,
      [id, playerId]
    );

    res.json({ message: 'Invitation sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to invite player', error: error.message });
  }
};

// Get User's Team Invitations (only invitations from team owners)
const getUserInvitations = async (req, res) => {
  const { user_id } = req.user;

  try {
    const invitations = await db.query(
      `SELECT 
        tjr.request_id,
        tjr.team_id,
        tjr.requested_at,
        tp.name as team_name,
        tp.description as team_description,
        tp.crest_url as team_crest,
        pp.first_name,
        pp.last_name,
        u.email as invited_email
      FROM team_join_requests tjr
      JOIN team_profile tp ON tjr.team_id = tp.team_id
      JOIN player_profile pp ON tjr.player_id = pp.player_id
      JOIN users u ON pp.user_id = u.user_id
      WHERE tjr.player_id = (SELECT player_id FROM player_profile WHERE user_id = $1)
      AND tjr.status = 'pending'
      AND tjr.request_type = 'invitation'
      ORDER BY tjr.requested_at DESC`,
      [user_id]
    );

    res.json(invitations.rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get invitations', error: error.message });
  }
};

// Accept Team Invitation
// Accept invitation (player side)
const acceptInvitation = async (req, res) => {
  const { request_id } = req.params;
  const { user_id } = req.user;

  try {
    // Start transaction
    await db.query('BEGIN');

    // Get the invitation details
    const invitation = await db.query(
      'SELECT * FROM team_join_requests WHERE request_id = $1 AND status = $2',
      [request_id, 'pending']
    );

    if (invitation.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }

    const { team_id, player_id } = invitation.rows[0];

    // Verify this invitation belongs to the current user
    const userPlayer = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (userPlayer.rows.length === 0 || userPlayer.rows[0].player_id !== player_id) {
      await db.query('ROLLBACK');
      return res.status(403).json({ message: 'This invitation is not for you' });
    }

    // Check for existing assignment (active or inactive)
    const existingAssignment = await db.query(
      'SELECT * FROM player_team_assignments WHERE team_id = $1 AND player_id = $2',
      [team_id, player_id]
    );

    if (existingAssignment.rows.length > 0) {
      const assignment = existingAssignment.rows[0];
      
      if (assignment.status === 'active') {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'You are already a member of this team' });
      }
      
      // Reactivate existing inactive player
      await db.query(
        `UPDATE player_team_assignments 
         SET status = 'active', left_at = NULL, joined_at = CURRENT_TIMESTAMP
         WHERE team_id = $1 AND player_id = $2`,
        [team_id, player_id]
      );
    } else {
      // New player - add to team
      await db.query(
        `INSERT INTO player_team_assignments (
          player_id, team_id, role_in_team, status, assigned_by
        ) VALUES ($1, $2, 'player', 'active', $3)`,
        [player_id, team_id, user_id]
      );
    }

    // Delete the invitation request (clean up!)
    await db.query(
      'DELETE FROM team_join_requests WHERE request_id = $1',
      [request_id]
    );

    // Commit transaction
    await db.query('COMMIT');

    res.json({ message: 'Invitation accepted successfully! You are now a member of the team.' });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ message: 'Failed to accept invitation', error: error.message });
  }
};

// Reject Team Invitation
const rejectInvitation = async (req, res) => {
  const { request_id } = req.params;
  const { user_id } = req.user;

  try {
    // Get the invitation details
    const invitation = await db.query(
      'SELECT * FROM team_join_requests WHERE request_id = $1 AND status = $2',
      [request_id, 'pending']
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }

    const { player_id } = invitation.rows[0];

    // Verify this invitation belongs to the current user
    const userPlayer = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (userPlayer.rows.length === 0 || userPlayer.rows[0].player_id !== player_id) {
      return res.status(403).json({ message: 'This invitation is not for you' });
    }

    // Update invitation status
    await db.query(
      'UPDATE team_join_requests SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE request_id = $2',
      ['rejected', request_id]
    );

    res.json({ message: 'Invitation rejected successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject invitation', error: error.message });
  }
};

// Assign Role
const assignRole = async (req, res) => {
  const { id } = req.params; // Team ID
  const { player_id, role } = req.body; // role: 'captain', 'vice_captain', 'player'
  const { user_id } = req.user;

  try {
    // 1. Verify requester is owner
    const requesterRole = await db.query(
      `SELECT role_in_team FROM player_team_assignments 
       WHERE team_id = $1 AND player_id = (SELECT player_id FROM player_profile WHERE user_id = $2)
       AND status = 'active'`,
      [id, user_id]
    );

    if (requesterRole.rows.length === 0 || requesterRole.rows[0].role_in_team !== 'owner') {
      return res.status(403).json({ message: 'Only owner can assign roles' });
    }

    // 2. Update role
    await db.query(
      'UPDATE player_team_assignments SET role_in_team = $1 WHERE team_id = $2 AND player_id = $3',
      [role, id, player_id]
    );

    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign role', error: error.message });
  }
};

// Remove Player from Team
const removePlayer = async (req, res) => {
  const { id } = req.params; // Team ID
  const { player_id } = req.body;
  const { user_id } = req.user;

  try {
    // 1. Verify requester is owner
    const requesterRole = await db.query(
      `SELECT role_in_team FROM player_team_assignments 
       WHERE team_id = $1 AND player_id = (SELECT player_id FROM player_profile WHERE user_id = $2)
       AND status = 'active'`,
      [id, user_id]
    );

    if (requesterRole.rows.length === 0 || requesterRole.rows[0].role_in_team !== 'owner') {
      return res.status(403).json({ message: 'Only owner can remove players' });
    }

    // 2. Don't allow owner to remove themselves
    const requesterPlayerId = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (requesterPlayerId.rows[0].player_id === player_id) {
      return res.status(400).json({ message: 'Owner cannot remove themselves from the team' });
    }

    // 3. Remove player (set inactive and left_at timestamp)
    await db.query(
      `UPDATE player_team_assignments 
       SET status = 'inactive', left_at = CURRENT_TIMESTAMP 
       WHERE team_id = $1 AND player_id = $2`,
      [id, player_id]
    );

    res.json({ message: 'Player removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove player', error: error.message });
  }
};


// Send join request
const sendJoinRequest = async (req, res) => {
  const { teamId } = req.params;
  const { user_id } = req.user;

  try {
    // Get player_id from user_id
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player profile not found' });
    }

    const player_id = playerResult.rows[0].player_id;

    // Check if already a member
    const memberCheck = await db.query(
      'SELECT * FROM player_team_assignments WHERE player_id = $1 AND team_id = $2 AND status = $3',
      [player_id, teamId, 'active']
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ message: 'You are already a member of this team' });
    }

    // Check for existing pending request
    const existingRequest = await db.query(
      'SELECT * FROM team_join_requests WHERE player_id = $1 AND team_id = $2 AND status = $3',
      [player_id, teamId, 'pending']
    );

    if (existingRequest.rows.length > 0) {
      return res.status(400).json({ message: 'You already have a pending request for this team' });
    }

    // Create join request
    const result = await db.query(
      `INSERT INTO team_join_requests (team_id, player_id, status, request_type)
       VALUES ($1, $2, 'pending', 'join_request')
       RETURNING *`,
      [teamId, player_id]
    );

    res.status(201).json({
      message: 'Join request sent successfully',
      request: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send join request', error: error.message });
  }
};

// Get join requests for a team (owner and captain only) - only actual join requests from players
const getJoinRequests = async (req, res) => {
  const { teamId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is team owner or captain
    const roleCheck = await db.query(
      `SELECT * FROM player_team_assignments pta
       JOIN player_profile pp ON pta.player_id = pp.player_id
       WHERE pta.team_id = $1 AND pp.user_id = $2 AND pta.role_in_team IN ('owner', 'captain')`,
      [teamId, user_id]
    );

    if (roleCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only team owners and captains can view join requests' });
    }

    // Get pending join requests with player details (only join_requests, not invitations)
    const result = await db.query(
      `SELECT 
        tjr.*,
        pp.player_id,
        pp.first_name,
        pp.last_name,
        pp.gamer_tag,
        pp.avatar_url,
        pp.preferred_positions
       FROM team_join_requests tjr
       JOIN player_profile pp ON tjr.player_id = pp.player_id
       WHERE tjr.team_id = $1 AND tjr.status = 'pending' AND tjr.request_type = 'join_request'
       ORDER BY tjr.requested_at DESC`,
      [teamId]
    );

    res.json({ requests: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch join requests', error: error.message });
  }
};

// Approve join request
const approveJoinRequest = async (req, res) => {
  const { teamId, requestId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is team owner
    const ownerCheck = await db.query(
      `SELECT * FROM player_team_assignments pta
       JOIN player_profile pp ON pta.player_id = pp.player_id
       WHERE pta.team_id = $1 AND pp.user_id = $2 AND pta.role_in_team = 'owner'`,
      [teamId, user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only team owners can approve join requests' });
    }

    // Get request details
    const requestResult = await db.query(
      'SELECT * FROM team_join_requests WHERE request_id = $1 AND team_id = $2 AND status = $3',
      [requestId, teamId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ message: 'Join request not found or already processed' });
    }

    const request = requestResult.rows[0];

    await db.query('BEGIN');

    // Check for existing assignment (player who left and is returning)
    const existingAssignment = await db.query(
      'SELECT * FROM player_team_assignments WHERE team_id = $1 AND player_id = $2',
      [teamId, request.player_id]
    );

    if (existingAssignment.rows.length > 0) {
      const assignment = existingAssignment.rows[0];
      
      if (assignment.status === 'active') {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Player is already a member of this team' });
      }
      
      // Reactivate existing player (they left before)
      await db.query(
        `UPDATE player_team_assignments 
         SET status = 'active', left_at = NULL, joined_at = CURRENT_TIMESTAMP, role_in_team = 'player'
         WHERE team_id = $1 AND player_id = $2`,
        [teamId, request.player_id]
      );
    } else {
      // New player - add to team
      await db.query(
        `INSERT INTO player_team_assignments (player_id, team_id, role_in_team, status, assigned_by)
         VALUES ($1, $2, 'player', 'active', $3)`,
        [request.player_id, teamId, user_id]
      );
    }

    // Delete the join request (clean up!)
    const deleteResult = await db.query(
      'DELETE FROM team_join_requests WHERE request_id = $1 AND team_id = $2 AND status = \'pending\' RETURNING *',
      [requestId, teamId]
    );

    if (deleteResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Join request not found or already processed' });
    }

    await db.query('COMMIT');

    res.json({ message: 'Join request approved successfully' });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ message: 'Failed to approve join request', error: error.message });
  }
};

// Reject join request
const rejectJoinRequest = async (req, res) => {
  const { teamId, requestId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is team owner
    const ownerCheck = await db.query(
      `SELECT * FROM player_team_assignments pta
       JOIN player_profile pp ON pta.player_id = pp.player_id
       WHERE pta.team_id = $1 AND pp.user_id = $2 AND pta.role_in_team = 'owner'`,
      [teamId, user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only team owners can reject join requests' });
    }

    // Update request status
    const result = await db.query(
      `UPDATE team_join_requests 
       SET status = 'rejected', processed_at = CURRENT_TIMESTAMP
       WHERE request_id = $1 AND team_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestId, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Join request not found or already processed' });
    }

    res.json({ message: 'Join request rejected successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject join request', error: error.message });
  }
};

// Cancel invitation (delete the row entirely)
const cancelInvitation = async (req, res) => {
  const { teamId, requestId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is team owner or captain
    const ownerCheck = await db.query(
      `SELECT * FROM player_team_assignments pta
       JOIN player_profile pp ON pta.player_id = pp.player_id
       WHERE pta.team_id = $1 AND pp.user_id = $2 AND (pta.role_in_team = 'owner' OR pta.role_in_team = 'captain')`,
      [teamId, user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only team owners or captains can cancel invitations' });
    }

    // Delete the invitation entirely
    const result = await db.query(
      `DELETE FROM team_join_requests 
       WHERE request_id = $1 AND team_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestId, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }

    res.json({ message: 'Invitation cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel invitation', error: error.message });
  }
};

// Leave team
const leaveTeam = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.user;

  try {
    // Get player_id from user_id
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player profile not found' });
    }

    const playerId = playerResult.rows[0].player_id;

    // Check if player is in the team
    const assignmentCheck = await db.query(
      'SELECT * FROM player_team_assignments WHERE team_id = $1 AND player_id = $2 AND status = $3',
      [id, playerId, 'active']
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'You are not an active member of this team' });
    }

    // Check if user is the owner
    if (assignmentCheck.rows[0].role_in_team === 'owner') {
      return res.status(403).json({ message: 'Team owners cannot leave the team. Transfer ownership first.' });
    }

    // Update player status to inactive (soft delete)
    await db.query(
      `UPDATE player_team_assignments 
       SET status = 'inactive', left_at = CURRENT_TIMESTAMP
       WHERE team_id = $1 AND player_id = $2`,
      [id, playerId]
    );

    res.json({ message: 'You have left the team successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave team', error: error.message });
  }
};

// Get sent invitations for a team (owner only) - only actual invitations sent by team
const getSentInvitations = async (req, res) => {
  const { teamId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user is team owner or captain
    const ownerCheck = await db.query(
      `SELECT * FROM player_team_assignments pta
       JOIN player_profile pp ON pta.player_id = pp.player_id
       WHERE pta.team_id = $1 AND pp.user_id = $2 AND (pta.role_in_team = 'owner' OR pta.role_in_team = 'captain')`,
      [teamId, user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Only team owners or captains can view sent invitations' });
    }

    // Get pending invitations with player details (only invitations, not join requests)
    const result = await db.query(
      `SELECT 
        tjr.*,
        pp.player_id,
        pp.first_name,
        pp.last_name,
        pp.gamer_tag,
        pp.avatar_url,
        pp.preferred_positions,
        u.email
       FROM team_join_requests tjr
       JOIN player_profile pp ON tjr.player_id = pp.player_id
       JOIN users u ON pp.user_id = u.user_id
       WHERE tjr.team_id = $1 AND tjr.status = 'pending' AND tjr.request_type = 'invitation'
       ORDER BY tjr.requested_at DESC`,
      [teamId]
    );

    res.json({ invitations: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch sent invitations', error: error.message });
  }
};

// Delete team (admin only)
const deleteTeam = async (req, res) => {
  const { id } = req.params; // Team ID
  const { user_id } = req.user;
  
  try {
    // 1. Check if team exists
    const teamCheck = await db.query(
      'SELECT * FROM team_profile WHERE team_id = $1',
      [id]
    );
    
    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const team = teamCheck.rows[0];
    
    // 2. Check if team is in active leagues
    const leagueCheck = await db.query(
      'SELECT COUNT(*) as count FROM team_league_assignments WHERE team_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (parseInt(leagueCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete team that is actively participating in leagues' 
      });
    }
    
    // 3. Start transaction
    await db.query('BEGIN');
    
    try {
      // 4. Delete team folder from uploads (team crests)
      const teamDir = path.join('uploads', 'team-crests', id);
      if (fs.existsSync(teamDir)) {
        fs.rmSync(teamDir, { recursive: true, force: true });
      }

      // 5. Delete chat messages
      await db.query(
        'DELETE FROM chat_messages WHERE room_id IN (SELECT room_id FROM chat_rooms WHERE team_id = $1)',
        [id]
      );
      
      // 6. Delete chat rooms
      await db.query(
        'DELETE FROM chat_rooms WHERE team_id = $1',
        [id]
      );
      
      // 7. Delete player team assignments (manual cascade)
      await db.query(
        'DELETE FROM player_team_assignments WHERE team_id = $1',
        [id]
      );
      
      // 8. Delete join requests
      await db.query(
        'DELETE FROM team_join_requests WHERE team_id = $1',
        [id]
      );
      
      // 9. Delete team profile
      const deleteResult = await db.query(
        'DELETE FROM team_profile WHERE team_id = $1 RETURNING *',
        [id]
      );
      
      // 8. Commit transaction
      await db.query('COMMIT');
      
      res.status(200).json({ 
        message: 'Team deleted successfully',
        deletedTeam: deleteResult.rows[0]
      });
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete team', error: error.message });
  }
};

module.exports = {
  createTeam,
  getTeamById,
  updateTeam,
  getUserTeams,
  getAllTeams,
  browseTeams,
  invitePlayer,
  assignRole,
  removePlayer,
  sendJoinRequest,
  getJoinRequests,
  getSentInvitations,
  approveJoinRequest,
  rejectJoinRequest,
  cancelInvitation,
  getUserInvitations,
  acceptInvitation,
  rejectInvitation,
  leaveTeam,
  joinLeague,
  approveTeamApplication,
  rejectTeamApplication,
  deleteTeam
};
