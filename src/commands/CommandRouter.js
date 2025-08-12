const { ConfigManager } = require('../services/ConfigManager');
const { TrelloService } = require('../services/TrelloService');
const { PermissionManager } = require('../services/PermissionManager');
const { AdminCommands } = require('./AdminCommands');
const { AnalyticsManager } = require('../services/AnalyticsManager');
const { AuditLogger } = require('../services/AuditLogger');

class CommandRouter {
    constructor(configManager, trelloService, geminiService = null, webhookManager = null, phase33Services = {}) {
        this.configManager = configManager || new ConfigManager();
        this.trelloService = trelloService || new TrelloService();
        this.geminiService = geminiService;
        this.webhookManager = webhookManager;
        
        // Phase 3.3 services
        this.permissionManager = phase33Services.permissionManager || new PermissionManager();
        this.analyticsManager = phase33Services.analyticsManager || null;
        this.auditLogger = phase33Services.auditLogger || null;
        this.templateManager = phase33Services.templateManager || null;
        this.aiEnhancedManager = phase33Services.aiEnhancedManager || null;
        
        // Initialize admin commands with all required services
        this.adminCommands = new AdminCommands(
            this.configManager,
            this.trelloService,
            this.webhookManager,
            this.permissionManager
        );
        
        // Command handlers registry
        this.commands = new Map();
        this.registerDefaultCommands();
    }

    registerDefaultCommands() {
        // Register all available commands
        this.commands.set('help', this.handleHelpCommand.bind(this));
        this.commands.set('status', this.handleStatusCommand.bind(this));
        this.commands.set('list', this.handleListCommand.bind(this));
        this.commands.set('update', this.handleUpdateCommand.bind(this));
        this.commands.set('config', this.handleConfigCommand.bind(this));
        this.commands.set('admin', this.handleAdminCommand.bind(this));
        
        // Phase 3.3 enhanced commands
        this.commands.set('analytics', this.handleAnalyticsCommand.bind(this));
        this.commands.set('audit', this.handleAuditCommand.bind(this));
        this.commands.set('templates', this.handleTemplatesCommand.bind(this));
        this.commands.set('suggest', this.handleSuggestCommand.bind(this));
        this.commands.set('permissions', this.handlePermissionsCommand.bind(this));
    }

    async routeCommand(message, commandPrefix) {
        if (message.author.bot) return;

        if (!message.content.startsWith(commandPrefix)) return;

        const fullArgs = message.content.slice(commandPrefix.length).trim();
        const [command, ...args] = fullArgs.split(' ');
        
        if (!command) {
            await message.reply('❌ Please provide a command. Use `help` to see available commands.');
            return;
        }

        const startTime = Date.now();
        let success = true;
        let errorMessage = null;

        try {
            // Get board context for analytics
            const config = await this.trelloService.resolveConfiguration(message.guild.id, message.channel.id);
            const boardId = config ? config.boardId : null;

            // Check if it's a registered command
            if (this.commands.has(command.toLowerCase())) {
                const handler = this.commands.get(command.toLowerCase());
                await handler(message, args);
            } else {
                // Default behavior - create card (backward compatibility)
                await this.handleCreateCommand(message, fullArgs);
            }

        } catch (error) {
            success = false;
            errorMessage = error.message;
            console.error('❌ Error processing command:', error);
            await message.reply('❌ An error occurred processing your command. Please try again.');
        } finally {
            // Record analytics if available
            if (this.analyticsManager) {
                const executionTime = Date.now() - startTime;
                await this.analyticsManager.recordCommandExecution(
                    message.guild.id,
                    message.channel.id,
                    message.author.id,
                    command,
                    args,
                    executionTime,
                    success,
                    errorMessage,
                    null // boardId will be resolved in the specific command handler
                );
            }
        }
    }

