const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Test DB Connection
const testDbConnection = async () => {
  try {
    const res = await db.query('SELECT NOW()');
    console.log('Database connected successfully at:', res.rows[0].now);
  } catch (err) {
    console.error('Warning: Could not connect to the database. The server will still run, but API endpoints requiring DB will fail.');
    console.error('DB Error:', err.message);
  }
};

testDbConnection();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Club Elite Global API is running 🚀' });
});

// Import Routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const leagueRoutes = require('./routes/leagues');
const teamRoutes = require('./routes/teams');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const playerRoutes = require('./routes/players');
const fixtureRoutes = require('./routes/fixtures');
const lineupRoutes = require('./routes/lineups');
const statsRoutes = require('./routes/stats');
const rewardsRoutes = require('./routes/rewards');
const walletRoutes = require('./routes/wallet');
const transferRoutes = require('./routes/transfers');
const chatRoutes = require('./routes/chat');

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/fixtures', fixtureRoutes);
app.use('/api/lineups', lineupRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/chat', chatRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
