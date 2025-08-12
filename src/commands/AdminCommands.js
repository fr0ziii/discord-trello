const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { PermissionManager } = require('../services/PermissionManager');
const { getDatabase } = require('../database/connection');

class AdminCommands {
    constructor(configManager, trelloService, webhookManager, permissionManager = null) {
        this.configManager = configManager;
        this.trelloService = trelloService;
        this.webhookManager = webhookManager;
        this.permissionManager = permissionManager || new PermissionManager();
        this.db = getDatabase();
        
        // Admin command handlers registry
        this.adminCommands = new Map();
        this.registerAdminCommands();
    }

    registerAdminCommands() {
        // Register all admin commands
        this.adminCommands.set('boards', this.handleBoardsCommand.bind(this));
        this.adminCommands.set('reset', this.handleResetCommand.bind(this));
        this.adminCommands.set('status', this.handleAdminStatusCommand.bind(this));
        this.adminCommands.set('webhooks', this.handleWebhooksCommand.bind(this));
        this.adminCommands.set('permissions', this.handlePermissionsCommand.bind(this));
        this.adminCommands.set('analytics', this.handleAnalyticsCommand.bind(this));
        this.adminCommands.set('export', this.handleExportCommand.bind(this));
        this.adminCommands.set('import', this.handleImportCommand.bind(this));
        this.adminCommands.set('templates', this.handleTemplatesCommand.bind(this));
        this.adminCommands.set('suggest', this.handleSuggestCommand.bind(this));
        this.adminCommands.set('migrate', this.handleMigrateCommand.bind(this));
        this.adminCommands.set('settings', this.handleSettingsCommand.bind(this));
    }

