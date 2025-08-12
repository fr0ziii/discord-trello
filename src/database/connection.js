const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseConnection {
    constructor(dbPath = process.env.DATABASE_PATH || './data/discord-trello.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
    }

    async connect() {
        if (this.db) {
            return this.db;
        }

        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                console.log(`📁 Created database directory: ${dataDir}`);
            }

            // Create database connection
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error connecting to SQLite database:', err.message);
                    throw err;
                }
                console.log(`🗃️ Connected to SQLite database: ${this.dbPath}`);
            });

            // Configure database settings
            await this.runQuery('PRAGMA foreign_keys = ON');
            await this.runQuery('PRAGMA journal_mode = WAL');
            
            return this.db;
        } catch (error) {
            console.error('❌ Failed to connect to database:', error);
            throw error;
        }
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            await this.connect();
            
            // Read and execute schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            // Split schema into individual statements and execute
            const statements = schema.split(';').filter(stmt => stmt.trim());
            
            for (const statement of statements) {
                if (statement.trim()) {
                    await this.runQuery(statement);
                }
            }
            
            console.log('✅ Database schema initialized successfully');
            this.isInitialized = true;
            
            // Populate with default configuration if environment variables exist
            await this.migrateEnvironmentConfig();
            
        } catch (error) {
            console.error('❌ Failed to initialize database:', error);
            throw error;
        }
    }

    async migrateEnvironmentConfig() {
        try {
            const boardId = process.env.TRELLO_BOARD_ID;
            const listId = process.env.TRELLO_LIST_ID;
            
            if (boardId && listId) {
                // Check if we already have any default configs
                const existingConfig = await this.getQuery(
                    'SELECT COUNT(*) as count FROM default_configs'
                );
                
                if (existingConfig.count === 0) {
                    console.log('🔧 Migrating environment configuration to database...');
                    
                    // Create a default entry for environment config
                    // Use 'global' as a placeholder guild_id for environment defaults
                    await this.runQuery(
                        `INSERT INTO default_configs (guild_id, default_board_id, default_list_id) 
                         VALUES (?, ?, ?)`,
                        ['__environment_default__', boardId, listId]
                    );
                    
                    console.log('✅ Environment configuration migrated to database');
                }
            }
        } catch (error) {
            console.error('⚠️ Warning: Failed to migrate environment config:', error.message);
            // Don't throw here - this is not critical for startup
        }
    }

    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }

            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID, 
                        changes: this.changes 
                    });
                }
            });
        });
    }

    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }

            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                        reject(err);
                    } else {
                        console.log('🗃️ Database connection closed');
                        this.db = null;
                        this.isInitialized = false;
                        resolve();
                    }
                });
            });
        }
    }

    // Health check method
    async healthCheck() {
        try {
            await this.getQuery('SELECT 1');
            return true;
        } catch (error) {
            console.error('❌ Database health check failed:', error.message);
            return false;
        }
    }
}

// Singleton instance
let dbInstance = null;

function getDatabase() {
    if (!dbInstance) {
        dbInstance = new DatabaseConnection();
    }
    return dbInstance;
}

module.exports = {
    DatabaseConnection,
    getDatabase
};