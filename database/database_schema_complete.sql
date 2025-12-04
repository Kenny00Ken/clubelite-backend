-- Club Elite Global - PostgreSQL Database Schema
-- Version 2.3 - Updated 2025-11-26
-- Based on current database structure
-- ================================

-- ================================
-- PART 1: EXTENSIONS & TYPES
-- ================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom ENUM types
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE role_type AS ENUM ('player', 'captain', 'admin', 'governor', 'cfo', 'cto', 'council');
CREATE TYPE league_type AS ENUM ('official', 'franchise', 'community');
CREATE TYPE league_status AS ENUM ('draft', 'pending_approval', 'active', 'completed');
CREATE TYPE platform AS ENUM ('Playstation', 'XBOX', 'PC', 'Other');
CREATE TYPE team_status AS ENUM ('active', 'inactive', 'disbanded');
CREATE TYPE player_status AS ENUM ('active', 'retired', 'suspended');
CREATE TYPE player_position AS ENUM ('GK', 'DEF', 'MID', 'FWD');
CREATE TYPE detailed_position AS ENUM ('GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LWB', 'RWB', 'CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST', 'LS', 'RS');
CREATE TYPE team_role AS ENUM ('owner', 'captain', 'vice_captain', 'player');
CREATE TYPE assignment_status AS ENUM ('active', 'benched', 'transferred', 'released');
CREATE TYPE transfer_type AS ENUM ('trade', 'free_agent', 'loan', 'release');
CREATE TYPE match_status AS ENUM ('scheduled', 'lineups_pending', 'live', 'completed', 'cancelled');
CREATE TYPE match_type AS ENUM ('league', 'playoff', 'friendly');
CREATE TYPE lineup_status AS ENUM ('draft', 'submitted', 'approved', 'locked');
CREATE TYPE event_type AS ENUM ('GOAL', 'ASSIST', 'YELLOW', 'RED', 'SAVE', 'CLEAN_SHEET', 'MVP');
CREATE TYPE event_source AS ENUM ('OCR', 'manual', 'EA_API');
CREATE TYPE event_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE wallet_owner_type AS ENUM ('player', 'team', 'league', 'treasury');
CREATE TYPE transaction_type AS ENUM ('reward', 'fine', 'transfer', 'prize', 'bonus');
CREATE TYPE approval_level AS ENUM ('ADMIN', 'GOVERNOR', 'CFO');
CREATE TYPE reward_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE offense_type AS ENUM ('misconduct', 'cheating', 'no_show', 'technical');
CREATE TYPE action_type AS ENUM ('approve_event', 'approve_lineup', 'execute_payout', 'update_config', 'create_league', 'create_team');
CREATE TYPE announcement_scope AS ENUM ('global', 'league', 'team');
CREATE TYPE announcement_priority AS ENUM ('info', 'warning', 'critical');
CREATE TYPE conflict_status AS ENUM ('active', 'resolved');
CREATE TYPE window_status AS ENUM ('upcoming', 'active', 'closed');


-- Table: admin_activity_log
CREATE TABLE admin_activity_log (
  log_id integer NOT NULL DEFAULT nextval('admin_activity_log_log_id_seq'::regclass),
  admin_id uuid NOT NULL,
  action_type USER-DEFINED NOT NULL,
  entity_type character varying(50),
  entity_id character varying(100),
  changes jsonb,
  ip_address inet,
  user_agent text,
  timestamp timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(user_id),
  CONSTRAINT 2200_17013_1_not_null log_id IS NOT NULL,
  CONSTRAINT 2200_17013_2_not_null admin_id IS NOT NULL,
  CONSTRAINT 2200_17013_3_not_null action_type IS NOT NULL
);

-- Table: announcements
CREATE TABLE announcements (
  announcement_id integer NOT NULL DEFAULT nextval('announcements_announcement_id_seq'::regclass),
  title character varying(255) NOT NULL,
  body text NOT NULL,
  scope USER-DEFINED DEFAULT 'global'::announcement_scope,
  scope_id character varying(50),
  priority USER-DEFINED DEFAULT 'info'::announcement_priority,
  created_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp without time zone,
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT 2200_17042_1_not_null announcement_id IS NOT NULL,
  CONSTRAINT 2200_17042_2_not_null title IS NOT NULL,
  CONSTRAINT 2200_17042_3_not_null body IS NOT NULL
);