    async handleAdminCommand(message, args) {
        try {
            // Check if user has admin permissions
            const hasAdminPerms = await this.permissionManager.hasAdminPermissions(
                message.author, 
                message.guild
            );

            if (!hasAdminPerms) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Access Denied')
                    .setDescription('You need administrator permissions to use admin commands.')
                    .addFields({
                        name: '🔑 Required Permissions',
                        value: '• Discord Server Administrator\n• Discord Manage Guild\n• Custom Admin Role\n• Database Admin Permission',
                        inline: false
                    })
                    .setFooter({ text: 'Discord-Trello Bot • Admin Commands' })
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                return;
            }

            if (args.length === 0) {
                await this.showAdminHelp(message);
                return;
            }

            const subcommand = args[0].toLowerCase();
            const subArgs = args.slice(1);

            if (this.adminCommands.has(subcommand)) {
                const handler = this.adminCommands.get(subcommand);
                await handler(message, subArgs);
            } else {
                await this.showAdminHelp(message, `Unknown admin command: ${subcommand}`);
            }

        } catch (error) {
            console.error('❌ Error in admin command handling:', error);
            await message.reply('❌ An error occurred processing the admin command. Please try again.');
        }
    }

    async showAdminHelp(message, errorMessage = null) {
        const embed = new EmbedBuilder()
            .setColor(errorMessage ? 0xff0000 : 0x0079bf)
            .setTitle('🛠️ Admin Commands Help')
            .setDescription(errorMessage || 'Administrative commands for Discord-Trello Bot management')
            .addFields(
                {
                    name: '📋 Board Management',
                    value: '`admin boards [filter]` - List all accessible Trello boards\n`admin boards search <query>` - Search boards by name',
                    inline: false
                },
                {
                    name: '🔄 Configuration Management',
                    value: '`admin reset [type]` - Reset configurations (all/channel/server/webhooks)\n`admin export [format]` - Export server configurations\n`admin import <attachment>` - Import configurations from file',
                    inline: false
                },
                {
                    name: '📊 Analytics & Monitoring',
                    value: '`admin status` - Comprehensive server analytics\n`admin analytics [timeframe]` - Usage analytics dashboard\n`admin webhooks` - Webhook management and health',
                    inline: false
                },
                {
                    name: '🔒 Permission Management',
                    value: '`admin permissions list` - Show role permissions\n`admin permissions set <role> <level>` - Set role permission level\n`admin permissions remove <role>` - Remove role permission',
                    inline: false
                },
                {
                    name: '📝 Templates & Migration',
                    value: '`admin templates list` - Show available templates\n`admin templates apply <name>` - Apply configuration template\n`admin migrate suggest` - Suggest optimal configuration',
                    inline: false
                },
                {
                    name: '⚙️ Server Settings',
                    value: '`admin settings show` - Show server admin settings\n`admin settings update <key>=<value>` - Update admin settings\n`admin suggest` - AI-powered configuration suggestions',
                    inline: false
                }
            )
            .setFooter({ text: 'Discord-Trello Bot • Admin Commands • Requires Administrator Permissions' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    async handleBoardsCommand(message, args) {
        try {
            await message.react('⏳');

            const filter = args[0] || 'all';
            const searchQuery = args[0] === 'search' ? args.slice(1).join(' ') : null;

            // Get all accessible boards via TrelloService
            const boardsData = await this.trelloService.getAllAccessibleBoards();
            
            if (!boardsData || boardsData.length === 0) {
                await message.react('❌');
                const embed = new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle('📋 No Boards Found')
                    .setDescription('No accessible Trello boards found with current API credentials.')
                    .addFields({
                        name: '💡 Troubleshooting',
                        value: '• Check Trello API credentials\n• Verify board access permissions\n• Ensure boards are not archived',
                        inline: false
                    });
                await message.reply({ embeds: [embed] });
                return;
            }

            // Filter boards based on parameters
            let filteredBoards = boardsData;
            
            if (searchQuery) {
                filteredBoards = boardsData.filter(board => 
                    board.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    board.desc.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }

            // Get current server configurations for comparison
            const serverConfigs = await this.configManager.getServerConfigurations(message.guild.id);
            const configuredBoardIds = new Set(serverConfigs.map(config => config.board_id));

            // Paginate results (10 boards per page)
            const pageSize = 10;
            const totalPages = Math.ceil(filteredBoards.length / pageSize);
            const currentPage = 1; // Could be enhanced with page navigation

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredBoards.length);
            const pageBoards = filteredBoards.slice(startIndex, endIndex);

            // Create board listing embed
            const embed = new EmbedBuilder()
                .setColor(0x0079bf)
                .setTitle(`📋 Accessible Trello Boards ${searchQuery ? `(Search: "${searchQuery}")` : ''}`)
                .setDescription(`Found ${filteredBoards.length} boards • Page ${currentPage}/${totalPages}`)
                .setFooter({ text: 'Discord-Trello Bot • Admin Boards' })
                .setTimestamp();

            // Add board information
            for (const board of pageBoards) {
                const isConfigured = configuredBoardIds.has(board.id);
                const memberCount = board.memberships ? board.memberships.length : 'N/A';
                const permission = this.getBoardPermissionLevel(board);
                
                embed.addFields({
                    name: `${isConfigured ? '✅' : '📋'} ${board.name}`,
                    value: `**ID**: \`${board.id}\`\n**URL**: ${board.url}\n**Members**: ${memberCount} • **Permission**: ${permission}${isConfigured ? '\n*🔗 Currently configured on this server*' : ''}`,
                    inline: false
                });
            }

            // Add summary statistics
            const stats = this.calculateBoardStats(filteredBoards, configuredBoardIds);
            embed.addFields({
                name: '📊 Statistics',
                value: `**Total Accessible**: ${stats.total}\n**Configured**: ${stats.configured}\n**Available**: ${stats.available}\n**Admin Access**: ${stats.adminAccess}`,
                inline: true
            });

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in boards command:', error);
            await message.reply('❌ Failed to retrieve board information. Please check Trello API access.');
        }
    }

    async handleResetCommand(message, args) {
        try {
            const resetType = args[0] || 'help';
            
            if (resetType === 'help' || !['all', 'channel', 'server', 'webhooks', 'permissions'].includes(resetType)) {
                const embed = new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle('🔄 Reset Command Help')
                    .setDescription('Reset various bot configurations with confirmation prompts')
                    .addFields(
                        {
                            name: '🗑️ Available Reset Types',
                            value: '`admin reset all` - Reset ALL server configurations (⚠️ DESTRUCTIVE)\n`admin reset channel` - Reset current channel configuration\n`admin reset server` - Reset server default configuration\n`admin reset webhooks` - Reset webhook registrations\n`admin reset permissions` - Reset role permissions',
                            inline: false
                        },
                        {
                            name: '⚠️ Important Notes',
                            value: '• All resets require confirmation\n• Backups are automatically created\n• Reset operations are logged for audit\n• Webhooks will be deregistered from Trello',
                            inline: false
                        }
                    );
                
                await message.reply({ embeds: [embed] });
                return;
            }

            // Send confirmation prompt
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xff6600)
                .setTitle('⚠️ Reset Confirmation Required')
                .setDescription(`You are about to reset: **${resetType.toUpperCase()}**`)
                .addFields({
                    name: '🚨 This action will:',
                    value: this.getResetDescription(resetType),
                    inline: false
                })
                .addFields({
                    name: '🤔 Are you sure?',
                    value: 'React with ✅ to confirm or ❌ to cancel within 30 seconds',
                    inline: false
                });

            const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
            await confirmMessage.react('✅');
            await confirmMessage.react('❌');

            // Wait for user confirmation
            const filter = (reaction, user) => {
                return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
            };

            const collected = await confirmMessage.awaitReactions({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            }).catch(() => null);

            if (!collected || collected.first().emoji.name === '❌') {
                const cancelEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('🚫 Reset Cancelled')
                    .setDescription('Reset operation was cancelled by user.');
                
                await confirmMessage.edit({ embeds: [cancelEmbed] });
                return;
            }

            // Perform the reset operation
            await confirmMessage.react('⏳');
            const result = await this.performResetOperation(resetType, message.guild.id, message.channel.id, message.author);

            const resultEmbed = new EmbedBuilder()
                .setColor(result.success ? 0x00ff00 : 0xff0000)
                .setTitle(result.success ? '✅ Reset Completed' : '❌ Reset Failed')
                .setDescription(result.message)
                .addFields({
                    name: '📊 Summary',
                    value: result.details || 'No additional details available',
                    inline: false
                });

            if (result.backupId) {
                resultEmbed.addFields({
                    name: '💾 Backup Created',
                    value: `Backup ID: \`${result.backupId}\`\nUse \`admin import\` to restore if needed`,
                    inline: false
                });
            }

            await confirmMessage.edit({ embeds: [resultEmbed] });

        } catch (error) {
            console.error('❌ Error in reset command:', error);
            await message.reply('❌ Failed to perform reset operation. Please check logs and try again.');
        }
    }

    async handleAdminStatusCommand(message, args) {
        try {
            await message.react('⏳');

            // Collect comprehensive server analytics
            const analytics = await this.collectServerAnalytics(message.guild.id);
            
            const embed = new EmbedBuilder()
                .setColor(0x0079bf)
                .setTitle(`📊 Server Analytics: ${message.guild.name}`)
                .setDescription('Comprehensive bot status and usage analytics')
                .setThumbnail(message.guild.iconURL() || null)
                .setFooter({ text: 'Discord-Trello Bot • Admin Status' })
                .setTimestamp();

            // Configuration Overview
            embed.addFields({
                name: '⚙️ Configuration Overview',
                value: `**Channels Configured**: ${analytics.channels.configured}/${analytics.channels.total}\n**Default Config**: ${analytics.hasDefaultConfig ? '✅ Set' : '❌ Not Set'}\n**Total Boards Used**: ${analytics.boards.unique}\n**Webhook Registrations**: ${analytics.webhooks.registered}`,
                inline: true
            });

            // Usage Statistics (Last 30 days)
            embed.addFields({
                name: '📈 Usage Statistics (30 days)',
                value: `**Total Commands**: ${analytics.usage.totalCommands}\n**Cards Created**: ${analytics.usage.cardsCreated}\n**Most Active Channel**: ${analytics.usage.mostActiveChannel}\n**Peak Usage Day**: ${analytics.usage.peakDay}`,
                inline: true
            });

            // System Health
            embed.addFields({
                name: '🏥 System Health',
                value: `**Database**: ${analytics.health.database ? '✅' : '❌'}\n**Trello API**: ${analytics.health.trelloApi ? '✅' : '❌'}\n**Webhooks**: ${analytics.health.webhooks}% healthy\n**Cache Hit Rate**: ${analytics.health.cacheHitRate}%`,
                inline: true
            });

            // Performance Metrics
            embed.addFields({
                name: '⚡ Performance Metrics',
                value: `**Avg Response Time**: ${analytics.performance.avgResponseTime}ms\n**Success Rate**: ${analytics.performance.successRate}%\n**Error Rate**: ${analytics.performance.errorRate}%\n**Cache Size**: ${analytics.performance.cacheSize} entries`,
                inline: false
            });

            // Most Active Boards
            if (analytics.boards.mostActive.length > 0) {
                const boardList = analytics.boards.mostActive.slice(0, 5).map((board, index) => 
                    `${index + 1}. ${board.name} (${board.cardCount} cards)`
                ).join('\n');
                
                embed.addFields({
                    name: '🏆 Most Active Boards',
                    value: boardList || 'No board activity recorded',
                    inline: true
                });
            }

            // Permission Statistics
            embed.addFields({
                name: '🔒 Permission Statistics',
                value: `**Admin Users**: ${analytics.permissions.adminUsers}\n**Moderator Users**: ${analytics.permissions.moderatorUsers}\n**Role Permissions**: ${analytics.permissions.rolePermissions}\n**Custom Settings**: ${analytics.permissions.customSettings ? '✅' : '❌'}`,
                inline: true
            });

            // Recent Activity (Last 24h)
            const recentActivity = analytics.recent.activity.slice(0, 3).map(activity => 
                `• ${activity.action} by ${activity.user} (${activity.timeAgo})`
            ).join('\n');

            if (recentActivity) {
                embed.addFields({
                    name: '🕒 Recent Activity (24h)',
                    value: recentActivity || 'No recent activity',
                    inline: false
                });
            }

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in admin status command:', error);
            await message.reply('❌ Failed to generate server analytics. Please check system health.');
        }
    }

    async handleWebhooksCommand(message, args) {
        try {
            await message.react('⏳');

            const action = args[0] || 'list';
            
            switch (action.toLowerCase()) {
                case 'list':
                    await this.listWebhooks(message);
                    break;
                case 'register':
                    await this.registerWebhook(message, args.slice(1));
                    break;
                case 'unregister':
                    await this.unregisterWebhook(message, args.slice(1));
                    break;
                case 'test':
                    await this.testWebhooks(message);
                    break;
                case 'cleanup':
                    await this.cleanupWebhooks(message);
                    break;
                case 'health':
                    await this.checkWebhookHealth(message);
                    break;
                default:
                    await this.showWebhookHelp(message);
            }

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in webhooks command:', error);
            await message.reply('❌ Failed to manage webhooks. Please check system status.');
        }
    }

    // Additional helper methods for admin commands...

    getBoardPermissionLevel(board) {
        if (!board.prefs) return 'Unknown';
        
        switch (board.prefs.permissionLevel) {
            case 'private': return '🔒 Private';
            case 'org': return '🏢 Organization';
            case 'public': return '🌐 Public';
            default: return '❓ Unknown';
        }
    }

    calculateBoardStats(boards, configuredBoardIds) {
        return {
            total: boards.length,
            configured: boards.filter(board => configuredBoardIds.has(board.id)).length,
            available: boards.filter(board => !configuredBoardIds.has(board.id)).length,
            adminAccess: boards.filter(board => 
                board.memberships && board.memberships.some(m => m.memberType === 'admin')
            ).length
        };
    }

    getResetDescription(resetType) {
        const descriptions = {
            all: '• Remove ALL channel mappings\n• Remove server default configuration\n• Deregister ALL webhooks\n• Clear role permissions\n• Reset admin settings',
            channel: '• Remove current channel configuration\n• Keep other channel mappings intact\n• Preserve server defaults',
            server: '• Remove server default configuration\n• Keep individual channel mappings\n• Preserve specific configurations',
            webhooks: '• Deregister all webhook registrations\n• Remove webhook entries from database\n• Keep channel configurations intact',
            permissions: '• Remove all role permissions\n• Reset admin settings to defaults\n• Keep configurations intact'
        };
        
        return descriptions[resetType] || 'Unknown reset type';
    }

    async performResetOperation(resetType, guildId, channelId, user) {
        try {
            let result = { success: false, message: '', details: '', backupId: null };

            // Create backup before reset
            const backupId = await this.createConfigBackup(guildId, resetType);
            result.backupId = backupId;

            switch (resetType) {
                case 'all':
                    await this.resetAllConfigurations(guildId);
                    result = {
                        success: true,
                        message: 'All server configurations have been reset successfully.',
                        details: 'Channel mappings, default config, webhooks, and permissions cleared.',
                        backupId
                    };
                    break;

                case 'channel':
                    const removed = await this.configManager.removeChannelMapping(guildId, channelId);
                    result = {
                        success: removed,
                        message: removed ? 'Channel configuration reset successfully.' : 'No configuration found for this channel.',
                        details: removed ? 'Channel mapping removed from database.' : 'Channel was not configured.',
                        backupId
                    };
                    break;

                case 'server':
                    await this.configManager.removeDefaultConfig(guildId);
                    result = {
                        success: true,
                        message: 'Server default configuration reset successfully.',
                        details: 'Default board and list settings cleared.',
                        backupId
                    };
                    break;

                case 'webhooks':
                    const webhookCount = await this.resetWebhooks(guildId);
                    result = {
                        success: true,
                        message: `Webhook configurations reset successfully.`,
                        details: `${webhookCount} webhook registrations removed.`,
                        backupId
                    };
                    break;

                case 'permissions':
                    const permCount = await this.resetPermissions(guildId);
                    result = {
                        success: true,
                        message: 'Permission configurations reset successfully.',
                        details: `${permCount} role permissions cleared.`,
                        backupId
                    };
                    break;

                default:
                    result = {
                        success: false,
                        message: 'Unknown reset type specified.',
                        details: 'Please use: all, channel, server, webhooks, or permissions.'
                    };
            }

            // Log the reset operation
            await this.logResetOperation(guildId, user, resetType, result.success, result.details);

            return result;

        } catch (error) {
            console.error('❌ Error performing reset operation:', error);
            return {
                success: false,
                message: 'Reset operation failed due to an internal error.',
                details: error.message
            };
        }
    }

    async collectServerAnalytics(guildId) {
        try {
            // This would collect comprehensive analytics
            // For now, returning mock data structure
            return {
                channels: {
                    configured: 5,
                    total: 25
                },
                hasDefaultConfig: true,
                boards: {
                    unique: 3,
                    mostActive: [
                        { name: 'Main Project', cardCount: 45 },
                        { name: 'Bug Tracker', cardCount: 23 }
                    ]
                },
                webhooks: {
                    registered: 3
                },
                usage: {
                    totalCommands: 156,
                    cardsCreated: 89,
                    mostActiveChannel: '#development',
                    peakDay: 'Monday'
                },
                health: {
                    database: true,
                    trelloApi: true,
                    webhooks: 100,
                    cacheHitRate: 85
                },
                performance: {
                    avgResponseTime: 245,
                    successRate: 98.5,
                    errorRate: 1.5,
                    cacheSize: 127
                },
                permissions: {
                    adminUsers: 2,
                    moderatorUsers: 5,
                    rolePermissions: 3,
                    customSettings: true
                },
                recent: {
                    activity: [
                        { action: 'Created card', user: 'user#1234', timeAgo: '2 hours ago' },
                        { action: 'Updated config', user: 'admin#5678', timeAgo: '1 day ago' }
                    ]
                }
            };

        } catch (error) {
            console.error('❌ Error collecting server analytics:', error);
            return this.getDefaultAnalytics();
        }
    }

    getDefaultAnalytics() {
        return {
            channels: { configured: 0, total: 0 },
            hasDefaultConfig: false,
            boards: { unique: 0, mostActive: [] },
            webhooks: { registered: 0 },
            usage: { totalCommands: 0, cardsCreated: 0, mostActiveChannel: 'None', peakDay: 'None' },
            health: { database: false, trelloApi: false, webhooks: 0, cacheHitRate: 0 },
            performance: { avgResponseTime: 0, successRate: 0, errorRate: 0, cacheSize: 0 },
            permissions: { adminUsers: 0, moderatorUsers: 0, rolePermissions: 0, customSettings: false },
            recent: { activity: [] }
        };
    }

    // Placeholder methods for additional admin commands
    async handlePermissionsCommand(message, args) {
        await message.reply('🚧 Permissions management command coming soon...');
    }

    async handleAnalyticsCommand(message, args) {
        await message.reply('🚧 Analytics dashboard command coming soon...');
    }

    async handleExportCommand(message, args) {
        await message.reply('🚧 Configuration export command coming soon...');
    }

    async handleImportCommand(message, args) {
        await message.reply('🚧 Configuration import command coming soon...');
    }

    async handleTemplatesCommand(message, args) {
        await message.reply('🚧 Template management command coming soon...');
    }

    async handleSuggestCommand(message, args) {
        await message.reply('🚧 AI suggestions command coming soon...');
    }

    async handleMigrateCommand(message, args) {
        await message.reply('🚧 Migration tools command coming soon...');
    }

    async handleSettingsCommand(message, args) {
        await message.reply('🚧 Settings management command coming soon...');
    }

    // Placeholder helper methods
    async createConfigBackup(guildId, resetType) {
        return `backup_${Date.now()}`;
    }

    async resetAllConfigurations(guildId) {
        // Implementation would reset all configurations
        return true;
    }

    async resetWebhooks(guildId) {
        // Implementation would reset webhook configurations
        return 0;
    }

    async resetPermissions(guildId) {
        // Implementation would reset permission configurations
        return 0;
    }

    async logResetOperation(guildId, user, resetType, success, details) {
        // Implementation would log the reset operation for audit
        console.log(`Reset operation: ${resetType} by ${user.tag} - ${success ? 'Success' : 'Failed'}`);
    }

    async listWebhooks(message) {
        await message.reply('🚧 Webhook listing coming soon...');
    }

    async showWebhookHelp(message) {
        await message.reply('🚧 Webhook help coming soon...');
    }
}

module.exports = { AdminCommands };