    async handleHelpCommand(message) {
        const commandPrefix = process.env.COMMAND_PREFIX || '!t';
        
        // Check user permission level to show appropriate commands
        const permissionLevel = await this.permissionManager.getUserPermissionLevel(
            message.author,
            message.guild,
            message.channel
        );

        const embed = {
            color: 0x0079bf,
            title: '🤖 Discord-Trello Bot Commands',
            description: `Your permission level: **${permissionLevel.charAt(0).toUpperCase() + permissionLevel.slice(1)}**`,
            fields: [
                {
                    name: `${commandPrefix} <task_description>`,
                    value: 'Create a new Trello card with AI-powered analysis',
                    inline: false
                },
                {
                    name: `${commandPrefix} status`,
                    value: 'Show current board status and statistics',
                    inline: false
                },
                {
                    name: `${commandPrefix} list [limit]`,
                    value: 'Show recent cards (default: 5, max: 20)',
                    inline: false
                },
                {
                    name: `${commandPrefix} update <card-id> <field>=<value>`,
                    value: 'Update an existing card (fields: name, desc, due)',
                    inline: false
                },
                {
                    name: `${commandPrefix} help`,
                    value: 'Show this help message',
                    inline: false
                }
            ],
            footer: {
                text: this.getFooterText(),
            },
            timestamp: new Date().toISOString()
        };

        // Add permission-appropriate commands
        if (permissionLevel === 'admin' || permissionLevel === 'moderator') {
            embed.fields.push({
                name: '⚙️ Configuration Commands',
                value: `\`${commandPrefix} config board <board-id> [list-id]\` - Configure current channel\n` +
                       `\`${commandPrefix} config show\` - Show current channel configuration\n` +
                       `\`${commandPrefix} config list\` - List all server configurations\n` +
                       `\`${commandPrefix} config remove\` - Remove current channel configuration\n` +
                       `\`${commandPrefix} config default <board-id> <list-id>\` - Set server default`,
                inline: false
            });

            if (this.analyticsManager) {
                embed.fields.push({
                    name: '📊 Analytics Commands',
                    value: `\`${commandPrefix} analytics [timeframe]\` - View usage analytics dashboard\n` +
                           `\`${commandPrefix} audit [filter]\` - View audit logs`,
                    inline: false
                });
            }

            if (this.templateManager) {
                embed.fields.push({
                    name: '📝 Template Commands',
                    value: `\`${commandPrefix} templates list\` - List available templates\n` +
                           `\`${commandPrefix} templates apply <name>\` - Apply configuration template`,
                    inline: false
                });
            }

            if (this.aiEnhancedManager) {
                embed.fields.push({
                    name: '🧠 AI Enhancement Commands',
                    value: `\`${commandPrefix} suggest\` - Get AI-powered configuration suggestions`,
                    inline: false
                });
            }
        }

        // Add admin-only commands
        if (permissionLevel === 'admin') {
            embed.fields.push({
                name: '🛠️ Administrator Commands',
                value: `\`${commandPrefix} admin <subcommand>\` - Access admin control panel\n` +
                       `\`${commandPrefix} permissions <action>\` - Manage role permissions\n` +
                       `Use \`${commandPrefix} admin help\` for detailed admin commands`,
                inline: false
            });
        }
        
        await message.reply({ embeds: [embed] });
    }

    async handleStatusCommand(message) {
        try {
            await message.react('⏳');
            
            const statusData = await this.trelloService.getBoardStatusWithContext(
                message.guild.id, 
                message.channel.id
            );

            if (!statusData) {
                await message.react('❌');
                await message.reply('❌ No board configuration found for this channel. Use `config board <board-id> <list-id>` to set one up.');
                return;
            }

            const { board, lists, config } = statusData;
            let totalCards = 0;
            
            const listFields = lists.map(list => {
                totalCards += list.cards.length;
                return {
                    name: `📋 ${list.name}`,
                    value: `${list.cards.length} cards`,
                    inline: true
                };
            });
            
            const embed = {
                color: 0x0079bf,
                title: `📊 Board Status: ${board.name}`,
                fields: [
                    {
                        name: '📈 Overview',
                        value: `**Total Cards**: ${totalCards}\n**Lists**: ${lists.length}`,
                        inline: false
                    },
                    {
                        name: '⚙️ Configuration',
                        value: `**Channel**: <#${message.channel.id}>\n**Board**: ${board.name} (\`${config.boardId}\`)\n**List ID**: \`${config.listId}\`${config.isDefault ? '\n*(Using default config)*' : ''}${config.isEnvironment ? '\n*(Using environment config)*' : ''}`,
                        inline: false
                    },
                    ...listFields
                ],
                footer: { text: 'Discord-Trello Bot' },
                timestamp: new Date().toISOString()
            };
            
            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.react('❌');
            console.error('❌ Error getting board status:', error);
            await message.reply('❌ Failed to get board status. Please check the bot configuration and board access.');
        }
    }

