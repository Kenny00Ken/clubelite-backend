-- Club Elite Database Schema
-- Generated from actual database structure
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom ENUM types
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE role_type AS ENUM ('player', 'captain', 'admin', 'governor', 'cfo', 'cto', 'council');
CREATE TYPE approval_level AS ENUM ('ADMIN', 'GOVERNOR', 'COUNCIL');
CREATE TYPE window_status AS ENUM ('upcoming', 'open', 'closed');
CREATE TYPE platform AS ENUM ('Playstation', 'XBOX', 'PC', 'Other');
CREATE TYPE team_status AS ENUM ('active', 'inactive', 'disbanded');
CREATE TYPE player_status AS ENUM ('active', 'retired', 'suspended');

-- =============================================
-- TABLES
-- =============================================

-- Users table
CREATE TABLE users (
    user_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    phone VARCHAR,
    status user_status DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    username VARCHAR
);

-- User 2FA
CREATE TABLE user_2fa (
    user_id UUID PRIMARY KEY REFERENCES users(user_id),
    totp_secret VARCHAR NOT NULL,
    backup_codes JSONB,
    enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Roles
CREATE TABLE user_roles (
    role_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    role_type role_type NOT NULL,
    scope VARCHAR,
    assigned_by UUID REFERENCES users(user_id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Profile
CREATE TABLE player_profile (
    player_id VARCHAR PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    gamer_tag VARCHAR NOT NULL,
    avatar_url VARCHAR,
    bio TEXT,
    date_of_birth DATE,
    nationality VARCHAR,
    preferred_positions TEXT[],
    status player_status DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    jersey_number INTEGER,
    platform platform DEFAULT 'PC'
);

-- Teams table (new structure)
CREATE TABLE teams (
    team_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR NOT NULL,
    crest_url VARCHAR,
    primary_color VARCHAR DEFAULT '#FF0000',
    secondary_color VARCHAR DEFAULT '#000000',
    platform VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'active',
    description TEXT,
    team_size INTEGER DEFAULT 15,
    server_region VARCHAR,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team Profile (legacy)
CREATE TABLE team_profile (
    team_id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    crest_url VARCHAR,
    colors JSONB,
    platform platform NOT NULL,
    status team_status DEFAULT 'active',
    etl_wallet_id VARCHAR,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR,
    team_size INTEGER,
    server_region VARCHAR
);

-- Player Team Assignments
CREATE TABLE player_team_assignments (
    assignment_id SERIAL PRIMARY KEY,
    player_id VARCHAR NOT NULL REFERENCES player_profile(player_id),
    team_id VARCHAR NOT NULL REFERENCES team_profile(team_id),
    role_in_team VARCHAR DEFAULT 'player',
    status VARCHAR DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    assigned_by UUID REFERENCES users(user_id)
);

-- Team Join Requests
CREATE TABLE team_join_requests (
    request_id SERIAL PRIMARY KEY,
    team_id VARCHAR NOT NULL REFERENCES team_profile(team_id),
    player_id VARCHAR NOT NULL REFERENCES player_profile(player_id),
    status VARCHAR DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    request_type VARCHAR DEFAULT 'join_request'
);

-- Leagues
CREATE TABLE leagues (
    league_id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    season VARCHAR NOT NULL,
    description TEXT,
    league_type VARCHAR,
    status VARCHAR DEFAULT 'draft',
    season_start DATE,
    season_end DATE,
    prize_pool_etl INTEGER,
    max_teams INTEGER,
    match_interval_days INTEGER,
    match_type VARCHAR,
    match_start_time TIME,
    auto_generate_fixtures BOOLEAN,
    governor_email VARCHAR,
    governor_first_name VARCHAR,
    governor_last_name VARCHAR
);

-- Team League Assignments
CREATE TABLE team_league_assignments (
    assignment_id SERIAL PRIMARY KEY,
    team_id VARCHAR NOT NULL REFERENCES team_profile(team_id),
    league_id VARCHAR NOT NULL REFERENCES leagues(league_id),
    joined_at TIMESTAMP DEFAULT now(),
    status VARCHAR DEFAULT 'active',
    approved_by UUID REFERENCES users(user_id),
    approved_at TIMESTAMP
);

-- Fixtures
CREATE TABLE fixtures (
    fixture_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id VARCHAR NOT NULL REFERENCES leagues(league_id),
    home_team_id VARCHAR REFERENCES team_profile(team_id),
    away_team_id VARCHAR REFERENCES team_profile(team_id),
    fixture_date TIMESTAMP NOT NULL,
    venue VARCHAR,
    status VARCHAR DEFAULT 'scheduled',
    home_score INTEGER,
    away_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lineups
CREATE TABLE lineups (
    lineup_id UUID PRIMARY KEY,
    fixture_id UUID NOT NULL REFERENCES fixtures(fixture_id),
    team_id VARCHAR NOT NULL REFERENCES team_profile(team_id),
    player_id VARCHAR NOT NULL REFERENCES player_profile(player_id),
    position VARCHAR,
    is_starting BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Transfers
CREATE TABLE player_transfers (
    transfer_id SERIAL PRIMARY KEY,
    player_id VARCHAR REFERENCES player_profile(player_id),
    from_team_id VARCHAR REFERENCES team_profile(team_id),
    to_team_id VARCHAR REFERENCES team_profile(team_id),
    league_id VARCHAR REFERENCES leagues(league_id),
    transfer_type VARCHAR DEFAULT 'TRANSFER',
    transfer_fee NUMERIC DEFAULT 0,
    requested_by VARCHAR,
    requested_at TIMESTAMP DEFAULT now(),
    approved_by VARCHAR,
    approved_at TIMESTAMP,
    rejected_by VARCHAR,
    rejected_at TIMESTAMP,
    status VARCHAR DEFAULT 'pending',
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Transfer Windows
CREATE TABLE transfer_windows (
    window_id SERIAL PRIMARY KEY,
    league_id VARCHAR NOT NULL REFERENCES leagues(league_id),
    window_name VARCHAR NOT NULL,
    window_start DATE NOT NULL,
    window_end DATE NOT NULL,
    status window_status DEFAULT 'upcoming',
    max_transfers_per_team INTEGER DEFAULT 3,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallets
CREATE TABLE wallets (
    wallet_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID REFERENCES player_profile(user_id),
    balance NUMERIC DEFAULT 0,
    currency VARCHAR DEFAULT 'ETL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE transactions (
    transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID REFERENCES wallets(wallet_id),
    amount NUMERIC NOT NULL,
    transaction_type VARCHAR NOT NULL,
    description TEXT,
    reference_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weighted Event Ledger
CREATE TABLE weighted_event_ledger (
    event_type VARCHAR PRIMARY KEY,
    base_value INTEGER NOT NULL,
    multiplier NUMERIC DEFAULT 1.0,
    requires_approval_level approval_level DEFAULT 'ADMIN',
    auto_execute BOOLEAN DEFAULT false,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(user_id)
);

-- Chat Messages
CREATE TABLE chat_messages (
    message_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_type VARCHAR NOT NULL,
    chat_id VARCHAR NOT NULL,
    sender_id UUID NOT NULL REFERENCES users(user_id),
    content TEXT NOT NULL,
    message_type VARCHAR DEFAULT 'text',
    reply_to UUID REFERENCES chat_messages(message_id),
    reactions JSONB,
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat Participants
CREATE TABLE chat_participants (
    participant_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_type VARCHAR NOT NULL,
    chat_id VARCHAR NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id),
    role VARCHAR DEFAULT 'member',
    last_read_at TIMESTAMP,
    is_muted BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP
);

-- League Applications
CREATE TABLE league_applications (
    application_id SERIAL PRIMARY KEY,
    league_id VARCHAR NOT NULL REFERENCES leagues(league_id),
    team_id VARCHAR NOT NULL REFERENCES team_profile(team_id),
    applied_by UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP,
    review_notes TEXT
);

-- League Events
CREATE TABLE league_events (
    event_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id VARCHAR NOT NULL REFERENCES leagues(league_id),
    event_type VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    event_date TIMESTAMP,
    venue VARCHAR,
    status VARCHAR DEFAULT 'upcoming',
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ETL Distributions
CREATE TABLE etl_distributions (
    distribution_id SERIAL PRIMARY KEY,
    league_id VARCHAR REFERENCES leagues(league_id),
    team_id VARCHAR REFERENCES team_profile(team_id),
    player_id VARCHAR REFERENCES player_profile(player_id),
    amount NUMERIC NOT NULL,
    distribution_type VARCHAR NOT NULL,
    reference_id VARCHAR,
    approved_by UUID REFERENCES users(user_id),
    approved_at TIMESTAMP,
    paid_by VARCHAR,
    paid_at TIMESTAMP,
    status VARCHAR DEFAULT 'pending'
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_player_profile_user_id ON player_profile(user_id);
CREATE INDEX idx_player_profile_gamer_tag ON player_profile(gamer_tag);
CREATE INDEX idx_teams_created_by ON teams(created_by);
CREATE INDEX idx_team_profile_created_by ON team_profile(created_by);
CREATE INDEX idx_player_team_assignments_player_id ON player_team_assignments(player_id);
CREATE INDEX idx_player_team_assignments_team_id ON player_team_assignments(team_id);
CREATE INDEX idx_team_join_requests_team_id ON team_join_requests(team_id);
CREATE INDEX idx_team_join_requests_player_id ON team_join_requests(player_id);
CREATE INDEX idx_team_league_assignments_team_id ON team_league_assignments(team_id);
CREATE INDEX idx_team_league_assignments_league_id ON team_league_assignments(league_id);
CREATE INDEX idx_fixtures_league_id ON fixtures(league_id);
CREATE INDEX idx_fixtures_home_team_id ON fixtures(home_team_id);
CREATE INDEX idx_fixtures_away_team_id ON fixtures(away_team_id);
CREATE INDEX idx_lineups_fixture_id ON lineups(fixture_id);
CREATE INDEX idx_lineups_team_id ON lineups(team_id);
CREATE INDEX idx_wallets_player_id ON wallets(player_id);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_type, chat_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_participants_chat ON chat_participants(chat_type, chat_id);
CREATE INDEX idx_chat_participants_user ON chat_participants(user_id);
