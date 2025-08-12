const { getDatabase } = require('../database/connection');

class WebhookManager {
    constructor(trelloService) {
        this.trelloService = trelloService;
        this.db = getDatabase();
    }

    /**
     * Register a webhook for a specific board
     * Ensures only one webhook per board exists
     */
    async registerBoardWebhook(boardId, callbackUrl, description = 'Discord-Trello Bot Multi-Board Webhook') {
        try {
            // Check if webhook already exists for this board
            const existingRegistration = await this.db.getQuery(
                'SELECT * FROM webhook_registrations WHERE board_id = ?',
                [boardId]
            );

            if (existingRegistration) {
                console.log(`✅ Webhook already registered for board ${boardId}: ${existingRegistration.webhook_id}`);
                return {
                    success: true,
                    webhookId: existingRegistration.webhook_id,
                    existed: true,
                    registration: existingRegistration
                };
            }

            // Create new webhook with Trello API
            const webhook = await this.trelloService.createWebhook(callbackUrl, boardId, description);

            // Store webhook registration in database
            await this.db.runQuery(
                `INSERT INTO webhook_registrations 
                 (board_id, webhook_id, callback_url, description, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
                [boardId, webhook.id, callbackUrl, description]
            );

            console.log(`🪝 Webhook registered for board ${boardId}: ${webhook.id}`);

            return {
                success: true,
                webhookId: webhook.id,
                existed: false,
                webhook: webhook
            };

        } catch (error) {
            console.error(`❌ Error registering webhook for board ${boardId}:`, error);
            throw error;
        }
    }

    /**
     * Unregister a webhook for a specific board
     */
    async unregisterBoardWebhook(boardId) {
        try {
            // Get webhook registration
            const registration = await this.db.getQuery(
                'SELECT * FROM webhook_registrations WHERE board_id = ?',
                [boardId]
            );

            if (!registration) {
                console.log(`⚠️ No webhook found for board ${boardId}`);
                return { success: false, message: 'No webhook found for this board' };
            }

            // Delete webhook with Trello API
            await this.trelloService.deleteWebhook(registration.webhook_id);

            // Remove from database
            await this.db.runQuery(
                'DELETE FROM webhook_registrations WHERE board_id = ?',
                [boardId]
            );

            console.log(`🗑️ Webhook unregistered for board ${boardId}: ${registration.webhook_id}`);

            return {
                success: true,
                webhookId: registration.webhook_id,
                boardId: boardId
            };

        } catch (error) {
            console.error(`❌ Error unregistering webhook for board ${boardId}:`, error);
            throw error;
        }
    }

    /**
     * Get all channels configured for a specific board
     */
    async getChannelsForBoard(boardId) {
        try {
            // Get direct channel mappings
            const channelMappings = await this.db.allQuery(
                'SELECT guild_id, channel_id FROM channel_mappings WHERE board_id = ?',
                [boardId]
            );

            // Get default configurations that use this board
            const defaultConfigs = await this.db.allQuery(
                'SELECT guild_id FROM default_configs WHERE default_board_id = ?',
                [boardId]
            );

            return {
                channelMappings: channelMappings || [],
                defaultGuilds: defaultConfigs || []
            };

        } catch (error) {
            console.error(`❌ Error getting channels for board ${boardId}:`, error);
            return { channelMappings: [], defaultGuilds: [] };
        }
    }

    /**
     * Route notification to all channels configured for a board
     */
    async routeNotificationToChannels(boardId, discordClient, embed) {
        try {
            const channels = await this.getChannelsForBoard(boardId);
            let notificationsSent = 0;

            // Send to specific channel mappings
            for (const mapping of channels.channelMappings) {
                try {
                    const guild = discordClient.guilds.cache.get(mapping.guild_id);
                    if (guild) {
                        const channel = guild.channels.cache.get(mapping.channel_id);
                        if (channel && channel.permissionsFor(discordClient.user)?.has('SendMessages')) {
                            await channel.send({ embeds: [embed] });
                            notificationsSent++;
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error sending notification to channel ${mapping.channel_id}:`, error);
                }
            }

