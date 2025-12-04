const db = require('../config/db');

// Get wallet balance (auto-create if doesn't exist)
const getWalletBalance = async (req, res) => {
  const { user_id } = req.user;

  try {
    // Get player profile
    const playerResult = await db.query(
      'SELECT player_id, first_name, last_name, gamer_tag FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player profile not found. Please complete your profile first.' });
    }

    const player = playerResult.rows[0];

    // Check if wallet exists, if not create one
    let walletResult = await db.query(
      'SELECT * FROM etl_wallet WHERE owner_type = $1 AND owner_id = $2',
      ['player', player.player_id]
    );

    if (walletResult.rows.length === 0) {
      // Create wallet for player
      const walletId = `CEG-WA-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      
      await db.query(
        `INSERT INTO etl_wallet (wallet_id, owner_type, owner_id, balance, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [walletId, 'player', player.player_id, 0]
      );

      walletResult = await db.query(
        'SELECT * FROM etl_wallet WHERE wallet_id = $1',
        [walletId]
      );
    }

    const wallet = walletResult.rows[0];

    res.json({
      wallet_id: wallet.wallet_id,
      balance: wallet.balance,
      player: {
        player_id: player.player_id,
        first_name: player.first_name,
        last_name: player.last_name,
        gamer_tag: player.gamer_tag
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch wallet balance' });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  const { user_id } = req.user;
  const { limit = 50 } = req.query;

  try {
    // Get player_id and wallet_id
    const playerResult = await db.query(
      `SELECT pp.player_id, ew.wallet_id
       FROM player_profile pp
       LEFT JOIN etl_wallet ew ON ew.owner_id = pp.player_id AND ew.owner_type = 'player'
       WHERE pp.user_id = $1`,
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const { wallet_id } = playerResult.rows[0];

    if (!wallet_id) {
      // No wallet, return empty transactions
      return res.json({ transactions: [], total: 0 });
    }

    // Get transactions
    const result = await db.query(
      `SELECT 
        t.*,
        f.match_date,
        ht.name as home_team,
        at.name as away_team
      FROM etl_transactions t
      LEFT JOIN match_fixtures f ON t.fixture_id = f.fixture_id
      LEFT JOIN team_profile ht ON f.home_team_id = ht.team_id
      LEFT JOIN team_profile at ON f.away_team_id = at.team_id
      WHERE t.to_wallet_id = $1
      ORDER BY t.executed_at DESC
      LIMIT $2`,
      [wallet_id, limit]
    );

    res.json({
      transactions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch transaction history' });
  }
};

// Get earnings summary
const getEarningsSummary = async (req, res) => {
  const { user_id } = req.user;

  try {
    // Get player_id and wallet_id
    const playerResult = await db.query(
      `SELECT pp.player_id, ew.wallet_id
       FROM player_profile pp
       LEFT JOIN etl_wallet ew ON ew.owner_id = pp.player_id AND ew.owner_type = 'player'
       WHERE pp.user_id = $1`,
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const { wallet_id } = playerResult.rows[0];

    if (!wallet_id) {
      // No wallet, return empty summary
      return res.json({ breakdown: [], total_earnings: 0 });
    }

    // Get earnings breakdown
    const result = await db.query(
      `SELECT 
        transaction_type,
        COUNT(*) as count,
        SUM(amount) as total
      FROM etl_transactions
      WHERE to_wallet_id = $1
      GROUP BY transaction_type
      ORDER BY total DESC`,
      [wallet_id]
    );

    // Get total earnings
    const totalResult = await db.query(
      `SELECT SUM(amount) as total_earnings
       FROM etl_transactions
       WHERE to_wallet_id = $1`,
      [wallet_id]
    );

    res.json({
      breakdown: result.rows,
      total_earnings: parseFloat(totalResult.rows[0]?.total_earnings || 0)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch earnings summary' });
  }
};

module.exports = {
  getWalletBalance,
  getTransactionHistory,
  getEarningsSummary
};
