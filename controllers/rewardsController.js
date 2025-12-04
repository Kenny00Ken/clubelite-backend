const db = require('../config/db');

// Calculate rewards from approved stats
const calculateRewards = async (req, res) => {
  const { fixtureId } = req.params;
  const { user_id } = req.user;

  try {
    // Get approved stats for this fixture
    const statsResult = await db.query(
      `SELECT * FROM match_stats WHERE fixture_id = $1 AND status = 'approved'`,
      [fixtureId]
    );

    if (statsResult.rows.length === 0) {
      return res.status(404).json({ message: 'No approved stats found for this fixture' });
    }

    // ETL values
    const ETL_VALUES = {
      GOAL: 15,
      ASSIST: 10,
      SAVE: 3,
      CLEAN_SHEET: 20,
      YELLOW_CARD: -10,
      RED_CARD: -25,
      MVP: 25
    };

    // Calculate rewards for each player
    const rewards = [];
    for (const stat of statsResult.rows) {
      let totalETL = 0;
      const breakdown = [];

      if (stat.goals > 0) {
        const amount = stat.goals * ETL_VALUES.GOAL;
        totalETL += amount;
        breakdown.push({ reason: 'GOAL', count: stat.goals, amount });
      }
      if (stat.assists > 0) {
        const amount = stat.assists * ETL_VALUES.ASSIST;
        totalETL += amount;
        breakdown.push({ reason: 'ASSIST', count: stat.assists, amount });
      }
      if (stat.saves > 0) {
        const amount = stat.saves * ETL_VALUES.SAVE;
        totalETL += amount;
        breakdown.push({ reason: 'SAVE', count: stat.saves, amount });
      }
      if (stat.clean_sheet) {
        totalETL += ETL_VALUES.CLEAN_SHEET;
        breakdown.push({ reason: 'CLEAN_SHEET', count: 1, amount: ETL_VALUES.CLEAN_SHEET });
      }
      if (stat.yellow_cards > 0) {
        const amount = stat.yellow_cards * ETL_VALUES.YELLOW_CARD;
        totalETL += amount;
        breakdown.push({ reason: 'YELLOW_CARD', count: stat.yellow_cards, amount });
      }
      if (stat.red_cards > 0) {
        const amount = stat.red_cards * ETL_VALUES.RED_CARD;
        totalETL += amount;
        breakdown.push({ reason: 'RED_CARD', count: stat.red_cards, amount });
      }
      if (stat.is_mvp) {
        totalETL += ETL_VALUES.MVP;
        breakdown.push({ reason: 'MVP', count: 1, amount: ETL_VALUES.MVP });
      }

      rewards.push({
        player_id: stat.player_id,
        team_id: stat.team_id,
        total_etl: totalETL,
        breakdown
      });
    }

    // Insert into pending_rewards
    const insertPromises = rewards.map(reward =>
      db.query(
        `INSERT INTO pending_rewards 
         (fixture_id, player_id, team_id, amount, reason, calculated_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'approved')
         RETURNING *`,
        [fixtureId, reward.player_id, reward.team_id, reward.total_etl, 
         JSON.stringify(reward.breakdown), user_id]
      )
    );

    const results = await Promise.all(insertPromises);

    res.json({
      message: 'Rewards calculated successfully',
      rewards: results.map(r => r.rows[0]),
      total: rewards.reduce((sum, r) => sum + r.total_etl, 0)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to calculate rewards' });
  }
};

// Get pending rewards
const getPendingRewards = async (req, res) => {
  const { leagueId, status } = req.query;

  try {
    let query = `
      SELECT 
        r.*,
        p.first_name,
        p.last_name,
        p.gamer_tag,
        t.name as team_name,
        f.match_date
      FROM pending_rewards r
      JOIN player_profile p ON r.player_id = p.player_id
      JOIN team_profile t ON r.team_id = t.team_id
      LEFT JOIN match_fixtures f ON r.fixture_id = f.fixture_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      params.push(status);
    } else {
      query += ` AND r.status = 'approved'`; // Default to approved rewards
    }

    if (leagueId) {
      paramCount++;
      query += ` AND f.league_id = $${paramCount}`;
      params.push(leagueId);
    }

    query += ` ORDER BY r.calculated_at DESC`;

    const result = await db.query(query, params);

    const totalAmount = result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      rewards: result.rows,
      total: result.rows.length,
      total_amount: totalAmount
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch pending rewards' });
  }
};

// Execute batch payout (CFO only)
const executeBatchPayout = async (req, res) => {
  const { reward_ids } = req.body;
  const { user_id } = req.user;

  try {
    if (!reward_ids || reward_ids.length === 0) {
      return res.status(400).json({ message: 'No rewards selected for payout' });
    }

    // Get rewards
    const rewardsResult = await db.query(
      `SELECT * FROM pending_rewards WHERE reward_id = ANY($1) AND status = 'approved'`,
      [reward_ids]
    );

    if (rewardsResult.rows.length === 0) {
      return res.status(404).json({ message: 'No approved rewards found' });
    }

    // Create transactions and update rewards
    const transactions = [];
    for (const reward of rewardsResult.rows) {
      // Insert transaction
      const txResult = await db.query(
        `INSERT INTO etl_transactions 
         (to_wallet_id, amount, transaction_type, fixture_id, reward_id, description, executed_by)
         VALUES ($1, $2, 'REWARD', $3, $4, $5, $6)
         RETURNING *`,
        [
          reward.player_id, // Using player_id as wallet reference for now
          reward.amount,
          reward.fixture_id,
          reward.reward_id,
          `Match reward: ${reward.reason}`,
          user_id
        ]
      );

      // Update reward status
      await db.query(
        `UPDATE pending_rewards 
         SET status = 'paid', paid_by = $1, paid_at = NOW()
         WHERE reward_id = $2`,
        [user_id, reward.reward_id]
      );

      transactions.push(txResult.rows[0]);
    }

    const totalPaid = rewardsResult.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      message: 'Batch payout executed successfully',
      transactions,
      total_paid: totalPaid,
      count: transactions.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to execute payout' });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  const { playerId, fixtureId, limit = 50 } = req.query;

  try {
    let query = `
      SELECT 
        t.*,
        p.first_name,
        p.last_name,
        p.gamer_tag
      FROM etl_transactions t
      LEFT JOIN player_profile p ON t.to_wallet_id = p.player_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (playerId) {
      paramCount++;
      query += ` AND t.to_wallet_id = $${paramCount}`;
      params.push(playerId);
    }

    if (fixtureId) {
      paramCount++;
      query += ` AND t.fixture_id = $${paramCount}`;
      params.push(fixtureId);
    }

    paramCount++;
    query += ` ORDER BY t.executed_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      transactions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch transaction history' });
  }
};

module.exports = {
  calculateRewards,
  getPendingRewards,
  executeBatchPayout,
  getTransactionHistory
};
