-- Discord-Trello Bot Database Schema
-- SQLite database for channel to board mappings and configuration

-- Channel to board mappings table
CREATE TABLE IF NOT EXISTS channel_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    list_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, channel_id)
);

-- Default server configurations table  
CREATE TABLE IF NOT EXISTS default_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL UNIQUE,
    default_board_id TEXT NOT NULL,
    default_list_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook registrations table for multi-board webhook management
CREATE TABLE IF NOT EXISTS webhook_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id TEXT NOT NULL UNIQUE,
    webhook_id TEXT NOT NULL,
    callback_url TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Database metadata table for migration tracking
CREATE TABLE IF NOT EXISTS db_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial version
INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('schema_version', '1.1.0');
INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('created_at', datetime('now'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_channel_mappings_guild_channel 
ON channel_mappings(guild_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_default_configs_guild 
ON default_configs(guild_id);

CREATE INDEX IF NOT EXISTS idx_webhook_registrations_board 
ON webhook_registrations(board_id);