            // Send to default guild configurations
            for (const config of channels.defaultGuilds) {
                try {
                    const guild = discordClient.guilds.cache.get(config.guild_id);
                    if (guild) {
                        // Send to system channel or first available channel
                        const targetChannel = guild.systemChannel || 
                            guild.channels.cache.find(ch => 
                                ch.type === 0 && ch.permissionsFor(discordClient.user)?.has('SendMessages')
                            );
                        if (targetChannel) {
                            await targetChannel.send({ embeds: [embed] });
                            notificationsSent++;
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error sending notification to guild ${config.guild_id}:`, error);
                }
            }

            console.log(`📤 Sent ${notificationsSent} notifications for board ${boardId}`);
            return { success: true, notificationsSent };

        } catch (error) {
            console.error(`❌ Error routing notifications for board ${boardId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Auto-register webhooks for all unique boards in configuration
     */
    async autoRegisterWebhooksForConfiguredBoards(callbackUrl) {
        try {
            console.log('🔧 Auto-registering webhooks for all configured boards...');

            // Get all unique board IDs from channel mappings
            const channelBoards = await this.db.allQuery(
                'SELECT DISTINCT board_id FROM channel_mappings'
            );

            // Get all unique board IDs from default configs
            const defaultBoards = await this.db.allQuery(
                'SELECT DISTINCT default_board_id as board_id FROM default_configs'
            );

            // Combine and deduplicate board IDs
            const allBoards = [
                ...(channelBoards || []).map(row => row.board_id),
                ...(defaultBoards || []).map(row => row.board_id)
            ];
            const uniqueBoards = [...new Set(allBoards.filter(Boolean))];

            console.log(`📋 Found ${uniqueBoards.length} unique boards to register webhooks for`);

            const results = [];

            for (const boardId of uniqueBoards) {
                try {
                    const result = await this.registerBoardWebhook(
                        boardId, 
                        `${callbackUrl}/webhook/trello`,
                        'Discord-Trello Bot Auto-registered Multi-Board'
                    );
                    results.push({ boardId, success: true, ...result });
                } catch (error) {
                    console.error(`❌ Failed to register webhook for board ${boardId}:`, error.message);
                    results.push({ 
                        boardId, 
                        success: false, 
                        error: error.message 
                    });
                }
            }

            const successful = results.filter(r => r.success).length;
            console.log(`✅ Successfully registered webhooks for ${successful}/${uniqueBoards.length} boards`);

            return { success: true, results, total: uniqueBoards.length, successful };

        } catch (error) {
            console.error('❌ Error in auto-webhook registration:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clean up orphaned webhook registrations
     * (webhooks that exist in DB but not in Trello, or vice versa)
     */
    async cleanupOrphanedWebhooks() {
        try {
            console.log('🧹 Cleaning up orphaned webhook registrations...');

            // Get all registered webhooks from database
            const dbWebhooks = await this.db.allQuery(
                'SELECT board_id, webhook_id FROM webhook_registrations'
            );

            // Get all active webhooks from Trello
            const trelloWebhooks = await this.trelloService.listWebhooks();

            let cleanedUp = 0;

            // Check for webhooks in DB that don't exist in Trello
            for (const dbWebhook of dbWebhooks || []) {
                const existsInTrello = trelloWebhooks.find(tw => tw.id === dbWebhook.webhook_id);
                if (!existsInTrello) {
                    console.log(`🗑️ Removing orphaned webhook registration: ${dbWebhook.webhook_id}`);
                    await this.db.runQuery(
                        'DELETE FROM webhook_registrations WHERE webhook_id = ?',
                        [dbWebhook.webhook_id]
                    );
                    cleanedUp++;
                }
            }

            console.log(`🧹 Cleaned up ${cleanedUp} orphaned webhook registrations`);
            return { success: true, cleanedUp };

        } catch (error) {
            console.error('❌ Error cleaning up webhooks:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get webhook registration status
     */
    async getWebhookRegistrations() {
        try {
            const registrations = await this.db.allQuery(
                'SELECT * FROM webhook_registrations ORDER BY created_at DESC'
            );
            
            return registrations || [];

        } catch (error) {
            console.error('❌ Error getting webhook registrations:', error);
            return [];
        }
    }

    /**
     * Health check for webhook system
     */
    async healthCheck() {
        try {
            const registrations = await this.getWebhookRegistrations();
            const trelloWebhooks = await this.trelloService.listWebhooks();
            
            const activeRegistrations = registrations.filter(reg => 
                trelloWebhooks.find(tw => tw.id === reg.webhook_id)
            );

            return {
                healthy: true,
                totalRegistrations: registrations.length,
                activeRegistrations: activeRegistrations.length,
                trelloWebhooks: trelloWebhooks.length
            };

        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

module.exports = { WebhookManager };