-- Table: chat_messages
CREATE TABLE chat_messages (
  message_id bigint NOT NULL DEFAULT nextval('chat_messages_message_id_seq'::regclass),
  room_id character varying(50) NOT NULL,
  user_id character varying(50) NOT NULL,
  player_id character varying(50),
  message_text text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  edited_at timestamp without time zone,
  deleted_at timestamp without time zone,
  reply_to_message_id bigint,
  FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages(message_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(room_id),
  CONSTRAINT 2200_17388_1_not_null message_id IS NOT NULL,
  CONSTRAINT 2200_17388_2_not_null room_id IS NOT NULL,
  CONSTRAINT 2200_17388_3_not_null user_id IS NOT NULL,
  CONSTRAINT 2200_17388_5_not_null message_text IS NOT NULL,
  CONSTRAINT message_not_empty ((length(TRIM(BOTH FROM message_text)) > 0))
);

-- Table: chat_rooms
CREATE TABLE chat_rooms (
  room_id character varying(50) NOT NULL,
  room_type character varying(20) NOT NULL,
  team_id character varying(50),
  league_id character varying(50),
  name character varying(100) NOT NULL,
  description text,
  created_by character varying(50),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT 2200_17378_1_not_null room_id IS NOT NULL,
  CONSTRAINT 2200_17378_2_not_null room_type IS NOT NULL,
  CONSTRAINT 2200_17378_5_not_null name IS NOT NULL
);

-- Table: etl_transactions
CREATE TABLE etl_transactions (
  transaction_id integer NOT NULL DEFAULT nextval('etl_transactions_transaction_id_seq'::regclass),
  from_wallet_id character varying(50),
  to_wallet_id character varying(50),
  amount numeric,
  transaction_type character varying(30),
  fixture_id character varying(50),
  reward_id integer,
  description text,
  executed_by character varying(50),
  executed_at timestamp without time zone DEFAULT now(),
  CONSTRAINT 2200_17342_1_not_null transaction_id IS NOT NULL
);

-- Table: etl_wallet
CREATE TABLE etl_wallet (
  wallet_id character varying(50) NOT NULL,
  owner_type USER-DEFINED NOT NULL,
  owner_id character varying(50) NOT NULL,
  balance integer DEFAULT 0,
  locked_balance integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT 2200_16933_1_not_null wallet_id IS NOT NULL,
  CONSTRAINT 2200_16933_2_not_null owner_type IS NOT NULL,
  CONSTRAINT 2200_16933_3_not_null owner_id IS NOT NULL,
  CONSTRAINT etl_wallet_balance_check ((balance >= 0)),
  CONSTRAINT etl_wallet_locked_balance_check ((locked_balance >= 0))
);

-- Table: league_master
CREATE TABLE league_master (
  league_id character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  region character varying(100) NOT NULL,
  season character varying(50),
  created_by uuid,
  governor_id uuid,
  status USER-DEFINED DEFAULT 'draft'::league_status,
  approved_by uuid,
  season_start date,
  season_end date,
  prize_pool_etl integer DEFAULT 0,
  config jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  max_teams integer DEFAULT 12,
  description text,
  match_interval_days integer DEFAULT 2,
  match_type character varying(20) DEFAULT 'ROUND_ROBIN'::character varying,
  match_start_time time DEFAULT '19:00:00', -- Default 7 PM match start time
  FOREIGN KEY (approved_by) REFERENCES users(user_id),
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  FOREIGN KEY (governor_id) REFERENCES users(user_id),
  CONSTRAINT 2200_16735_1_not_null league_id IS NOT NULL,
  CONSTRAINT 2200_16735_2_not_null name IS NOT NULL,
  CONSTRAINT 2200_16735_3_not_null region IS NOT NULL,
  CONSTRAINT check_match_interval (((match_interval_days >= 1) AND (match_interval_days <= 14))),
  CONSTRAINT check_match_type (((match_type)::text = ANY ((ARRAY['ROUND_ROBIN'::character varying, 'SINGLE_ROBIN'::character varying, 'DOUBLE_ROBIN'::character varying, 'KNOCKOUT'::character varying, 'LEAGUE_CUP'::character varying])::text[])))
);

-- Add comment to clarify match types
COMMENT ON COLUMN league_master.match_type IS 'Match format: ROUND_ROBIN (double round robin), SINGLE_ROBIN (single round robin), DOUBLE_ROBIN (double round robin), KNOCKOUT (single elimination), LEAGUE_CUP (two-legged knockout)';

-- Table: match_fixtures
CREATE TABLE match_fixtures (
  fixture_id character varying(50) NOT NULL DEFAULT ((('CEG-FX-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('fixture_id_seq'::regclass))::text, 4, '0'::text)),
  league_id character varying(50),
  home_team_id character varying(50),
  away_team_id character varying(50),
  match_date timestamp without time zone NOT NULL,
  match_week integer,
  platform character varying(20) DEFAULT 'PS5'::character varying,
  status character varying(20) DEFAULT 'scheduled'::character varying,
  home_score integer,
  away_score integer,
  venue character varying(100),
  created_by character varying(50),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT 2200_17295_1_not_null fixture_id IS NOT NULL,
  CONSTRAINT 2200_17295_5_not_null match_date IS NOT NULL
);

-- Table: match_lineups
CREATE TABLE match_lineups (
  lineup_id integer NOT NULL DEFAULT nextval('match_lineups_lineup_id_seq'::regclass),
  match_id character varying(100) NOT NULL,
  team_id character varying(50) NOT NULL,
  submitted_by uuid NOT NULL,
  formation character varying(20),
  submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  status USER-DEFINED DEFAULT 'draft'::lineup_status,
  approved_by uuid,
  approved_at timestamp without time zone,
  FOREIGN KEY (approved_by) REFERENCES users(user_id),
  FOREIGN KEY (match_id) REFERENCES match_master(match_id),
  FOREIGN KEY (submitted_by) REFERENCES users(user_id),
  FOREIGN KEY (team_id) REFERENCES team_profile(team_id),
  CONSTRAINT 2200_16861_1_not_null lineup_id IS NOT NULL,
  CONSTRAINT 2200_16861_2_not_null match_id IS NOT NULL,
  CONSTRAINT 2200_16861_3_not_null team_id IS NOT NULL,
  CONSTRAINT 2200_16861_4_not_null submitted_by IS NOT NULL
);

-- Table: match_master
CREATE TABLE match_master (
  match_id character varying(100) NOT NULL,
  league_id character varying(50) NOT NULL,
  home_team_id character varying(50) NOT NULL,
  away_team_id character varying(50) NOT NULL,
  match_date timestamp without time zone NOT NULL,
  status USER-DEFINED DEFAULT 'scheduled'::match_status,
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,
  platform USER-DEFINED,
  match_type USER-DEFINED DEFAULT 'league'::match_type,
  metadata jsonb,
  created_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (away_team_id) REFERENCES team_profile(team_id),
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  FOREIGN KEY (home_team_id) REFERENCES team_profile(team_id),
  FOREIGN KEY (league_id) REFERENCES league_master(league_id),
  CONSTRAINT 2200_16827_1_not_null match_id IS NOT NULL,
  CONSTRAINT 2200_16827_2_not_null league_id IS NOT NULL,
  CONSTRAINT 2200_16827_3_not_null home_team_id IS NOT NULL,
  CONSTRAINT 2200_16827_4_not_null away_team_id IS NOT NULL,
  CONSTRAINT 2200_16827_5_not_null match_date IS NOT NULL,
  CONSTRAINT match_master_check (((home_team_id)::text <> (away_team_id)::text)),
  CONSTRAINT match_master_check (((home_team_id)::text <> (away_team_id)::text))
);

-- Table: match_stats
CREATE TABLE match_stats (
  stats_id integer NOT NULL DEFAULT nextval('match_stats_stats_id_seq'::regclass),
  fixture_id character varying(50),
  player_id character varying(50),
  team_id character varying(50),
  goals integer DEFAULT 0,
  assists integer DEFAULT 0,
  saves integer DEFAULT 0,
  clean_sheet boolean DEFAULT false,
  yellow_cards integer DEFAULT 0,
  red_cards integer DEFAULT 0,
  minutes_played integer DEFAULT 90,
  is_mvp boolean DEFAULT false,
  submitted_by character varying(50),
  submitted_at timestamp without time zone,
  approved_by character varying(50),
  approved_at timestamp without time zone,
  status character varying(20) DEFAULT 'pending'::character varying,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT 2200_17311_1_not_null stats_id IS NOT NULL
);

-- Table: pending_rewards
CREATE TABLE pending_rewards (
  reward_id integer NOT NULL DEFAULT nextval('pending_rewards_reward_id_seq'::regclass),
  fixture_id character varying(50),
  player_id character varying(50),
  team_id character varying(50),
  amount numeric,
  reason character varying(100),
  calculated_by character varying(50),
  calculated_at timestamp without time zone DEFAULT now(),
  approved_by character varying(50),
  approved_at timestamp without time zone,
  paid_by character varying(50),
  paid_at timestamp without time zone,
  status character varying(20) DEFAULT 'pending'::character varying,
  CONSTRAINT 2200_17333_1_not_null reward_id IS NOT NULL
);

-- Table: player_profile
CREATE TABLE player_profile (
  player_id character varying(50) NOT NULL,
  user_id uuid NOT NULL,
  first_name character varying(100) NOT NULL,
  last_name character varying(100) NOT NULL,
  gamer_tag character varying(100) NOT NULL,
  avatar_url character varying(500),
  bio text,
  date_of_birth date,
  nationality character varying(100),
  preferred_positions ARRAY,
  platform platform DEFAULT 'PC',
  status USER-DEFINED DEFAULT 'active'::player_status,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  jersey_number integer,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT 2200_17161_1_not_null player_id IS NOT NULL,
  CONSTRAINT 2200_17161_2_not_null user_id IS NOT NULL,
  CONSTRAINT 2200_17161_3_not_null first_name IS NOT NULL,
  CONSTRAINT 2200_17161_4_not_null last_name IS NOT NULL,
  CONSTRAINT 2200_17161_5_not_null gamer_tag IS NOT NULL,
  CONSTRAINT player_profile_jersey_number_check (((jersey_number >= 0) AND (jersey_number <= 99)))
);

-- Table: player_team_assignments
CREATE TABLE player_team_assignments (
  assignment_id integer NOT NULL DEFAULT nextval('player_team_assignments_assignment_id_seq'::regclass),
  player_id character varying(50) NOT NULL,
  team_id character varying(50) NOT NULL,
  role_in_team character varying(20) DEFAULT 'player'::character varying,
  status character varying(20) DEFAULT 'active'::character varying,
  jersey_number integer,
  joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  left_at timestamp without time zone,
  assigned_by uuid,
  FOREIGN KEY (assigned_by) REFERENCES users(user_id),
  FOREIGN KEY (player_id) REFERENCES player_profile(player_id),
  FOREIGN KEY (team_id) REFERENCES team_profile(team_id),
  CONSTRAINT 2200_17183_1_not_null assignment_id IS NOT NULL,
  CONSTRAINT 2200_17183_2_not_null player_id IS NOT NULL,
  CONSTRAINT 2200_17183_3_not_null team_id IS NOT NULL,
  CONSTRAINT unique_player_team UNIQUE (player_id, team_id),
  CONSTRAINT player_team_assignments_jersey_number_check (((jersey_number >= 1) AND (jersey_number <= 99)))
);

-- Table: player_transfers
CREATE TABLE player_transfers (
  transfer_id integer NOT NULL DEFAULT nextval('player_transfers_transfer_id_seq'::regclass),
  player_id character varying(50),
  from_team_id character varying(50),
  to_team_id character varying(50),
  league_id character varying(50),
  transfer_type character varying(20) DEFAULT 'TRANSFER'::character varying,
  transfer_fee numeric DEFAULT 0,
  requested_by character varying(50),
  requested_at timestamp without time zone DEFAULT now(),
  approved_by character varying(50),
  approved_at timestamp without time zone,
  rejected_by character varying(50),
  rejected_at timestamp without time zone,
  status character varying(20) DEFAULT 'pending'::character varying,
  start_date date,
  end_date date,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT 2200_17358_1_not_null transfer_id IS NOT NULL
);

-- Table: team_join_requests
CREATE TABLE team_join_requests (
  request_id integer NOT NULL DEFAULT nextval('team_join_requests_request_id_seq'::regclass),
  team_id character varying(50) NOT NULL,
  player_id character varying(50) NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying,
  message text,
  requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  processed_at timestamp without time zone,
  processed_by uuid,
  FOREIGN KEY (player_id) REFERENCES player_profile(player_id),
  FOREIGN KEY (processed_by) REFERENCES users(user_id),
  FOREIGN KEY (team_id) REFERENCES team_profile(team_id),
  CONSTRAINT 2200_17217_1_not_null request_id IS NOT NULL,
  CONSTRAINT 2200_17217_2_not_null team_id IS NOT NULL,
  CONSTRAINT 2200_17217_3_not_null player_id IS NOT NULL,
  CONSTRAINT team_join_requests_status_check (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);

-- Table: team_profile
CREATE TABLE team_profile (
  team_id character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  crest_url character varying(500),
  colors jsonb,
  platform USER-DEFINED,
  status USER-DEFINED DEFAULT 'active'::team_status,
  etl_wallet_id character varying(50),
  created_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  description character varying(30),
  team_size integer,
  server_region character varying(50),
  FOREIGN KEY (etl_wallet_id) REFERENCES etl_wallet(wallet_id),
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT 2200_16761_1_not_null team_id IS NOT NULL,
  CONSTRAINT 2200_16761_3_not_null name IS NOT NULL
);

-- Table: team_league_assignments
CREATE TABLE team_league_assignments (
  assignment_id integer NOT NULL DEFAULT nextval('team_league_assignments_assignment_id_seq'::regclass),
  team_id character varying(50) NOT NULL,
  league_id character varying(50) NOT NULL,
  joined_at timestamp without time zone DEFAULT now(),
  status character varying(20) DEFAULT 'active'::character varying,
  approved_by uuid,
  approved_at timestamp without time zone,
  FOREIGN KEY (approved_by) REFERENCES users(user_id),
  FOREIGN KEY (league_id) REFERENCES league_master(league_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES team_profile(team_id) ON DELETE CASCADE,
  CONSTRAINT team_league_assignments_pkey PRIMARY KEY (assignment_id),
  CONSTRAINT team_league_assignments_team_id_league_id_key UNIQUE (team_id, league_id)
);

-- Table: transfer_windows
CREATE TABLE transfer_windows (
  window_id integer NOT NULL DEFAULT nextval('transfer_windows_window_id_seq'::regclass),
  league_id character varying(50) NOT NULL,
  window_name character varying(100) NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  status USER-DEFINED DEFAULT 'upcoming'::window_status,
  max_transfers_per_team integer DEFAULT 3,
  created_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  FOREIGN KEY (league_id) REFERENCES league_master(league_id),
  CONSTRAINT 2200_16805_1_not_null window_id IS NOT NULL,
  CONSTRAINT 2200_16805_2_not_null league_id IS NOT NULL,
  CONSTRAINT 2200_16805_3_not_null window_name IS NOT NULL,
  CONSTRAINT 2200_16805_4_not_null window_start IS NOT NULL,
  CONSTRAINT 2200_16805_5_not_null window_end IS NOT NULL,
  CONSTRAINT transfer_windows_check ((window_end > window_start)),
  CONSTRAINT transfer_windows_check ((window_end > window_start))
);

-- Table: user_2fa
CREATE TABLE user_2fa (
  user_id uuid NOT NULL,
  totp_secret character varying(255) NOT NULL,
  backup_codes jsonb,
  enabled_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT 2200_16722_1_not_null user_id IS NOT NULL,
  CONSTRAINT 2200_16722_2_not_null totp_secret IS NOT NULL
);

-- Table: user_roles
CREATE TABLE user_roles (
  role_id integer NOT NULL DEFAULT nextval('user_roles_role_id_seq'::regclass),
  user_id uuid NOT NULL,
  role_type USER-DEFINED NOT NULL,
  scope character varying(100),
  assigned_by uuid,
  assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_by) REFERENCES users(user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT 2200_16705_1_not_null role_id IS NOT NULL,
  CONSTRAINT 2200_16705_2_not_null user_id IS NOT NULL,
  CONSTRAINT 2200_16705_3_not_null role_type IS NOT NULL
);

-- Table: users
CREATE TABLE users (
  user_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  email character varying(255) NOT NULL,
  password_hash character varying(255) NOT NULL,
  phone character varying(50),
  status USER-DEFINED DEFAULT 'active'::user_status,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  last_login_at timestamp without time zone,
  username character varying(50),
  CONSTRAINT 2200_16691_1_not_null user_id IS NOT NULL,
  CONSTRAINT 2200_16691_2_not_null email IS NOT NULL,
  CONSTRAINT 2200_16691_3_not_null password_hash IS NOT NULL
);

-- Table: weighted_event_ledger
CREATE TABLE weighted_event_ledger (
  event_type character varying(50) NOT NULL,
  base_value integer NOT NULL,
  multiplier numeric DEFAULT 1.0,
  requires_approval_level USER-DEFINED DEFAULT 'ADMIN'::approval_level,
  auto_execute boolean DEFAULT false,
  description text,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_by uuid,
  FOREIGN KEY (updated_by) REFERENCES users(user_id),
  CONSTRAINT 2200_16972_1_not_null event_type IS NOT NULL,
  CONSTRAINT 2200_16972_2_not_null base_value IS NOT NULL
);
