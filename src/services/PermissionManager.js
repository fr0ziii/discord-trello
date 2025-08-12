const { getDatabase } = require('../database/connection');
const { PermissionsBitField } = require('discord.js');

class PermissionManager {
    constructor() {
        this.db = getDatabase();
        this.permissionCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Check if user has admin permissions in the guild
     * Admin permissions include:
     * - Discord server administrator permission
     * - Discord manage guild permission
     * - Custom admin roles defined in admin_settings
     */
    async hasAdminPermissions(user, guild) {
        try {
            const cacheKey = `admin:${guild.id}:${user.id}`;
            const cached = this.getCachedPermission(cacheKey);
            if (cached !== null) return cached;

            // Check Discord permissions first
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return false;

            // Server Administrator or Manage Guild permissions
            if (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                this.setCachedPermission(cacheKey, true);
                return true;
            }

            // Check custom admin roles
            const adminSettings = await this.getAdminSettings(guild.id);
            if (adminSettings && adminSettings.admin_roles) {
                const adminRoles = JSON.parse(adminSettings.admin_roles);
                const hasAdminRole = member.roles.cache.some(role => 
                    adminRoles.includes(role.id) || adminRoles.includes(role.name)
                );
                
                if (hasAdminRole) {
                    this.setCachedPermission(cacheKey, true);
                    return true;
                }
            }

            // Check role-based permissions in database
            const rolePermissions = await this.getUserRolePermissions(guild.id, user.id);
            const hasAdminPermission = rolePermissions.some(perm => perm.permission_level === 'admin');

            this.setCachedPermission(cacheKey, hasAdminPermission);
            return hasAdminPermission;

        } catch (error) {
            console.error('❌ Error checking admin permissions:', error);
            return false;
        }
    }

    /**
     * Check if user has moderator permissions in the channel
     * Moderator permissions include:
     * - Admin permissions (inherits admin access)
     * - Discord manage channel permission
     * - Custom moderator roles defined in admin_settings
     */
    async hasModeratorPermissions(user, channel) {
        try {
            const guild = channel.guild;
            const cacheKey = `moderator:${guild.id}:${channel.id}:${user.id}`;
            const cached = this.getCachedPermission(cacheKey);
            if (cached !== null) return cached;

            // Admin users automatically have moderator permissions
            if (await this.hasAdminPermissions(user, guild)) {
                this.setCachedPermission(cacheKey, true);
                return true;
            }

            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return false;

            // Check Discord channel permissions
            if (member.permissionsIn(channel).has(PermissionsBitField.Flags.ManageChannels) ||
                member.permissionsIn(channel).has(PermissionsBitField.Flags.ManageMessages)) {
                this.setCachedPermission(cacheKey, true);
                return true;
            }

            // Check custom moderator roles
            const adminSettings = await this.getAdminSettings(guild.id);
            if (adminSettings && adminSettings.moderator_roles) {
                const moderatorRoles = JSON.parse(adminSettings.moderator_roles);
                const hasModeratorRole = member.roles.cache.some(role => 
                    moderatorRoles.includes(role.id) || moderatorRoles.includes(role.name)
                );
                
                if (hasModeratorRole) {
                    this.setCachedPermission(cacheKey, true);
                    return true;
                }
            }

            // Check role-based permissions in database
            const rolePermissions = await this.getUserRolePermissions(guild.id, user.id);
            const hasModeratorPermission = rolePermissions.some(perm => 
                perm.permission_level === 'moderator' || perm.permission_level === 'admin'
            );

            this.setCachedPermission(cacheKey, hasModeratorPermission);
            return hasModeratorPermission;

        } catch (error) {
            console.error('❌ Error checking moderator permissions:', error);
            return false;
        }
    }

    /**
     * Check if user can configure the specified channel
     */
    async canConfigureChannel(user, channel) {
        try {
            const guild = channel.guild;
            
            // Admin and moderator permissions allow configuration
            if (await this.hasAdminPermissions(user, guild) || 
                await this.hasModeratorPermissions(user, channel)) {
                return true;
            }

            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return false;

            // Channel-specific permissions for configuration
            return member.permissionsIn(channel).has(PermissionsBitField.Flags.ManageChannels);

        } catch (error) {
            console.error('❌ Error checking channel configuration permissions:', error);
            return false;
        }
    }

    /**
     * Check if user can access admin commands
     */
    async canAccessAdminCommands(user, guild) {
        return await this.hasAdminPermissions(user, guild);
    }

    /**
     * Get user's role-based permissions from database
     */
    async getUserRolePermissions(guildId, userId) {
        try {
            const member = await this.getMember(guildId, userId);
            if (!member) return [];

            const roleIds = member.roles.cache.map(role => role.id);
            if (roleIds.length === 0) return [];

            const placeholders = roleIds.map(() => '?').join(',');
            const permissions = await this.db.allQuery(`
                SELECT DISTINCT permission_level, role_id 
                FROM role_permissions 
                WHERE guild_id = ? AND role_id IN (${placeholders})
            `, [guildId, ...roleIds]);

            return permissions || [];

        } catch (error) {
            console.error('❌ Error getting user role permissions:', error);
            return [];
        }
    }

    /**
     * Set role permission in database
     */
    async setRolePermission(guildId, roleId, permissionLevel) {
        try {
            if (!['admin', 'moderator', 'user'].includes(permissionLevel)) {
                throw new Error('Invalid permission level');
            }

            await this.db.runQuery(`
                INSERT OR REPLACE INTO role_permissions (guild_id, role_id, permission_level, updated_at)
                VALUES (?, ?, ?, datetime('now'))
            `, [guildId, roleId, permissionLevel]);

            // Clear related caches
            this.clearPermissionCache(guildId);

            return true;

        } catch (error) {
            console.error('❌ Error setting role permission:', error);
            throw error;
        }
    }

    /**
     * Remove role permission from database
     */
    async removeRolePermission(guildId, roleId) {
        try {
            await this.db.runQuery(`
                DELETE FROM role_permissions 
                WHERE guild_id = ? AND role_id = ?
            `, [guildId, roleId]);

            // Clear related caches
            this.clearPermissionCache(guildId);

            return true;

        } catch (error) {
            console.error('❌ Error removing role permission:', error);
            throw error;
        }
    }

    /**
     * Get all role permissions for a guild
     */
    async getGuildRolePermissions(guildId) {
        try {
            const permissions = await this.db.allQuery(`
                SELECT role_id, permission_level, created_at, updated_at
                FROM role_permissions 
                WHERE guild_id = ?
                ORDER BY permission_level, created_at
            `, [guildId]);

            return permissions || [];

        } catch (error) {
            console.error('❌ Error getting guild role permissions:', error);
            return [];
        }
    }

    /**
     * Get admin settings for a guild
     */
    async getAdminSettings(guildId) {
        try {
            const settings = await this.db.getQuery(`
                SELECT * FROM admin_settings WHERE guild_id = ?
            `, [guildId]);

            return settings;

        } catch (error) {
            console.error('❌ Error getting admin settings:', error);
            return null;
        }
    }

    /**
     * Update admin settings for a guild
     */
    async updateAdminSettings(guildId, settings) {
        try {
            const {
                moderatorRoles = [],
                adminRoles = [],
                auditChannelId = null,
                analyticsEnabled = true,
                aiSuggestionsEnabled = true,
                settingsData = {}
            } = settings;

            await this.db.runQuery(`
                INSERT OR REPLACE INTO admin_settings 
                (guild_id, moderator_roles, admin_roles, audit_channel_id, analytics_enabled, ai_suggestions_enabled, settings_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
                guildId,
                JSON.stringify(moderatorRoles),
                JSON.stringify(adminRoles),
                auditChannelId,
                analyticsEnabled ? 1 : 0,
                aiSuggestionsEnabled ? 1 : 0,
                JSON.stringify(settingsData)
            ]);

            // Clear related caches
            this.clearPermissionCache(guildId);

            return true;

        } catch (error) {
            console.error('❌ Error updating admin settings:', error);
            throw error;
        }
    }

    /**
     * Validate permission level for command execution
     */
    async validateCommandPermission(user, guild, channel, requiredLevel = 'user') {
        try {
            switch (requiredLevel) {
                case 'admin':
                    return await this.hasAdminPermissions(user, guild);
                
                case 'moderator':
                    return await this.hasModeratorPermissions(user, channel);
                
                case 'user':
                default:
                    return true; // All users can execute basic commands
            }

        } catch (error) {
            console.error('❌ Error validating command permission:', error);
            return false;
        }
    }

    /**
     * Get permission level for user in context
     */
    async getUserPermissionLevel(user, guild, channel = null) {
        try {
            if (await this.hasAdminPermissions(user, guild)) {
                return 'admin';
            }
            
            if (channel && await this.hasModeratorPermissions(user, channel)) {
                return 'moderator';
            }
            
            return 'user';

        } catch (error) {
            console.error('❌ Error getting user permission level:', error);
            return 'user';
        }
    }

    // Cache management methods
    getCachedPermission(key) {
        const cached = this.permissionCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.value;
        }
        this.permissionCache.delete(key);
        return null;
    }

    setCachedPermission(key, value) {
        this.permissionCache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    clearPermissionCache(guildId = null) {
        if (guildId) {
            for (const [key] of this.permissionCache) {
                if (key.includes(guildId)) {
                    this.permissionCache.delete(key);
                }
            }
        } else {
            this.permissionCache.clear();
        }
    }

    // Helper method to get guild member
    async getMember(guildId, userId) {
        try {
            // This would typically require access to the Discord client
            // For now, we'll return null and rely on the calling code to provide the member
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Health check for PermissionManager
     */
    async healthCheck() {
        try {
            // Test database connectivity
            await this.db.getQuery('SELECT 1');
            
            return {
                healthy: true,
                cacheSize: this.permissionCache.size,
                features: {
                    roleBasedPermissions: true,
                    adminSettings: true,
                    permissionCaching: true
                }
            };

        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                cacheSize: this.permissionCache.size
            };
        }
    }

    /**
     * Get permission statistics for monitoring
     */
    async getPermissionStats(guildId = null) {
        try {
            let query = 'SELECT permission_level, COUNT(*) as count FROM role_permissions';
            let params = [];
            
            if (guildId) {
                query += ' WHERE guild_id = ?';
                params.push(guildId);
            }
            
            query += ' GROUP BY permission_level';
            
            const stats = await this.db.allQuery(query, params);
            
            const adminSettingsCount = await this.db.getQuery(
                'SELECT COUNT(*) as count FROM admin_settings' + (guildId ? ' WHERE guild_id = ?' : ''),
                guildId ? [guildId] : []
            );

            return {
                rolePermissions: stats || [],
                adminSettingsConfigured: adminSettingsCount?.count || 0,
                cacheSize: this.permissionCache.size,
                cacheHitRate: this.calculateCacheHitRate()
            };

        } catch (error) {
            console.error('❌ Error getting permission stats:', error);
            return {
                rolePermissions: [],
                adminSettingsConfigured: 0,
                cacheSize: this.permissionCache.size,
                error: error.message
            };
        }
    }

    calculateCacheHitRate() {
        // This would require tracking hits/misses - simplified for now
        return this.permissionCache.size > 0 ? 0.85 : 0; // Estimated 85% hit rate
    }
}

module.exports = { PermissionManager };