    async handleListCommand(message, args) {
        try {
            await message.react('⏳');
            
            const limit = Math.min(parseInt(args[0]) || 5, 20);
            const cardsData = await this.trelloService.getRecentCardsWithContext(
                message.guild.id, 
                message.channel.id, 
                limit
            );

            if (!cardsData) {
                await message.react('❌');
                await message.reply('❌ No board configuration found for this channel. Use `config board <board-id> <list-id>` to set one up.');
                return;
            }
            
            const { cards, config } = cardsData;
            
            if (cards.length === 0) {
                await message.reply('📝 No recent cards found.');
                return;
            }
            
            const cardFields = cards.slice(0, limit).map(card => ({
                name: `📝 ${card.name}`,
                value: `**ID**: ${card.id.substring(0, 8)}\n**Created**: ${this.formatDate(card.dateLastActivity)}${card.due ? `\n**Due**: ${this.formatDate(card.due)}` : ''}`,
                inline: true
            }));
            
            const embed = {
                color: 0x0079bf,
                title: `📋 Recent Cards (${cardFields.length})`,
                description: `Board: ${config.boardId}${config.isDefault ? ' *(default config)*' : ''}${config.isEnvironment ? ' *(environment config)*' : ''}`,
                fields: cardFields,
                footer: { text: 'Discord-Trello Bot' },
                timestamp: new Date().toISOString()
            };
            
            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.react('❌');
            console.error('❌ Error getting recent cards:', error);
            await message.reply('❌ Failed to get recent cards. Please check the bot configuration and board access.');
        }
    }

    async handleUpdateCommand(message, args) {
        try {
            if (args.length < 2) {
                await message.reply('❌ Usage: `update <card-id> <field>=<value>`\nExample: `update abc12345 name=New Task Name`');
                return;
            }
            
            await message.react('⏳');
            
            const cardId = args[0];
            const updateString = args.slice(1).join(' ');
            const [field, ...valueParts] = updateString.split('=');
            const value = valueParts.join('=');
            
            if (!field || !value) {
                await message.reply('❌ Invalid format. Use: `<field>=<value>`\nSupported fields: name, desc, due');
                return;
            }
            
            const updates = {};
            switch (field.toLowerCase()) {
                case 'name':
                    updates.name = value;
                    break;
                case 'desc':
                case 'description':
                    updates.desc = value;
                    break;
                case 'due':
                    updates.due = new Date(value).toISOString();
                    break;
                default:
                    await message.reply('❌ Unsupported field. Use: name, desc, or due');
                    return;
            }
            
            const updatedCard = await this.trelloService.updateCardWithContext(
                message.guild.id, 
                message.channel.id, 
                cardId, 
                updates, 
                true // Enable board validation
            );
            
            const embed = {
                color: 0xffa500,
                title: '✏️ Card Updated Successfully!',
                fields: [
                    { name: '📝 Card', value: updatedCard.name, inline: false },
                    { name: '🔗 Trello Card', value: updatedCard.shortUrl, inline: false },
                    { name: '👤 Updated by', value: message.author.tag, inline: true }
                ],
                footer: { text: 'Discord-Trello Bot' },
                timestamp: new Date().toISOString()
            };
            
            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.react('❌');
            console.error('❌ Error updating card:', error);
            await message.reply('❌ Failed to update card. Please check the card ID and try again.');
        }
    }

    async handleConfigCommand(message, args) {
        try {
            // Check permissions
            const canConfigure = await this.permissionManager.canConfigureChannel(message.author, message.channel);
            if (!canConfigure) {
                await message.reply('❌ You do not have permission to configure this channel. Required: Manage Channels permission or Moderator role.');
                return;
            }

            // Log configuration attempt
            if (this.auditLogger) {
                await this.auditLogger.logConfigurationChange(
                    message.guild.id,
                    message.author.id,
                    message.author.tag,
                    'config_command_attempt',
                    null,
                    args.join(' '),
                    message.channel.id,
                    true
                );
            }

            // This will be handled by ConfigCommands class
            const { ConfigCommands } = require('./ConfigCommands');
            const configCommands = new ConfigCommands(this.configManager, this.trelloService);
            await configCommands.handleConfigCommand(message, args);

        } catch (error) {
            console.error('❌ Error in config command:', error);
            await message.reply('❌ Failed to process configuration command.');
        }
    }

    async handleAdminCommand(message, args) {
        try {
            await this.adminCommands.handleAdminCommand(message, args);
        } catch (error) {
            console.error('❌ Error in admin command:', error);
            await message.reply('❌ Failed to process admin command.');
        }
    }

