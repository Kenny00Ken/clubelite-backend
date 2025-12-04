const db = require('../config/db');

// Get chat rooms for user
const getChatRooms = async (req, res) => {
  const { user_id } = req.user;

  try {
    // First, ensure Global Chat room exists
    await db.query(`
      INSERT INTO chat_rooms (room_id, room_type, name, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (room_id) DO NOTHING
    `, ['global', 'global', 'Global Chat', 'Chat room for all ClubElite members', 'system']);

    // Get player_id
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const player_id = playerResult.rows[0].player_id;

    // Get all accessible rooms (global + player's teams + player's leagues)
    const result = await db.query(
      `SELECT DISTINCT
        cr.*,
        (SELECT COUNT(*) FROM chat_messages WHERE room_id = cr.room_id AND deleted_at IS NULL) as message_count,
        (SELECT MAX(created_at) FROM chat_messages WHERE room_id = cr.room_id AND deleted_at IS NULL) as last_message_at
      FROM chat_rooms cr
      WHERE 
        cr.room_type = 'global'
        OR (cr.room_type = 'team' AND cr.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active'))
        OR (cr.room_type = 'league' AND cr.league_id IN (
            SELECT tla.league_id 
            FROM team_league_assignments tla
            WHERE tla.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active')
            AND tla.status = 'active'
          ))
      ORDER BY last_message_at DESC NULLS LAST, cr.created_at DESC`,
      [player_id]
    );

    res.json({ rooms: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch chat rooms' });
  }
};

// Get messages for a room (with pagination)
const getMessages = async (req, res) => {
  const { roomId } = req.params;
  const { before, after, limit = 50 } = req.query;
  const { user_id } = req.user;

  try {
    // Verify user has access to this room
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const player_id = playerResult.rows[0].player_id;

    // Check room access using the same logic as getRooms
    const roomAccess = await db.query(
      `SELECT cr.* FROM chat_rooms cr
       WHERE cr.room_id = $2
         AND (
           cr.room_type = 'global'
           OR (cr.room_type = 'team' AND cr.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active'))
           OR (cr.room_type = 'league' AND cr.league_id IN (
               SELECT tla.league_id 
               FROM team_league_assignments tla
               WHERE tla.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active')
               AND tla.status = 'active'
             ))
         )`,
      [player_id, roomId]
    );

    if (roomAccess.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this room' });
    }

    // Build query for messages - optimized without team JOINs
    let query = `
      SELECT 
        cm.*,
        pp.first_name,
        pp.last_name,
        pp.gamer_tag,
        pp.avatar_url
      FROM chat_messages cm
      JOIN player_profile pp ON cm.player_id = pp.player_id
      WHERE cm.room_id = $1 AND cm.deleted_at IS NULL
    `;

    const params = [roomId];
    let paramCount = 1;

    // Cursor-based pagination
    if (before) {
      paramCount++;
      query += ` AND cm.message_id < $${paramCount}`;
      params.push(before);
    }

    if (after) {
      paramCount++;
      query += ` AND cm.message_id > $${paramCount}`;
      params.push(after);
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Reverse for chronological order
    const messages = result.rows.reverse();

    // Get unique player_ids from messages to batch fetch team data
    const uniquePlayerIds = [...new Set(messages.map(msg => msg.player_id))];
    
    // Batch fetch team data for all players in these messages
    const teamDataMap = new Map();
    
    for (const playerId of uniquePlayerIds) {
      try {
        // Fetch team data from database (no Redis caching)
        const teamQuery = await db.query(
          `SELECT 
            tp.team_id,
            tp.name as team_name,
            tp.colors as team_colors,
            tp.platform as team_platform
           FROM player_team_assignments pta
           JOIN team_profile tp ON pta.team_id = tp.team_id
           WHERE pta.player_id = $1 AND pta.status = 'active'
           LIMIT 1`,
          [playerId]
        );
        
        const teamInfo = teamQuery.rows.length > 0 ? teamQuery.rows[0] : null;
        teamDataMap.set(playerId, teamInfo);
      } catch (error) {
        teamDataMap.set(playerId, null);
      }
    }

    // Attach team data to each message
    const messagesWithTeamData = messages.map(message => ({
      ...message,
      team_id: teamDataMap.get(message.player_id)?.team_id || null,
      team_name: teamDataMap.get(message.player_id)?.team_name || null,
      team_colors: teamDataMap.get(message.player_id)?.team_colors || null,
      team_platform: teamDataMap.get(message.player_id)?.team_platform || null
    }));

    res.json({
      messages: messagesWithTeamData,
      hasMore: result.rows.length === parseInt(limit),
      oldestMessageId: messages.length > 0 ? messages[0].message_id : null,
      newestMessageId: messages.length > 0 ? messages[messages.length - 1].message_id : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

// Send message
const sendMessage = async (req, res) => {
  const { roomId } = req.params;
  const { message_text, reply_to_message_id } = req.body;
  const { user_id } = req.user;

  try {
    // Get player_id
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const player_id = playerResult.rows[0].player_id;

    // Verify room access (same as getMessages)
    const roomAccess = await db.query(
      `SELECT cr.* FROM chat_rooms cr
       WHERE cr.room_id = $2
         AND (
           cr.room_type = 'global'
           OR (cr.room_type = 'team' AND cr.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active'))
           OR (cr.room_type = 'league' AND cr.league_id IN (
               SELECT tla.league_id 
               FROM team_league_assignments tla
               WHERE tla.team_id IN (SELECT team_id FROM player_team_assignments WHERE player_id = $1 AND status = 'active')
               AND tla.status = 'active'
             ))
         )`,
      [player_id, roomId]
    );

    if (roomAccess.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this room' });
    }

    // Insert message
    const result = await db.query(
      `INSERT INTO chat_messages (room_id, user_id, player_id, message_text, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [roomId, user_id, player_id, message_text, reply_to_message_id || null]
    );

    // Get full message with user info
    const messageWithUser = await db.query(
      `SELECT 
        cm.*,
        pp.first_name,
        pp.last_name,
        pp.gamer_tag,
        pp.avatar_url
      FROM chat_messages cm
      JOIN player_profile pp ON cm.player_id = pp.player_id
      WHERE cm.message_id = $1`,
      [result.rows[0].message_id]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: messageWithUser.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message' });
  }
};

// Delete message (soft delete)
const deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const { user_id } = req.user;

  try {
    // Check if user owns the message
    const result = await db.query(
      `UPDATE chat_messages 
       SET deleted_at = NOW()
       WHERE message_id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [messageId, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found or already deleted' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete message' });
  }
};

// Edit message
const editMessage = async (req, res) => {
  const { messageId } = req.params;
  const { message_text } = req.body;
  const { user_id } = req.user;

  try {
    const result = await db.query(
      `UPDATE chat_messages 
       SET message_text = $1, edited_at = NOW()
       WHERE message_id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [message_text, messageId, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json({
      message: 'Message updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit message' });
  }
};

// Get current user's team information
const getUserTeamInfo = async (req, res) => {
  const { user_id } = req.user;

  try {
    // Get player_id
    const playerResult = await db.query(
      'SELECT player_id FROM player_profile WHERE user_id = $1',
      [user_id]
    );

    if (playerResult.rows.length === 0) {
      return res.json({ teamInfo: null, player_id: null });
    }

    const player_id = playerResult.rows[0].player_id;

    // Fetch team data from database
    const teamQuery = await db.query(
      `SELECT 
        tp.team_id,
        tp.name as team_name,
        tp.colors as team_colors,
        tp.crest_url as team_crest,
        pta.role_in_team
       FROM player_team_assignments pta
       JOIN team_profile tp ON pta.team_id = tp.team_id
       WHERE pta.player_id = $1 AND pta.status = 'active'
       LIMIT 1`,
      [player_id]
    );

    const teamInfo = teamQuery.rows.length > 0 ? teamQuery.rows[0] : null;

    res.json({ teamInfo, player_id });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch team information' });
  }
};

module.exports = {
  getChatRooms,
  getMessages,
  sendMessage,
  deleteMessage,
  editMessage,
  getUserTeamInfo
};
