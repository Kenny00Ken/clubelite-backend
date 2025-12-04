const db = require('../config/db');

// Request transfer
const requestTransfer = async (req, res) => {
  const { player_id, from_team_id, to_team_id, league_id, transfer_type = 'TRANSFER', transfer_fee = 0, notes } = req.body;
  const { user_id } = req.user;

  try {
    // Check if player exists and is in from_team
    const playerCheck = await db.query(
      `SELECT * FROM player_team_assignments 
       WHERE player_id = $1 AND team_id = $2 AND status = 'active'`,
      [player_id, from_team_id]
    );

    if (playerCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Player is not in the source team' });
    }

    // Check if there's already a pending transfer for this player
    const pendingCheck = await db.query(
      `SELECT * FROM player_transfers 
       WHERE player_id = $1 AND status = 'pending'`,
      [player_id]
    );

    if (pendingCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Player already has a pending transfer' });
    }

    // Create transfer request
    const result = await db.query(
      `INSERT INTO player_transfers 
       (player_id, from_team_id, to_team_id, league_id, transfer_type, transfer_fee, requested_by, notes, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [player_id, from_team_id, to_team_id, league_id, transfer_type, transfer_fee, user_id, notes]
    );

    res.status(201).json({
      message: 'Transfer request created successfully',
      transfer: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create transfer request' });
  }
};

// Get transfer requests
const getTransferRequests = async (req, res) => {
  const { status, league_id, team_id } = req.query;

  try {
    let query = `
      SELECT 
        t.*,
        p.first_name,
        p.last_name,
        p.gamer_tag,
        p.preferred_positions,
        ft.name as from_team_name,
        tt.name as to_team_name,
        l.name as league_name
      FROM player_transfers t
      JOIN player_profile p ON t.player_id = p.player_id
      JOIN team_profile ft ON t.from_team_id = ft.team_id
      JOIN team_profile tt ON t.to_team_id = tt.team_id
      LEFT JOIN league_master l ON t.league_id = l.league_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
    }

    if (league_id) {
      paramCount++;
      query += ` AND t.league_id = $${paramCount}`;
      params.push(league_id);
    }

    if (team_id) {
      paramCount++;
      query += ` AND (t.from_team_id = $${paramCount} OR t.to_team_id = $${paramCount})`;
      params.push(team_id);
    }

    query += ` ORDER BY t.requested_at DESC`;

    const result = await db.query(query, params);

    res.json({
      transfers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch transfer requests' });
  }
};

// Approve transfer
const approveTransfer = async (req, res) => {
  const { transferId } = req.params;
  const { user_id } = req.user;

  try {
    // Get transfer details
    const transferResult = await db.query(
      'SELECT * FROM player_transfers WHERE transfer_id = $1',
      [transferId]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transfer not found' });
    }

    const transfer = transferResult.rows[0];

    if (transfer.status !== 'pending') {
      return res.status(400).json({ message: 'Transfer is not pending' });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Update transfer status
      await db.query(
        `UPDATE player_transfers 
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE transfer_id = $2`,
        [user_id, transferId]
      );

      // Update player's team assignment - deactivate old team
      await db.query(
        `UPDATE player_team_assignments 
         SET status = 'inactive', left_at = NOW()
         WHERE player_id = $1 AND team_id = $2 AND status = 'active'`,
        [transfer.player_id, transfer.from_team_id]
      );

      // Create new team assignment
      await db.query(
        `INSERT INTO player_team_assignments 
         (player_id, team_id, league_id, role_in_team, status, joined_at)
         VALUES ($1, $2, $3, 'player', 'active', NOW())`,
        [transfer.player_id, transfer.to_team_id, transfer.league_id]
      );

      // Update transfer to completed
      await db.query(
        `UPDATE player_transfers 
         SET status = 'completed'
         WHERE transfer_id = $1`,
        [transferId]
      );

      await db.query('COMMIT');

      res.json({
        message: 'Transfer approved and completed successfully',
        transfer_id: transferId
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve transfer' });
  }
};

// Reject transfer
const rejectTransfer = async (req, res) => {
  const { transferId } = req.params;
  const { reason } = req.body;
  const { user_id } = req.user;

  try {
    const result = await db.query(
      `UPDATE player_transfers 
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), notes = $2
       WHERE transfer_id = $3 AND status = 'pending'
       RETURNING *`,
      [user_id, reason, transferId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Transfer not found or not pending' });
    }

    res.json({
      message: 'Transfer rejected successfully',
      transfer: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject transfer' });
  }
};

// Get player transfer history
const getPlayerTransferHistory = async (req, res) => {
  const { playerId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
        t.*,
        ft.name as from_team_name,
        tt.name as to_team_name,
        l.name as league_name
      FROM player_transfers t
      JOIN team_profile ft ON t.from_team_id = ft.team_id
      JOIN team_profile tt ON t.to_team_id = tt.team_id
      LEFT JOIN league_master l ON t.league_id = l.league_id
      WHERE t.player_id = $1
      ORDER BY t.requested_at DESC`,
      [playerId]
    );

    res.json({
      transfers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch transfer history' });
  }
};

// Get available players (free agents or players from other teams)
const getAvailablePlayers = async (req, res) => {
  const { league_id, position, exclude_team_id } = req.query;

  try {
    let query = `
      SELECT DISTINCT
        p.player_id,
        p.first_name,
        p.last_name,
        p.gamer_tag,
        p.preferred_positions,
        p.avatar_url,
        pta.team_id,
        pta.role_in_team,
        pta.jersey_number,
        t.name as current_team,
        (SELECT COUNT(*) FROM match_stats WHERE player_id = p.player_id) as matches_played,
        (SELECT SUM(goals) FROM match_stats WHERE player_id = p.player_id) as total_goals,
        (SELECT SUM(assists) FROM match_stats WHERE player_id = p.player_id) as total_assists
      FROM player_profile p
      LEFT JOIN player_team_assignments pta ON p.player_id = pta.player_id AND pta.status = 'active'
      LEFT JOIN team_profile t ON pta.team_id = t.team_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (league_id) {
      paramCount++;
      query += ` AND (pta.league_id = $${paramCount} OR pta.league_id IS NULL)`;
      params.push(league_id);
    }

    if (position) {
      paramCount++;
      query += ` AND p.preferred_positions @> ARRAY[$${paramCount}]::VARCHAR[]`;
      params.push(position);
    }

    if (exclude_team_id) {
      paramCount++;
      query += ` AND (pta.team_id != $${paramCount} OR pta.team_id IS NULL)`;
      params.push(exclude_team_id);
    }

    query += ` ORDER BY total_goals DESC NULLS LAST LIMIT 50`;

    const result = await db.query(query, params);

    res.json({
      players: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available players' });
  }
};

module.exports = {
  requestTransfer,
  getTransferRequests,
  approveTransfer,
  rejectTransfer,
  getPlayerTransferHistory,
  getAvailablePlayers
};