    async handleAnalyticsCommand(message, args) {
        try {
            // Check permissions
            const hasPermission = await this.permissionManager.hasModeratorPermissions(message.author, message.channel);
            if (!hasPermission) {
                await message.reply('❌ You need moderator or administrator permissions to view analytics.');
                return;
            }

            if (!this.analyticsManager) {
                await message.reply('⚠️ Analytics feature is not available.');
                return;
            }

            await message.react('⏳');

            const timeframe = args[0] || '7d';
            const analytics = await this.analyticsManager.getDashboardData(message.guild.id, timeframe);

            const embed = {
                color: 0x0079bf,
                title: `📊 Server Analytics Dashboard (${timeframe})`,
                fields: [
                    {
                        name: '📈 Overview',
                        value: `**Total Commands**: ${analytics.overview.totalCommands}\n**Unique Users**: ${analytics.overview.uniqueUsers}\n**Avg Response Time**: ${Math.round(analytics.overview.averageResponseTime)}ms\n**Success Rate**: ${Math.round(analytics.overview.overallSuccessRate)}%`,
                        inline: true
                    },
                    {
                        name: '⚡ Real-time Metrics',
                        value: `**Current Response**: ${analytics.realTime.averageResponseTime}ms\n**Success Rate**: ${analytics.realTime.successRate}%\n**Error Rate**: ${analytics.realTime.errorRate}%\n**Commands**: ${analytics.realTime.totalCommands}`,
                        inline: true
                    },
                    {
                        name: '🏥 System Health',
                        value: `**System**: ${analytics.health.systemHealth}\n**Response Time**: ${analytics.health.responseTime}\n**Error Rate**: ${analytics.health.errorRate}`,
                        inline: true
                    }
                ],
                footer: { text: 'Discord-Trello Bot • Analytics Dashboard' },
                timestamp: new Date().toISOString()
            };

            // Add top commands if available
            if (analytics.trends.topCommands.length > 0) {
                const topCommands = analytics.trends.topCommands.slice(0, 5).map((cmd, index) => 
                    `${index + 1}. ${cmd.command} (${cmd.count} uses)`
                ).join('\n');
                
                embed.fields.push({
                    name: '🏆 Top Commands',
                    value: topCommands,
                    inline: false
                });
            }

            // Add insights if available
            if (analytics.insights.length > 0) {
                const insights = analytics.insights.slice(0, 3).map(insight => 
                    `${this.getInsightEmoji(insight.type)} ${insight.message}`
                ).join('\n');
                
                embed.fields.push({
                    name: '💡 Insights',
                    value: insights,
                    inline: false
                });
            }

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in analytics command:', error);
            await message.reply('❌ Failed to retrieve analytics data.');
        }
    }

    async handleAuditCommand(message, args) {
        try {
            // Check permissions
            const hasPermission = await this.permissionManager.hasModeratorPermissions(message.author, message.channel);
            if (!hasPermission) {
                await message.reply('❌ You need moderator or administrator permissions to view audit logs.');
                return;
            }

            if (!this.auditLogger) {
                await message.reply('⚠️ Audit logging feature is not available.');
                return;
            }

            await message.react('⏳');

            const action = args[0] || 'recent';
            
            if (action === 'summary') {
                const summary = await this.auditLogger.getSecuritySummary(message.guild.id, '30d');
                
                const embed = {
                    color: this.getSecurityColor(summary.securityScore),
                    title: '🔒 Security Summary (30 days)',
                    fields: [
                        {
                            name: '🎯 Security Score',
                            value: `${summary.securityScore}/100 ${this.getSecurityEmoji(summary.securityScore)}`,
                            inline: true
                        },
                        {
                            name: '📊 Activity Summary',
                            value: `**Security Events**: ${summary.summary.totalSecurityEvents}\n**Permission Changes**: ${summary.summary.permissionChanges}\n**Admin Actions**: ${summary.summary.adminActions}\n**Failed Actions**: ${summary.summary.failedActions}`,
                            inline: true
                        }
                    ],
                    footer: { text: 'Discord-Trello Bot • Security Summary' },
                    timestamp: new Date().toISOString()
                };

                if (summary.recommendations.length > 0) {
                    const recommendations = summary.recommendations.slice(0, 3).map(rec => 
                        `${this.getRecommendationEmoji(rec.type)} ${rec.message}`
                    ).join('\n');
                    
                    embed.fields.push({
                        name: '💡 Recommendations',
                        value: recommendations,
                        inline: false
                    });
                }

                await message.reply({ embeds: [embed] });
            } else {
                const options = {
                    limit: 10,
                    action: args[0] || null,
                    timeframe: '7d'
                };

                const auditData = await this.auditLogger.getGuildAuditLogs(message.guild.id, options);
                const embed = this.auditLogger.createAuditLogEmbed(auditData.logs, 'Recent Audit Logs');
                
                await message.reply({ embeds: [embed] });
            }

            await message.reactions.removeAll();
            await message.react('✅');

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in audit command:', error);
            await message.reply('❌ Failed to retrieve audit logs.');
        }
    }

