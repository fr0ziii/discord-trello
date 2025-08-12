class ConfigCommands {
    constructor(configManager, trelloService) {
        this.configManager = configManager;
        this.trelloService = trelloService;
    }

    async handleConfigCommand(message, args) {
        if (args.length === 0) {
            await this.showConfigHelp(message);
            return;
        }

        const subcommand = args[0].toLowerCase();
        const subArgs = args.slice(1);

        try {
            switch (subcommand) {
                case 'board':
                    await this.handleConfigBoard(message, subArgs);
                    break;
                case 'show':
                    await this.handleConfigShow(message);
                    break;
                case 'list':
                    await this.handleConfigList(message);
                    break;
                case 'remove':
                    await this.handleConfigRemove(message);
                    break;
                case 'default':
                    await this.handleConfigDefault(message, subArgs);
                    break;
                case 'help':
                    await this.showConfigHelp(message);
                    break;
                default:
                    await message.reply(`❌ Unknown config command: \`${subcommand}\`. Use \`config help\` for available commands.`);
                    break;
            }
        } catch (error) {
            console.error('❌ Error in config command:', error);
            await message.reply('❌ An error occurred while processing the config command. Please try again.');
        }
    }

    async handleConfigBoard(message, args) {
        if (args.length < 1) {
            await message.reply('❌ Usage: `config board <board-id> [list-id]`\n\nIf no list-id is provided, the first list on the board will be used.');
            return;
        }

        await message.react('⏳');

        const boardId = args[0];
        let listId = args[1];

        try {
            // Validate board access
            const boardValidation = await this.trelloService.validateBoardAccess(boardId);
            if (!boardValidation.valid) {
                await message.react('❌');
                await message.reply(`❌ Cannot access board \`${boardId}\`: ${boardValidation.error}`);
                return;
            }

            // If no list ID provided, get the first list
            if (!listId) {
                const lists = await this.trelloService.getBoardLists(boardId);
                if (lists.length === 0) {
                    await message.react('❌');
                    await message.reply(`❌ Board \`${boardId}\` has no lists available.`);
                    return;
                }
                listId = lists[0].id;
                console.log(`📋 Using first list: ${lists[0].name} (${listId})`);
            } else {
                // Validate list access if provided
                const listValidation = await this.trelloService.validateListAccess(listId);
                if (!listValidation.valid) {
                    await message.react('❌');
                    await message.reply(`❌ Cannot access list \`${listId}\`: ${listValidation.error}`);
                    return;
                }
            }

            // Set the channel mapping
            const result = await this.configManager.setChannelMapping(
                message.guild.id,
                message.channel.id,
                boardId,
                listId
            );

            if (result.success) {
                const embed = {
                    color: 0x00ff00,
                    title: '✅ Channel Configuration Set!',
                    fields: [
                        {
                            name: '📍 Channel',
                            value: `<#${message.channel.id}>`,
                            inline: true
                        },
                        {
                            name: '📋 Board',
                            value: `\`${boardId}\`\n${boardValidation.board.name}`,
                            inline: true
                        },
                        {
                            name: '📝 List',
                            value: `\`${listId}\``,
                            inline: true
                        },
                        {
                            name: '👤 Configured by',
                            value: message.author.tag,
                            inline: true
                        }
                    ],
                    footer: { text: 'Discord-Trello Bot' },
                    timestamp: new Date().toISOString()
                };

                await message.reactions.removeAll();
                await message.react('✅');
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error setting board configuration:', error);
            await message.reply('❌ Failed to set board configuration. Please check the board and list IDs.');
        }
    }

    async handleConfigShow(message) {
        try {
            await message.react('⏳');

            const config = await this.configManager.getChannelMapping(
                message.guild.id,
                message.channel.id
            );

            if (!config) {
                await message.reply('❌ No configuration found for this channel. Use `config board <board-id> [list-id]` to set one up.');
                return;
            }

            // Get board info for display
            let boardInfo = 'Unknown Board';
            try {
                const boardValidation = await this.trelloService.validateBoardAccess(config.boardId);
                if (boardValidation.valid) {
                    boardInfo = boardValidation.board.name;
                }
            } catch (error) {
                console.error('⚠️ Could not fetch board info for display:', error.message);
            }

            const embed = {
                color: 0x0079bf,
                title: '⚙️ Current Channel Configuration',
                fields: [
                    {
                        name: '📍 Channel',
                        value: `<#${message.channel.id}>`,
                        inline: true
                    },
                    {
                        name: '📋 Board',
                        value: `\`${config.boardId}\`\n${boardInfo}`,
                        inline: true
                    },
                    {
                        name: '📝 List',
                        value: `\`${config.listId}\``,
                        inline: true
                    }
                ],
                footer: { text: 'Discord-Trello Bot' },
                timestamp: new Date().toISOString()
            };

            // Add configuration type info
            if (config.isDefault) {
                embed.fields.push({
                    name: '🔧 Configuration Type',
                    value: 'Using server default configuration',
                    inline: false
                });
            } else if (config.isEnvironment) {
                embed.fields.push({
                    name: '🔧 Configuration Type',
                    value: 'Using environment variable configuration',
                    inline: false
                });
            } else {
                embed.fields.push({
                    name: '🔧 Configuration Type',
                    value: 'Channel-specific configuration',
                    inline: false
                });
            }

            if (config.createdAt) {
                embed.fields.push({
                    name: '📅 Created',
                    value: this.formatDate(config.createdAt),
                    inline: true
                });
            }

            if (config.updatedAt) {
                embed.fields.push({
                    name: '📅 Last Updated',
                    value: this.formatDate(config.updatedAt),
                    inline: true
                });
            }

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error showing configuration:', error);
            await message.reply('❌ Failed to retrieve configuration information.');
        }
    }

    async handleConfigList(message) {
        try {
            await message.react('⏳');

            const allMappings = await this.configManager.getAllMappings(message.guild.id);
            
            const embed = {
                color: 0x0079bf,
                title: `⚙️ Server Configurations`,
                description: `Server: **${message.guild.name}**`,
                fields: [],
                footer: { text: 'Discord-Trello Bot' },
                timestamp: new Date().toISOString()
            };

            // Add default configuration if exists
            if (allMappings.defaultConfig) {
                embed.fields.push({
                    name: '🏠 Default Configuration',
                    value: `**Board**: \`${allMappings.defaultConfig.boardId}\`\n**List**: \`${allMappings.defaultConfig.listId}\``,
                    inline: false
                });
            }

            // Add channel-specific mappings
            if (allMappings.channelMappings.length > 0) {
                const channelFields = allMappings.channelMappings.slice(0, 10).map(mapping => {
                    const channel = message.guild.channels.cache.get(mapping.channelId);
                    const channelName = channel ? channel.name : 'Unknown Channel';
                    
                    return {
                        name: `📍 #${channelName}`,
                        value: `**Board**: \`${mapping.boardId}\`\n**List**: \`${mapping.listId}\`\n**Updated**: ${this.formatDate(mapping.updatedAt)}`,
                        inline: true
                    };
                });

                embed.fields.push(...channelFields);

                if (allMappings.channelMappings.length > 10) {
                    embed.fields.push({
                        name: '📊 Summary',
                        value: `Showing 10 of ${allMappings.channelMappings.length} channel configurations`,
                        inline: false
                    });
                }
            } else {
                embed.fields.push({
                    name: '📝 Channel Configurations',
                    value: 'No channel-specific configurations found',
                    inline: false
                });
            }

            // Add summary
            embed.fields.push({
                name: '📈 Total',
                value: `**Default Config**: ${allMappings.defaultConfig ? 'Yes' : 'No'}\n**Channel Configs**: ${allMappings.channelMappings.length}`,
                inline: false
            });

            await message.reactions.removeAll();
            await message.react('✅');
            await message.reply({ embeds: [embed] });

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error listing configurations:', error);
            await message.reply('❌ Failed to retrieve configuration list.');
        }
    }

    async handleConfigRemove(message) {
        try {
            await message.react('⏳');

            const result = await this.configManager.removeChannelMapping(
                message.guild.id,
                message.channel.id
            );

            if (result.removed) {
                const embed = {
                    color: 0xff6347,
                    title: '🗑️ Channel Configuration Removed',
                    fields: [
                        {
                            name: '📍 Channel',
                            value: `<#${message.channel.id}>`,
                            inline: true
                        },
                        {
                            name: '👤 Removed by',
                            value: message.author.tag,
                            inline: true
                        }
                    ],
                    description: 'This channel will now use the server default configuration or environment settings.',
                    footer: { text: 'Discord-Trello Bot' },
                    timestamp: new Date().toISOString()
                };

                await message.reactions.removeAll();
                await message.react('✅');
                await message.reply({ embeds: [embed] });
            } else {
                await message.reply('ℹ️ No channel-specific configuration found to remove. This channel is already using default settings.');
            }

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error removing configuration:', error);
            await message.reply('❌ Failed to remove channel configuration.');
        }
    }

    async handleConfigDefault(message, args) {
        if (args.length < 2) {
            await message.reply('❌ Usage: `config default <board-id> <list-id>`\n\nThis sets the default board and list for the entire server.');
            return;
        }

        // Check permissions - only administrators can set server defaults
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            await message.reply('❌ You need Administrator permissions to set server default configurations.');
            return;
        }

        await message.react('⏳');

        const boardId = args[0];
        const listId = args[1];

        try {
            // Validate board access
            const boardValidation = await this.trelloService.validateBoardAccess(boardId);
            if (!boardValidation.valid) {
                await message.react('❌');
                await message.reply(`❌ Cannot access board \`${boardId}\`: ${boardValidation.error}`);
                return;
            }

            // Validate list access
            const listValidation = await this.trelloService.validateListAccess(listId);
            if (!listValidation.valid) {
                await message.react('❌');
                await message.reply(`❌ Cannot access list \`${listId}\`: ${listValidation.error}`);
                return;
            }

            // Set the default configuration
            const result = await this.configManager.setDefaultConfig(
                message.guild.id,
                boardId,
                listId
            );

            if (result.success) {
                const embed = {
                    color: 0x00ff00,
                    title: '✅ Server Default Configuration Set!',
                    fields: [
                        {
                            name: '🏠 Server',
                            value: message.guild.name,
                            inline: true
                        },
                        {
                            name: '📋 Default Board',
                            value: `\`${boardId}\`\n${boardValidation.board.name}`,
                            inline: true
                        },
                        {
                            name: '📝 Default List',
                            value: `\`${listId}\``,
                            inline: true
                        },
                        {
                            name: '👤 Set by',
                            value: message.author.tag,
                            inline: true
                        }
                    ],
                    description: 'All channels without specific configurations will now use these settings.',
                    footer: { text: 'Discord-Trello Bot' },
                    timestamp: new Date().toISOString()
                };

                await message.reactions.removeAll();
                await message.react('✅');
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            await message.react('❌');
            console.error('❌ Error setting default configuration:', error);
            await message.reply('❌ Failed to set default configuration. Please check the board and list IDs.');
        }
    }

    async showConfigHelp(message) {
        const commandPrefix = process.env.COMMAND_PREFIX || '!t';
        
        const embed = {
            color: 0x0079bf,
            title: '⚙️ Configuration Commands Help',
            fields: [
                {
                    name: `${commandPrefix} config board <board-id> [list-id]`,
                    value: 'Configure Trello board and list for this channel\nIf no list-id provided, uses the first list on the board',
                    inline: false
                },
                {
                    name: `${commandPrefix} config show`,
                    value: 'Show current configuration for this channel',
                    inline: false
                },
                {
                    name: `${commandPrefix} config list`,
                    value: 'List all configurations for this server',
                    inline: false
                },
                {
                    name: `${commandPrefix} config remove`,
                    value: 'Remove channel-specific configuration (falls back to default)',
                    inline: false
                },
                {
                    name: `${commandPrefix} config default <board-id> <list-id>`,
                    value: 'Set default board/list for the entire server (Admin only)',
                    inline: false
                }
            ],
            footer: { text: 'Discord-Trello Bot • Configuration Help' },
            timestamp: new Date().toISOString()
        };

        // Add additional help information
        embed.fields.push({
            name: '📝 How to find Board and List IDs',
            value: '1. Open your Trello board in a web browser\n2. Board ID: Last part of the URL after `/b/`\n3. List ID: Click on a list, check the URL or use Trello\'s API',
            inline: false
        });

        embed.fields.push({
            name: '⚡ Quick Setup',
            value: `1. \`${commandPrefix} config board <your-board-id>\` - Quick setup with first list\n2. \`${commandPrefix} config show\` - Verify your configuration\n3. Start creating tasks with \`${commandPrefix} <task description>\``,
            inline: false
        });

        await message.reply({ embeds: [embed] });
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }
}

module.exports = { ConfigCommands };