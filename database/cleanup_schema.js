const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'clubelite',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function cleanupSchema() {
  try {
    await pool.connect();
    console.log('Connected to database');

    // Step 1: Remove processed_by from team_join_requests table
    console.log('\n=== Step 1: Removing processed_by from team_join_requests ===');
    
    // Check if column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'team_join_requests' 
      AND column_name = 'processed_by'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('Found processed_by column, removing it...');
      
      await pool.query(`
        ALTER TABLE team_join_requests 
        DROP COLUMN IF EXISTS processed_by
      `);
      
      console.log('✅ processed_by column removed from team_join_requests');
    } else {
      console.log('ℹ️ processed_by column does not exist in team_join_requests');
    }

    // Step 2: Remove jersey_number from player_team_assignments table
    console.log('\n=== Step 2: Removing jersey_number from player_team_assignments ===');
    
    // Check if column exists
    const jerseyCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'player_team_assignments' 
      AND column_name = 'jersey_number'
    `);
    
    if (jerseyCheck.rows.length > 0) {
      console.log('Found jersey_number column, removing it...');
      
      await pool.query(`
        ALTER TABLE player_team_assignments 
        DROP COLUMN IF EXISTS jersey_number
      `);
      
      console.log('✅ jersey_number column removed from player_team_assignments');
    } else {
      console.log('ℹ️ jersey_number column does not exist in player_team_assignments');
    }

    // Step 3: Verify the changes
    console.log('\n=== Step 3: Verification ===');
    
    // Check team_join_requests structure
    const teamJoinRequestsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'team_join_requests' 
      ORDER BY ordinal_position
    `);
    
    console.log('\nTeam Join Requests table columns:');
    teamJoinRequestsColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
    });

    // Check player_team_assignments structure
    const playerTeamAssignmentsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'player_team_assignments' 
      ORDER BY ordinal_position
    `);
    
    console.log('\nPlayer Team Assignments table columns:');
    playerTeamAssignmentsColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
    });

    // Step 4: Update any backend code references
    console.log('\n=== Step 4: Backend Code Updates Needed ===');
    console.log('⚠️  You will need to update the following backend files:');
    console.log('   - controllers/teamController.js (remove processed_by references)');
    console.log('   - Any other files that reference these columns');
    console.log('   - Update TypeScript interfaces if they exist');

    console.log('\n✅ Database cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await pool.end();
  }
}

cleanupSchema();