    async handleTemplatesCommand(message, args) {
        try {
            // Check permissions
            const hasPermission = await this.permissionManager.hasModeratorPermissions(message.author, message.channel);
            if (!hasPermission) {
                await message.reply('❌ You need moderator or administrator permissions to manage templates.');
                return;
            }

            if (!this.templateManager) {
                await message.reply('⚠️ Template management feature is not available.');
                return;
            }

            const action = args[0] || 'list';

            switch (action.toLowerCase()) {
                case 'list':
                    const templates = await this.templateManager.listTemplates(true, message.author.id);
                    const embed = this.templateManager.createTemplateListEmbed(templates.templates);
                    await message.reply({ embeds: [embed] });
                    break;

                case 'apply':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `templates apply <template-id-or-name>`');
                        return;
                    }
                    
                    await message.reply('🚧 Template application feature coming soon...');
                    break;

                case 'create':
                    if (args.length < 3) {
                        await message.reply('❌ Usage: `templates create <name> <description>`');
                        return;
                    }
                    
                    const name = args[1];
                    const description = args.slice(2).join(' ');
                    const result = await this.templateManager.createTemplate(
                        name,
                        description,
                        message.guild.id,
                        message.author.id,
                        false
                    );
                    
                    if (result.success) {
                        await message.reply(`✅ Template "${name}" created successfully!`);
                    } else {
                        await message.reply(`❌ Failed to create template: ${result.error}`);
                    }
                    break;

                default:
                    await message.reply('❌ Valid actions: `list`, `apply <id>`, `create <name> <description>`');
            }

        } catch (error) {
            console.error('❌ Error in templates command:', error);
            await message.reply('❌ Failed to process template command.');
        }
    }

    async handleSuggestCommand(message, args) {
        try {
            // Check permissions
            const hasPermission = await this.permissionManager.hasModeratorPermissions(message.author, message.channel);
            if (!hasPermission) {
                await message.reply('❌ You need moderator or administrator permissions to get AI suggestions.');
                return;
            }

            if (!this.aiEnhancedManager) {
                await message.reply('⚠️ AI enhancement features are not available.');
                return;
            }

            await message.react('⏳');

            const channels = Array.from(message.guild.channels.cache.values())
                .filter(channel => channel.type === 0); // Text channels only

            const suggestions = await this.aiEnhancedManager.generateConfigurationSuggestions(
                message.guild.id,
                channels
            );

            const embed = {
                color: 0x9370db,
                title: '🧠 AI Configuration Suggestions',
                description: suggestions.reasoning || 'Intelligent configuration recommendations for your server',
                fields: [],
                footer: { text: 'Discord-Trello Bot • AI Suggestions' },
                timestamp: new Date().toISOString()
            };

            if (suggestions.suggestions && suggestions.suggestions.length > 0) {
                suggestions.suggestions.slice(0, 5).forEach((suggestion, index) => {
                    embed.fields.push({
                        name: `${index + 1}. ${suggestion.channelPattern || 'Configuration'}`,
                        value: `**Board**: ${suggestion.suggestedBoard}\n**List**: ${suggestion.suggestedList}\n**Reason**: ${suggestion.reasoning}\n**Priority**: ${suggestion.priority}`,
                        inline: false
                    });
                });
            } else {
                embed.fields.push({
                    name: '💡 General Recommendations',
                    value: suggestions.fallback ? 
                        'AI analysis not available. Consider:\n• Setting up board configurations for active channels\n• Using consistent naming patterns\n• Implementing team-based board organization' :
                        'Your current configuration appears to be well-optimized!',
                    inline: false
                });
            }

            if (suggestions.implementation) {
                embed.fields.push({
                    name: '🛠️ Implementation Guide',
                    value: suggestions.implementation.order ? 
                        suggestions.implementation.order.slice(0, 3).map((step, i) => `${i + 1}. ${step}`).join('\n') :
                        'Follow the suggestions above in order of priority',
                    inline: false
                });
            }

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error in suggest command:', error);
            await message.reply('❌ Failed to generate AI suggestions.');
        }
    }

    async handlePermissionsCommand(message, args) {
        try {
            // Check admin permissions
            const hasPermission = await this.permissionManager.hasAdminPermissions(message.author, message.guild);
            if (!hasPermission) {
                await message.reply('❌ You need administrator permissions to manage role permissions.');
                return;
            }

            const action = args[0] || 'list';

            switch (action.toLowerCase()) {
                case 'list':
                    const permissions = await this.permissionManager.getGuildRolePermissions(message.guild.id);
                    
                    const embed = {
                        color: 0x0079bf,
                        title: '🔒 Role Permissions',
                        description: permissions.length > 0 ? 'Current role permission assignments' : 'No custom role permissions configured',
                        fields: [],
                        footer: { text: 'Discord-Trello Bot • Permission Management' },
                        timestamp: new Date().toISOString()
                    };

                    if (permissions.length > 0) {
                        permissions.forEach(perm => {
                            const role = message.guild.roles.cache.get(perm.role_id);
                            const roleName = role ? role.name : `Unknown Role (${perm.role_id})`;
                            
                            embed.fields.push({
                                name: `${this.getPermissionEmoji(perm.permission_level)} ${roleName}`,
                                value: `**Level**: ${perm.permission_level}\n**Set**: ${new Date(perm.created_at).toLocaleDateString()}`,
                                inline: true
                            });
                        });
                    }

                    await message.reply({ embeds: [embed] });
                    break;

                case 'set':
                    if (args.length < 3) {
                        await message.reply('❌ Usage: `permissions set <role-mention-or-id> <admin|moderator|user>`');
                        return;
                    }
                    
                    await message.reply('🚧 Permission setting feature coming soon...');
                    break;

                case 'remove':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `permissions remove <role-mention-or-id>`');
                        return;
                    }
                    
                    await message.reply('🚧 Permission removal feature coming soon...');
                    break;

                default:
                    await message.reply('❌ Valid actions: `list`, `set <role> <level>`, `remove <role>`');
            }

        } catch (error) {
            console.error('❌ Error in permissions command:', error);
            await message.reply('❌ Failed to process permissions command.');
        }
    }

    async handleCreateCommand(message, fullArgs) {
        try {
            await message.react('⏳');
            
            // Prepare Discord context for Gemini analysis
            const discordContext = {
                username: message.author.tag,
                channelName: message.channel.name,
                guildName: message.guild?.name || 'DM'
            };
            
            let card;
            let analysis = null;
            let config;
            
            // Try Gemini analysis first
            if (this.geminiService) {
                console.log('🤖 Analyzing task with Gemini...');
                analysis = await this.analyzeTaskWithGemini(fullArgs, discordContext);
            }
            
            if (analysis) {
                // Create rich card with Gemini analysis using context-aware methods
                console.log('✨ Creating rich card with analysis:', analysis);
                
                const labelIds = await this.trelloService.getOrCreateLabelsWithContext(
                    message.guild.id, 
                    message.channel.id, 
                    analysis.labels
                );
                
                const cardOptions = {
                    pos: analysis.priority === 'High' ? 'top' : 'bottom',
                    idLabels: labelIds
                };
                
                if (analysis.dueDate) {
                    cardOptions.due = analysis.dueDate;
                }
                
                const enrichedDescription = `${analysis.description}\n\n---\n**Created by:** ${message.author.tag}\n**Channel:** #${message.channel.name}\n**Priority:** ${analysis.priority}\n**Estimated Effort:** ${analysis.estimatedEffort}`;
                
                const cardResult = await this.trelloService.createCardWithContext(
                    message.guild.id, 
                    message.channel.id, 
                    analysis.title, 
                    enrichedDescription, 
                    cardOptions
                );
                card = cardResult;
                
                // Get config for embed display
                config = await this.trelloService.resolveConfiguration(message.guild.id, message.channel.id);
            } else {
                // Fallback to basic card creation
                console.log('📝 Creating basic card (Gemini unavailable)');
                const taskDescription = `Created by ${message.author.tag} in Discord channel: #${message.channel.name}`;
                
                card = await this.trelloService.createCardWithContext(
                    message.guild.id, 
                    message.channel.id, 
                    fullArgs, 
                    taskDescription
                );
                
                // Get config for embed display
                config = await this.trelloService.resolveConfiguration(message.guild.id, message.channel.id);
            }
            
            if (!config) {
                await message.react('❌');
                await message.reply('❌ No board configuration found for this channel. Use `config board <board-id> <list-id>` to set one up.');
                return;
            }
            
            await message.reactions.removeAll();
            await message.react('✅');
            
            // Create enhanced embed response
            const embed = this.createTaskEmbed(card, analysis, message.author.tag, config);
            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            try {
                await message.reactions.removeAll();
            } catch (reactionError) {
                if (reactionError.code === 50013) {
                    console.log('Missing permissions to manage reactions');
                } else {
                    console.error('❌ Error removing reactions:', reactionError);
                }
            }
            await message.react('❌');
            
            console.error('❌ Error creating card:', error);
            await message.reply('❌ Failed to create Trello card. Please check the bot configuration and try again.');
        }
    }

    async analyzeTaskWithGemini(taskInput, discordContext) {
        if (!this.geminiService) {
            console.log('Gemini API not configured, falling back to basic card creation');
            return null;
        }

        try {
            const systemPrompt = `You are a task analysis assistant that converts natural language task descriptions into structured data for project management. Analyze the following task and extract relevant information.

Return your response as a valid JSON object with this exact structure:
{
  "title": "A clear, concise task title (max 50 chars)",
  "description": "A detailed description expanding on the task context and requirements",
  "priority": "High" | "Medium" | "Low",
  "dueDate": "YYYY-MM-DDTHH:MM:SS.000Z" | null,
  "labels": ["array", "of", "label", "names"],
  "estimatedEffort": "Quick" | "Medium" | "Large",
  "category": "Development" | "Bug" | "Feature" | "Meeting" | "Research" | "Design" | "Admin"
}

Guidelines:
- Extract priority from urgency words (urgent, asap, critical = High; soon, important = Medium; later, whenever = Low)
- Parse natural language dates ("tomorrow", "next Friday", "in 2 weeks", "by end of month")
- Suggest relevant labels based on content (bug, feature, urgent, meeting, research, frontend, backend, etc.)
- Estimate effort based on complexity (Quick: <2h, Medium: 2h-1day, Large: >1day)
- If no due date mentioned, set to null
- Keep title concise and actionable

Task to analyze: "${taskInput}"
Discord context: User ${discordContext.username} in #${discordContext.channelName}`;

            const response = await this.geminiService.models.generateContent({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-001',
                contents: systemPrompt
            });
            const text = response.text;
            
            // Extract JSON from response (handle potential markdown formatting)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in Gemini response');
            }
            
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('❌ Error analyzing task with Gemini:', error);
            return null;
        }
    }

    createTaskEmbed(card, analysis, authorTag, config) {
        const embed = {
            color: analysis ? this.getPriorityColor(analysis.priority) : 0x0099ff,
            title: analysis ? '🧠 Smart Task Created!' : '📋 Task Created Successfully!',
            fields: [
                {
                    name: '📝 Task',
                    value: card.name,
                    inline: false
                },
                {
                    name: '🔗 Trello Card',
                    value: card.shortUrl || 'Created successfully',
                    inline: false
                },
                {
                    name: '👤 Created by',
                    value: authorTag,
                    inline: true
                },
                {
                    name: '📋 Board',
                    value: `\`${config.boardId}\`${config.isDefault ? ' *(default)*' : ''}${config.isEnvironment ? ' *(env)*' : ''}`,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: analysis ? 'Discord-Trello Bot • Powered by Gemini AI' : 'Discord-Trello Bot'
            }
        };

        if (analysis) {
            // Add analysis fields
            embed.fields.push(
                {
                    name: '🎯 Priority',
                    value: `${this.getPriorityEmoji(analysis.priority)} ${analysis.priority}`,
                    inline: true
                },
                {
                    name: '⏱️ Estimated Effort',
                    value: analysis.estimatedEffort,
                    inline: true
                }
            );
            
            if (analysis.dueDate) {
                embed.fields.push({
                    name: '📅 Due Date',
                    value: this.formatDate(analysis.dueDate),
                    inline: true
                });
            }
            
            if (analysis.labels && analysis.labels.length > 0) {
                embed.fields.push({
                    name: '🏷️ Labels',
                    value: analysis.labels.join(', '),
                    inline: false
                });
            }
            
            if (analysis.category) {
                embed.fields.push({
                    name: '📂 Category',
                    value: analysis.category,
                    inline: true
                });
            }
        }

        return embed;
    }

    getPriorityColor(priority) {
        switch (priority) {
            case 'High': return 0xff4444;
            case 'Medium': return 0xffaa00;
            case 'Low': return 0x44ff44;
            default: return 0x0099ff;
        }
    }

    getPriorityEmoji(priority) {
        switch (priority) {
            case 'High': return '🔴';
            case 'Medium': return '🟡';
            case 'Low': return '🟢';
            default: return '🔵';
        }
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    // Phase 3.3 Helper methods

    getFooterText() {
        const features = [];
        if (this.geminiService) features.push('AI');
        if (this.analyticsManager) features.push('Analytics');
        if (this.auditLogger) features.push('Audit');
        if (this.templateManager) features.push('Templates');
        if (this.aiEnhancedManager) features.push('Smart Suggestions');
        
        const baseText = 'Discord-Trello Bot';
        return features.length > 0 ? `${baseText} • ${features.join(', ')}` : baseText;
    }

    getInsightEmoji(type) {
        const emojiMap = {
            performance: '⚡',
            usage: '📈',
            reliability: '🔧',
            security: '🔒',
            optimization: '🎯',
            warning: '⚠️',
            info: 'ℹ️',
            success: '✅'
        };
        return emojiMap[type] || 'ℹ️';
    }

    getSecurityColor(score) {
        if (score >= 90) return 0x00ff00; // Green
        if (score >= 70) return 0xffaa00; // Orange
        if (score >= 50) return 0xff6600; // Dark orange
        return 0xff0000; // Red
    }

    getSecurityEmoji(score) {
        if (score >= 90) return '🟢';
        if (score >= 70) return '🟡';
        if (score >= 50) return '🟠';
        return '🔴';
    }

    getRecommendationEmoji(type) {
        const emojiMap = {
            urgent: '🚨',
            warning: '⚠️',
            info: 'ℹ️',
            success: '✅',
            security: '🔒',
            performance: '⚡',
            optimization: '🎯'
        };
        return emojiMap[type] || 'ℹ️';
    }

    getPermissionEmoji(level) {
        const emojiMap = {
            admin: '👑',
            moderator: '🛡️',
            user: '👤'
        };
        return emojiMap[level] || '👤';
    }

    /**
     * Enhanced error handling with analytics integration
     */
    async handleCommandError(error, message, command, args = []) {
        const startTime = Date.now();
        
        // Log error for analytics
        if (this.analyticsManager) {
            await this.analyticsManager.recordCommandExecution(
                message.guild.id,
                message.channel.id,
                message.author.id,
                command,
                args,
                Date.now() - startTime,
                false,
                error.message,
                null
            );
        }

        // Log security event if it's a permission error
        if (this.auditLogger && error.message.includes('permission')) {
            await this.auditLogger.logSecurityEvent(
                message.guild.id,
                message.author.id,
                message.author.tag,
                'permission_denied',
                {
                    command,
                    args: args.join(' '),
                    error: error.message
                },
                'MEDIUM'
            );
        }

        console.error(`❌ Command error [${command}]:`, error);
    }

    /**
     * Health check for command router and all integrated services
     */
    async healthCheck() {
        const health = {
            healthy: true,
            services: {
                configManager: !!this.configManager,
                trelloService: !!this.trelloService,
                permissionManager: !!this.permissionManager,
                analyticsManager: !!this.analyticsManager,
                auditLogger: !!this.auditLogger,
                templateManager: !!this.templateManager,
                aiEnhancedManager: !!this.aiEnhancedManager,
                geminiService: !!this.geminiService,
                webhookManager: !!this.webhookManager
            },
            commands: {
                registered: this.commands.size,
                available: Array.from(this.commands.keys())
            },
            features: {
                basicCommands: true,
                adminCommands: !!this.adminCommands,
                analytics: !!this.analyticsManager,
                auditLogging: !!this.auditLogger,
                templates: !!this.templateManager,
                aiSuggestions: !!this.aiEnhancedManager,
                permissionSystem: !!this.permissionManager
            }
        };

        // Test individual service health
        try {
            if (this.permissionManager) {
                const permHealth = await this.permissionManager.healthCheck();
                health.services.permissionManagerHealth = permHealth.healthy;
            }

            if (this.analyticsManager) {
                const analyticsHealth = await this.analyticsManager.getHealthMetrics();
                health.services.analyticsManagerHealth = analyticsHealth.healthy;
            }

            if (this.auditLogger) {
                const auditHealth = await this.auditLogger.healthCheck();
                health.services.auditLoggerHealth = auditHealth.healthy;
            }

            if (this.templateManager) {
                const templateHealth = await this.templateManager.healthCheck();
                health.services.templateManagerHealth = templateHealth.healthy;
            }

            if (this.aiEnhancedManager) {
                const aiHealth = await this.aiEnhancedManager.healthCheck();
                health.services.aiEnhancedManagerHealth = aiHealth.healthy;
            }

        } catch (error) {
            health.healthy = false;
            health.error = error.message;
        }

        return health;
    }

    /**
     * Get comprehensive statistics about command usage and system performance
     */
    async getSystemStatistics() {
        const stats = {
            commands: {
                total: this.commands.size,
                registered: Array.from(this.commands.keys())
            },
            features: {
                enabled: Object.values(this.getEnabledFeatures()).filter(Boolean).length,
                available: Object.keys(this.getEnabledFeatures()).length
            },
            timestamp: new Date().toISOString()
        };

        try {
            if (this.analyticsManager) {
                const realTimeMetrics = this.analyticsManager.getRealTimeMetrics();
                stats.performance = {
                    averageResponseTime: realTimeMetrics.averageResponseTime,
                    successRate: realTimeMetrics.successRate,
                    errorRate: realTimeMetrics.errorRate,
                    totalCommands: realTimeMetrics.totalCommands
                };
            }

            if (this.permissionManager) {
                const permStats = await this.permissionManager.getPermissionStats();
                stats.permissions = {
                    cacheSize: permStats.cacheSize,
                    cacheHitRate: permStats.cacheHitRate
                };
            }

        } catch (error) {
            stats.error = error.message;
        }

        return stats;
    }

    getEnabledFeatures() {
        return {
            basicCommands: true,
            configurationManagement: !!this.configManager,
            trelloIntegration: !!this.trelloService,
            permissionSystem: !!this.permissionManager,
            analytics: !!this.analyticsManager,
            auditLogging: !!this.auditLogger,
            templates: !!this.templateManager,
            aiEnhancements: !!this.aiEnhancedManager,
            adminCommands: !!this.adminCommands,
            geminiAI: !!this.geminiService,
            webhooks: !!this.webhookManager
        };
    }
}

module.exports = { CommandRouter };