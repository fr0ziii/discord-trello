const { getDatabase } = require('./connection');

class MigrationManager {
    constructor() {
        this.db = getDatabase();
        this.migrations = [
            {
                version: '1.0.0',
                description: 'Initial schema creation',
                applied: true // This is handled by schema.sql
            },
            {
                version: '1.2.0',
                description: 'Phase 3.3 Advanced Features - Role permissions, audit logging, analytics, templates',
                applied: false
            }
            // Future migrations will be added here
        ];
    }

    async getCurrentVersion() {
        try {
            const result = await this.db.getQuery(
                `SELECT value FROM db_metadata WHERE key = 'schema_version'`
            );
            return result ? result.value : '0.0.0';
        } catch (error) {
            console.error('❌ Failed to get current schema version:', error.message);
            return '0.0.0';
        }
    }

    async setVersion(version) {
        try {
            await this.db.runQuery(
                `INSERT OR REPLACE INTO db_metadata (key, value, updated_at) 
                 VALUES ('schema_version', ?, datetime('now'))`,
                [version]
            );
            console.log(`✅ Schema version updated to: ${version}`);
        } catch (error) {
            console.error('❌ Failed to update schema version:', error.message);
            throw error;
        }
    }

    async runMigrations() {
        try {
            await this.db.initialize();
            
            const currentVersion = await this.getCurrentVersion();
            console.log(`📊 Current database schema version: ${currentVersion}`);
            
            // Check if any migrations need to be applied
            const pendingMigrations = this.migrations.filter(migration => 
                !migration.applied && this.compareVersions(migration.version, currentVersion) > 0
            );
            
            if (pendingMigrations.length === 0) {
                console.log('✅ Database schema is up to date');
                return;
            }
            
            console.log(`🔄 Found ${pendingMigrations.length} pending migrations`);
            
            for (const migration of pendingMigrations) {
                console.log(`⏳ Applying migration ${migration.version}: ${migration.description}`);
                
                try {
                    // Apply migration logic here
                    await this.applyMigration(migration);
                    await this.setVersion(migration.version);
                    
                    console.log(`✅ Migration ${migration.version} applied successfully`);
                } catch (error) {
                    console.error(`❌ Failed to apply migration ${migration.version}:`, error.message);
                    throw error;
                }
            }
            
            console.log('🎉 All migrations applied successfully');
            
        } catch (error) {
            console.error('❌ Migration process failed:', error);
            throw error;
        }
    }

    async applyMigration(migration) {
        // This method will be expanded as we add more migrations
        switch (migration.version) {
            case '1.0.0':
                // Initial schema - handled by schema.sql
                break;
            case '1.2.0':
                await this.applyPhase33Migration();
                break;
            default:
                console.log(`⚠️ No migration logic for version ${migration.version}`);
        }
    }

