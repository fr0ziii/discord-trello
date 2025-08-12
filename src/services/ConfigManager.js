const { getDatabase } = require('../database/connection');

class ConfigManager {
    constructor() {
        this.db = getDatabase();
    }

    async getChannelMapping(guildId, channelId) {
        try {
            const mapping = await this.db.getQuery(
                `SELECT board_id, list_id, created_at, updated_at 
                 FROM channel_mappings 
                 WHERE guild_id = ? AND channel_id = ?`,
                [guildId, channelId]
            );

            if (mapping) {
                return {
                    boardId: mapping.board_id,
                    listId: mapping.list_id,
                    createdAt: mapping.created_at,
                    updatedAt: mapping.updated_at
                };
            }

            // Fallback to default configuration
            const defaultConfig = await this.getDefaultConfig(guildId);
            if (defaultConfig) {
                return {
                    boardId: defaultConfig.boardId,
                    listId: defaultConfig.listId,
                    isDefault: true
                };
            }

            // Final fallback to environment variables for backward compatibility
            const envBoardId = process.env.TRELLO_BOARD_ID;
            const envListId = process.env.TRELLO_LIST_ID;
            
            if (envBoardId && envListId) {
                return {
                    boardId: envBoardId,
                    listId: envListId,
                    isEnvironment: true
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Error getting channel mapping:', error.message);
            
            // Graceful fallback to environment variables on database error
            const envBoardId = process.env.TRELLO_BOARD_ID;
            const envListId = process.env.TRELLO_LIST_ID;
            
            if (envBoardId && envListId) {
                console.log('⚠️ Falling back to environment configuration');
                return {
                    boardId: envBoardId,
                    listId: envListId,
                    isEnvironment: true,
                    isFallback: true
                };
            }
            
            throw error;
        }
    }

    async setChannelMapping(guildId, channelId, boardId, listId) {
        try {
            const result = await this.db.runQuery(
                `INSERT OR REPLACE INTO channel_mappings 
                 (guild_id, channel_id, board_id, list_id, updated_at) 
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [guildId, channelId, boardId, listId]
            );

            console.log(`✅ Channel mapping set: Guild ${guildId}, Channel ${channelId} → Board ${boardId}, List ${listId}`);
            
            return {
                success: true,
                mapping: {
                    guildId,
                    channelId,
                    boardId,
                    listId,
                    updatedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('❌ Error setting channel mapping:', error.message);
            throw error;
        }
    }

    async removeChannelMapping(guildId, channelId) {
        try {
            const result = await this.db.runQuery(
                `DELETE FROM channel_mappings WHERE guild_id = ? AND channel_id = ?`,
                [guildId, channelId]
            );

            if (result.changes > 0) {
                console.log(`✅ Channel mapping removed: Guild ${guildId}, Channel ${channelId}`);
                return { success: true, removed: true };
            } else {
                return { success: true, removed: false, message: 'No mapping found to remove' };
            }
        } catch (error) {
            console.error('❌ Error removing channel mapping:', error.message);
            throw error;
        }
    }

    async getDefaultConfig(guildId) {
        try {
            // First check for guild-specific default
            let defaultConfig = await this.db.getQuery(
                `SELECT default_board_id, default_list_id, created_at, updated_at 
                 FROM default_configs 
                 WHERE guild_id = ?`,
                [guildId]
            );

            if (defaultConfig) {
                return {
                    boardId: defaultConfig.default_board_id,
                    listId: defaultConfig.default_list_id,
                    createdAt: defaultConfig.created_at,
                    updatedAt: defaultConfig.updated_at
                };
            }

            // Fallback to environment default if it exists
            const envDefault = await this.db.getQuery(
                `SELECT default_board_id, default_list_id, created_at, updated_at 
                 FROM default_configs 
                 WHERE guild_id = '__environment_default__'`
            );

            if (envDefault) {
                return {
                    boardId: envDefault.default_board_id,
                    listId: envDefault.default_list_id,
                    isEnvironmentDefault: true,
                    createdAt: envDefault.created_at,
                    updatedAt: envDefault.updated_at
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Error getting default config:', error.message);
            throw error;
        }
    }

    async setDefaultConfig(guildId, boardId, listId) {
        try {
            const result = await this.db.runQuery(
                `INSERT OR REPLACE INTO default_configs 
                 (guild_id, default_board_id, default_list_id, updated_at) 
                 VALUES (?, ?, ?, datetime('now'))`,
                [guildId, boardId, listId]
            );

            console.log(`✅ Default config set: Guild ${guildId} → Board ${boardId}, List ${listId}`);
            
            return {
                success: true,
                config: {
                    guildId,
                    boardId,
                    listId,
                    updatedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('❌ Error setting default config:', error.message);
            throw error;
        }
    }

    async getAllMappings(guildId) {
        try {
            const mappings = await this.db.allQuery(
                `SELECT channel_id, board_id, list_id, created_at, updated_at 
                 FROM channel_mappings 
                 WHERE guild_id = ? 
                 ORDER BY updated_at DESC`,
                [guildId]
            );

            const defaultConfig = await this.getDefaultConfig(guildId);

            return {
                guildId,
                defaultConfig,
                channelMappings: mappings.map(mapping => ({
                    channelId: mapping.channel_id,
                    boardId: mapping.board_id,
                    listId: mapping.list_id,
                    createdAt: mapping.created_at,
                    updatedAt: mapping.updated_at
                })),
                totalMappings: mappings.length
            };
        } catch (error) {
            console.error('❌ Error getting all mappings:', error.message);
            throw error;
        }
    }

    async validateBoardAccess(boardId, listId) {
        // This method can be used to validate that the bot has access to the specified board/list
        // For now, we'll implement a basic structure that can be expanded with actual Trello API calls
        try {
            if (!boardId || !listId) {
                return {
                    valid: false,
                    error: 'Board ID and List ID are required'
                };
            }

            // Basic format validation (Trello IDs are typically 24 characters)
            const trelloIdRegex = /^[a-f\d]{24}$/i;
            
            if (!trelloIdRegex.test(boardId)) {
                return {
                    valid: false,
                    error: 'Invalid board ID format'
                };
            }

            if (!trelloIdRegex.test(listId)) {
                return {
                    valid: false,
                    error: 'Invalid list ID format'
                };
            }

            return {
                valid: true,
                boardId,
                listId
            };
        } catch (error) {
            console.error('❌ Error validating board access:', error.message);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    async getConfigurationSummary(guildId) {
        try {
            const allMappings = await this.getAllMappings(guildId);
            const channelCount = allMappings.channelMappings.length;
            const hasDefault = !!allMappings.defaultConfig;

            return {
                guildId,
                hasDefaultConfig: hasDefault,
                channelMappingCount: channelCount,
                defaultConfig: allMappings.defaultConfig,
                recentMappings: allMappings.channelMappings.slice(0, 5), // Last 5 mappings
                isConfigured: hasDefault || channelCount > 0
            };
        } catch (error) {
            console.error('❌ Error getting configuration summary:', error.message);
            throw error;
        }
    }

    async cleanup() {
        // Method for cleaning up old or invalid configurations
        try {
            // Remove mappings older than 6 months (optional cleanup)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            
            const result = await this.db.runQuery(
                `DELETE FROM channel_mappings 
                 WHERE updated_at < ?`,
                [sixMonthsAgo.toISOString()]
            );

            if (result.changes > 0) {
                console.log(`🧹 Cleaned up ${result.changes} old channel mappings`);
            }

            return result.changes;
        } catch (error) {
            console.error('❌ Error during cleanup:', error.message);
            throw error;
        }
    }
}

module.exports = { ConfigManager };