    async applyPhase33Migration() {
        console.log('🔧 Applying Phase 3.3 database schema extensions...');
        
        // Role permissions table
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                permission_level TEXT NOT NULL CHECK(permission_level IN ('admin', 'moderator', 'user')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, role_id)
            )
        `);
        
        // Audit logging table
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_tag TEXT,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                details TEXT,
                ip_address TEXT,
                success BOOLEAN NOT NULL DEFAULT 1,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Usage analytics table
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS usage_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                command_args TEXT,
                execution_time INTEGER,
                success BOOLEAN NOT NULL,
                error_message TEXT,
                board_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Configuration templates table
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS configuration_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                template_data TEXT NOT NULL,
                created_by TEXT,
                is_public BOOLEAN DEFAULT 0,
                use_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Admin settings table for server-specific admin configurations
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS admin_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL UNIQUE,
                moderator_roles TEXT,
                admin_roles TEXT,
                audit_channel_id TEXT,
                analytics_enabled BOOLEAN DEFAULT 1,
                ai_suggestions_enabled BOOLEAN DEFAULT 1,
                settings_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // System statistics table for global metrics
        await this.db.runQuery(`
            CREATE TABLE IF NOT EXISTS system_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT NOT NULL,
                metric_value TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(metric_name, timestamp)
            )
        `);
        
        // Create indexes for performance
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_role_permissions_guild ON role_permissions(guild_id)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_audit_log_guild_timestamp ON audit_log(guild_id, timestamp DESC)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_action ON audit_log(user_id, action)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_usage_analytics_guild_timestamp ON usage_analytics(guild_id, timestamp DESC)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_usage_analytics_command ON usage_analytics(command, timestamp DESC)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_configuration_templates_public ON configuration_templates(is_public, use_count DESC)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_admin_settings_guild ON admin_settings(guild_id)`);
        await this.db.runQuery(`CREATE INDEX IF NOT EXISTS idx_system_statistics_metric_timestamp ON system_statistics(metric_name, timestamp DESC)`);
        
        // Insert default configuration templates
        await this.insertDefaultTemplates();
        
        console.log('✅ Phase 3.3 database schema extensions applied successfully');
    }

    async insertDefaultTemplates() {
        const defaultTemplates = [
            {
                name: 'Development Team',
                description: 'Standard setup for development teams with dev/staging/prod channels',
                template_data: JSON.stringify({
                    channels: [
                        { pattern: '*dev*', boardType: 'development', listType: 'backlog' },
                        { pattern: '*staging*', boardType: 'staging', listType: 'testing' },
                        { pattern: '*prod*', boardType: 'production', listType: 'monitoring' }
                    ],
                    labels: ['bug', 'feature', 'hotfix', 'urgent'],
                    defaultSettings: {
                        aiSuggestions: true,
                        analytics: true,
                        autoWebhooks: true
                    }
                }),
                is_public: 1
            },
            {
                name: 'Support Team',
                description: 'Configuration for customer support teams with ticket management',
                template_data: JSON.stringify({
                    channels: [
                        { pattern: '*ticket*', boardType: 'support', listType: 'new_tickets' },
                        { pattern: '*bug*', boardType: 'bugs', listType: 'reported' },
                        { pattern: '*feature*', boardType: 'features', listType: 'requests' }
                    ],
                    labels: ['high-priority', 'customer-facing', 'internal', 'resolved'],
                    defaultSettings: {
                        aiSuggestions: true,
                        analytics: true,
                        priorityRouting: true
                    }
                }),
                is_public: 1
            },
            {
                name: 'Project Management',
                description: 'Setup for project managers with individual project boards',
                template_data: JSON.stringify({
                    channels: [
                        { pattern: '*project*', boardType: 'project', listType: 'planning' },
                        { pattern: '*meeting*', boardType: 'meetings', listType: 'agenda' },
                        { pattern: '*review*', boardType: 'reviews', listType: 'pending' }
                    ],
                    labels: ['milestone', 'deliverable', 'blocked', 'in-review'],
                    defaultSettings: {
                        aiSuggestions: true,
                        analytics: true,
                        dueDateTracking: true
                    }
                }),
                is_public: 1
            },
            {
                name: 'Educational',
                description: 'Configuration for educational institutions with course management',
                template_data: JSON.stringify({
                    channels: [
                        { pattern: '*class*', boardType: 'course', listType: 'assignments' },
                        { pattern: '*assignment*', boardType: 'assignments', listType: 'submitted' },
                        { pattern: '*grade*', boardType: 'grading', listType: 'pending' }
                    ],
                    labels: ['homework', 'exam', 'project', 'late'],
                    defaultSettings: {
                        aiSuggestions: false,
                        analytics: true,
                        studentAccess: true
                    }
                }),
                is_public: 1
            }
        ];

        for (const template of defaultTemplates) {
            try {
                await this.db.runQuery(`
                    INSERT OR IGNORE INTO configuration_templates (name, description, template_data, created_by, is_public)
                    VALUES (?, ?, ?, 'system', ?)
                `, [template.name, template.description, template.template_data, template.is_public]);
            } catch (error) {
                console.error(`⚠️ Failed to insert template '${template.name}':`, error.message);
            }
        }
        
        console.log('✅ Default configuration templates inserted');
    }

    compareVersions(version1, version2) {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part > v2Part) return 1;
            if (v1Part < v2Part) return -1;
        }
        
        return 0;
    }

    async validateSchema() {
        try {
            // Validate that all required tables exist
            const requiredTables = [
                'channel_mappings', 'default_configs', 'webhook_registrations', 'db_metadata',
                'role_permissions', 'audit_log', 'usage_analytics', 'configuration_templates',
                'admin_settings', 'system_statistics'
            ];
            
            for (const table of requiredTables) {
                const result = await this.db.getQuery(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                    [table]
                );
                
                if (!result) {
                    throw new Error(`Required table '${table}' is missing`);
                }
            }
            
            console.log('✅ Database schema validation passed');
            return true;
            
        } catch (error) {
            console.error('❌ Database schema validation failed:', error.message);
            return false;
        }
    }

    async getSchemaInfo() {
        try {
            const tables = await this.db.allQuery(
                `SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name`
            );
            
            const version = await this.getCurrentVersion();
            const metadata = await this.db.allQuery(
                `SELECT * FROM db_metadata ORDER BY key`
            );
            
            return {
                version,
                tables: tables.length,
                tableDetails: tables,
                metadata
            };
        } catch (error) {
            console.error('❌ Failed to get schema info:', error.message);
            throw error;
        }
    }
}

module.exports = { MigrationManager };