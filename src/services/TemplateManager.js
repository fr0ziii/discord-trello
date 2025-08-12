const { getDatabase } = require('../database/connection');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

class TemplateManager {
    constructor(configManager, trelloService) {
        this.db = getDatabase();
        this.configManager = configManager;
        this.trelloService = trelloService;
        this.supportedFormats = ['json', 'csv', 'yaml'];
        this.maxTemplateSize = 1024 * 1024; // 1MB
    }

    /**
     * Export server configuration to various formats
     */
    async exportConfiguration(guildId, format = 'json', options = {}) {
        try {
            const {
                includeChannelMappings = true,
                includeDefaultConfig = true,
                includeWebhooks = true,
                includePermissions = true,
                includeAnalytics = false
            } = options;

            // Gather configuration data
            const configData = await this.gatherConfigurationData(guildId, {
                includeChannelMappings,
                includeDefaultConfig,
                includeWebhooks,
                includePermissions,
                includeAnalytics
            });

            // Add metadata
            const exportData = {
                metadata: {
                    exportedAt: new Date().toISOString(),
                    guildId: guildId,
                    version: '1.2.0',
                    exportFormat: format,
                    discordTrelloBotVersion: 'Phase 3.3'
                },
                configuration: configData
            };

            // Format the data based on requested format
            let formattedData;
            let filename;
            let mimeType;

            switch (format.toLowerCase()) {
                case 'json':
                    formattedData = JSON.stringify(exportData, null, 2);
                    filename = `discord-trello-config-${guildId}-${Date.now()}.json`;
                    mimeType = 'application/json';
                    break;

                case 'csv':
                    formattedData = this.convertToCSV(configData);
                    filename = `discord-trello-config-${guildId}-${Date.now()}.csv`;
                    mimeType = 'text/csv';
                    break;

                case 'yaml':
                    formattedData = this.convertToYAML(exportData);
                    filename = `discord-trello-config-${guildId}-${Date.now()}.yaml`;
                    mimeType = 'application/x-yaml';
                    break;

                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            return {
                success: true,
                data: formattedData,
                filename,
                mimeType,
                size: Buffer.byteLength(formattedData, 'utf8'),
                itemCount: this.countConfigurationItems(configData)
            };

        } catch (error) {
            console.error('❌ Error exporting configuration:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Import configuration from file
     */
    async importConfiguration(guildId, fileContent, filename, options = {}) {
        try {
            const {
                overwriteExisting = false,
                validateOnly = false,
                backupBeforeImport = true
            } = options;

            // Detect format from filename or content
            const format = this.detectFormat(filename, fileContent);
            
            // Parse the configuration data
            const importData = await this.parseConfigurationData(fileContent, format);
            
            // Validate the configuration
            const validation = await this.validateImportData(importData, guildId);
            if (!validation.valid) {
                return {
                    success: false,
                    error: 'Configuration validation failed',
                    validationErrors: validation.errors
                };
            }

            if (validateOnly) {
                return {
                    success: true,
                    validation,
                    preview: this.generateImportPreview(importData)
                };
            }

            // Create backup if requested
            let backupId = null;
            if (backupBeforeImport) {
                const backup = await this.createConfigurationBackup(guildId, 'pre_import');
                backupId = backup.success ? backup.backupId : null;
            }

            // Apply the configuration
            const result = await this.applyConfiguration(guildId, importData.configuration, overwriteExisting);

            return {
                success: result.success,
                backupId,
                applied: result.applied,
                skipped: result.skipped,
                errors: result.errors,
                summary: result.summary
            };

        } catch (error) {
            console.error('❌ Error importing configuration:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create configuration template
     */
    async createTemplate(name, description, guildId, createdBy, isPublic = false) {
        try {
            // Export current configuration
            const configExport = await this.exportConfiguration(guildId, 'json', {
                includeChannelMappings: true,
                includeDefaultConfig: true,
                includeWebhooks: false, // Don't include specific webhook IDs
                includePermissions: true,
                includeAnalytics: false
            });

            if (!configExport.success) {
                throw new Error('Failed to export configuration for template creation');
            }

            // Create template data with patterns instead of specific IDs
            const templateData = this.createTemplateFromConfig(configExport.data);

            // Save template to database
            await this.db.runQuery(`
                INSERT INTO configuration_templates 
                (name, description, template_data, created_by, is_public, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [name, description, JSON.stringify(templateData), createdBy, isPublic ? 1 : 0]);

            return {
                success: true,
                templateName: name,
                message: 'Template created successfully'
            };

        } catch (error) {
            console.error('❌ Error creating template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * List available templates
     */
    async listTemplates(includePrivate = false, createdBy = null) {
        try {
            let query = `
                SELECT id, name, description, created_by, is_public, use_count, 
                       created_at, updated_at 
                FROM configuration_templates 
                WHERE 1=1
            `;
            const params = [];

            if (!includePrivate) {
                query += ` AND is_public = 1`;
            }

            if (createdBy) {
                query += ` AND (created_by = ? OR is_public = 1)`;
                params.push(createdBy);
            }

            query += ` ORDER BY use_count DESC, created_at DESC`;

            const templates = await this.db.allQuery(query, params);

            return {
                success: true,
                templates: templates || []
            };

        } catch (error) {
            console.error('❌ Error listing templates:', error);
            return {
                success: false,
                error: error.message,
                templates: []
            };
        }
    }

    /**
     * Apply template to server
     */
    async applyTemplate(templateId, guildId, userId, options = {}) {
        try {
            const { 
                overwriteExisting = false,
                channelMapping = {},
                boardMapping = {}
            } = options;

            // Get template data
            const template = await this.db.getQuery(`
                SELECT * FROM configuration_templates WHERE id = ?
            `, [templateId]);

            if (!template) {
                throw new Error('Template not found');
            }

            // Parse template data
            const templateData = JSON.parse(template.template_data);

            // Create backup
            const backup = await this.createConfigurationBackup(guildId, 'pre_template_apply');

            // Apply template with channel and board mapping
            const result = await this.applyTemplateWithMapping(
                guildId, 
                templateData, 
                channelMapping, 
                boardMapping, 
                overwriteExisting
            );

            // Update template usage count
            await this.db.runQuery(`
                UPDATE configuration_templates 
                SET use_count = use_count + 1, updated_at = datetime('now')
                WHERE id = ?
            `, [templateId]);

            return {
                success: result.success,
                templateName: template.name,
                backupId: backup.backupId,
                applied: result.applied,
                skipped: result.skipped,
                errors: result.errors
            };

        } catch (error) {
            console.error('❌ Error applying template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create configuration backup
     */
    async createConfigurationBackup(guildId, reason = 'manual') {
        try {
            const timestamp = new Date().toISOString();
            const backupId = `backup_${guildId}_${Date.now()}`;

            // Export current configuration
            const configExport = await this.exportConfiguration(guildId, 'json', {
                includeChannelMappings: true,
                includeDefaultConfig: true,
                includeWebhooks: true,
                includePermissions: true,
                includeAnalytics: false
            });

            if (!configExport.success) {
                throw new Error('Failed to export configuration for backup');
            }

            // Store backup (in a production environment, this might go to a separate backup table or file system)
            const backupData = {
                backupId,
                guildId,
                reason,
                timestamp,
                configuration: configExport.data,
                version: '1.2.0'
            };

            // For now, we'll store it as a special template
            await this.db.runQuery(`
                INSERT INTO configuration_templates 
                (name, description, template_data, created_by, is_public, created_at)
                VALUES (?, ?, ?, ?, 0, datetime('now'))
            `, [
                `BACKUP_${backupId}`,
                `Automatic backup - ${reason} - ${timestamp}`,
                JSON.stringify(backupData),
                'system'
            ]);

            return {
                success: true,
                backupId,
                timestamp,
                reason
            };

        } catch (error) {
            console.error('❌ Error creating configuration backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Restore configuration from backup
     */
    async restoreFromBackup(backupId, guildId, userId) {
        try {
            // Find backup
            const backup = await this.db.getQuery(`
                SELECT * FROM configuration_templates 
                WHERE name = ? AND created_by = 'system'
            `, [`BACKUP_${backupId}`]);

            if (!backup) {
                throw new Error('Backup not found');
            }

            const backupData = JSON.parse(backup.template_data);

            // Validate backup is for the correct guild
            if (backupData.guildId !== guildId) {
                throw new Error('Backup is not for this server');
            }

            // Create a backup of current state before restore
            const preRestoreBackup = await this.createConfigurationBackup(guildId, 'pre_restore');

            // Parse and apply the backup configuration
            const configData = JSON.parse(backupData.configuration);
            const result = await this.applyConfiguration(guildId, configData.configuration, true);

            return {
                success: result.success,
                backupId,
                preRestoreBackupId: preRestoreBackup.backupId,
                restored: result.applied,
                errors: result.errors
            };

        } catch (error) {
            console.error('❌ Error restoring from backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper methods

    async gatherConfigurationData(guildId, options) {
        const configData = {};

        if (options.includeChannelMappings) {
            configData.channelMappings = await this.configManager.getServerConfigurations(guildId);
        }

        if (options.includeDefaultConfig) {
            configData.defaultConfig = await this.configManager.getDefaultConfig(guildId);
        }

        if (options.includeWebhooks) {
            configData.webhooks = await this.gatherWebhookData(guildId);
        }

        if (options.includePermissions) {
            configData.permissions = await this.gatherPermissionData(guildId);
        }

        if (options.includeAnalytics) {
            configData.analytics = await this.gatherAnalyticsData(guildId);
        }

        return configData;
    }

    async gatherWebhookData(guildId) {
        try {
            // Get webhook registrations for boards used by this guild
            const channelMappings = await this.configManager.getServerConfigurations(guildId);
            const boardIds = [...new Set(channelMappings.map(mapping => mapping.board_id))];

            const webhooks = [];
            for (const boardId of boardIds) {
                const webhook = await this.db.getQuery(`
                    SELECT * FROM webhook_registrations WHERE board_id = ?
                `, [boardId]);
                
                if (webhook) {
                    webhooks.push({
                        boardId,
                        webhookId: webhook.webhook_id,
                        callbackUrl: webhook.callback_url,
                        description: webhook.description
                    });
                }
            }

            return webhooks;
        } catch (error) {
            console.error('Error gathering webhook data:', error);
            return [];
        }
    }

    async gatherPermissionData(guildId) {
        try {
            const permissions = await this.db.allQuery(`
                SELECT role_id, permission_level FROM role_permissions WHERE guild_id = ?
            `, [guildId]);

            const adminSettings = await this.db.getQuery(`
                SELECT * FROM admin_settings WHERE guild_id = ?
            `, [guildId]);

            return {
                rolePermissions: permissions || [],
                adminSettings: adminSettings || null
            };
        } catch (error) {
            console.error('Error gathering permission data:', error);
            return { rolePermissions: [], adminSettings: null };
        }
    }

    async gatherAnalyticsData(guildId) {
        try {
            // Get recent analytics summary (last 30 days)
            const analytics = await this.db.allQuery(`
                SELECT command, COUNT(*) as usage_count 
                FROM usage_analytics 
                WHERE guild_id = ? AND timestamp > datetime('now', '-30 days')
                GROUP BY command
                ORDER BY usage_count DESC
            `, [guildId]);

            return {
                commandUsage: analytics || [],
                exportedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error gathering analytics data:', error);
            return { commandUsage: [] };
        }
    }

    convertToCSV(configData) {
        const csvRows = [];
        
        // CSV Header
        csvRows.push('Type,Channel ID,Board ID,List ID,Role ID,Permission Level,Additional Data');

        // Channel mappings
        if (configData.channelMappings) {
            configData.channelMappings.forEach(mapping => {
                csvRows.push(`channel_mapping,${mapping.channel_id},${mapping.board_id},${mapping.list_id},,,`);
            });
        }

        // Default config
        if (configData.defaultConfig) {
            csvRows.push(`default_config,,${configData.defaultConfig.default_board_id},${configData.defaultConfig.default_list_id},,,`);
        }

        // Role permissions
        if (configData.permissions && configData.permissions.rolePermissions) {
            configData.permissions.rolePermissions.forEach(perm => {
                csvRows.push(`role_permission,,,,${perm.role_id},${perm.permission_level},`);
            });
        }

        return csvRows.join('\n');
    }

    convertToYAML(exportData) {
        // Simple YAML conversion - in production, use a proper YAML library
        const yamlLines = [];
        
        yamlLines.push('# Discord-Trello Bot Configuration Export');
        yamlLines.push(`# Exported: ${exportData.metadata.exportedAt}`);
        yamlLines.push('');
        yamlLines.push('metadata:');
        yamlLines.push(`  exportedAt: "${exportData.metadata.exportedAt}"`);
        yamlLines.push(`  guildId: "${exportData.metadata.guildId}"`);
        yamlLines.push(`  version: "${exportData.metadata.version}"`);
        yamlLines.push('');
        yamlLines.push('configuration:');

        // Add configuration sections
        if (exportData.configuration.channelMappings) {
            yamlLines.push('  channelMappings:');
            exportData.configuration.channelMappings.forEach(mapping => {
                yamlLines.push(`    - channelId: "${mapping.channel_id}"`);
                yamlLines.push(`      boardId: "${mapping.board_id}"`);
                yamlLines.push(`      listId: "${mapping.list_id}"`);
            });
        }

        return yamlLines.join('\n');
    }

    detectFormat(filename, content) {
        const extension = filename.split('.').pop().toLowerCase();
        
        if (['json'].includes(extension)) return 'json';
        if (['csv'].includes(extension)) return 'csv';
        if (['yaml', 'yml'].includes(extension)) return 'yaml';

        // Try to detect from content
        try {
            JSON.parse(content);
            return 'json';
        } catch {
            if (content.includes(',') && content.includes('\n')) {
                return 'csv';
            }
            return 'yaml';
        }
    }

    async parseConfigurationData(content, format) {
        switch (format) {
            case 'json':
                return JSON.parse(content);
            
            case 'csv':
                return this.parseCSV(content);
            
            case 'yaml':
                return this.parseYAML(content);
            
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    parseCSV(content) {
        // Simple CSV parser - in production, use a proper CSV library
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        const data = { configuration: { channelMappings: [], permissions: { rolePermissions: [] } } };

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length >= headers.length) {
                const type = values[0];
                
                if (type === 'channel_mapping') {
                    data.configuration.channelMappings.push({
                        channel_id: values[1],
                        board_id: values[2],
                        list_id: values[3]
                    });
                } else if (type === 'role_permission') {
                    data.configuration.permissions.rolePermissions.push({
                        role_id: values[4],
                        permission_level: values[5]
                    });
                }
            }
        }

        return data;
    }

    parseYAML(content) {
        // Simple YAML parser - in production, use a proper YAML library
        throw new Error('YAML parsing not implemented in this demo');
    }

    async validateImportData(importData, guildId) {
        const errors = [];
        const warnings = [];

        try {
            // Validate structure
            if (!importData.configuration) {
                errors.push('Missing configuration section');
                return { valid: false, errors, warnings };
            }

            const config = importData.configuration;

            // Validate channel mappings
            if (config.channelMappings) {
                for (const mapping of config.channelMappings) {
                    if (!mapping.channel_id || !mapping.board_id || !mapping.list_id) {
                        errors.push(`Invalid channel mapping: missing required fields`);
                    }

                    // Validate board access
                    try {
                        const boardAccess = await this.trelloService.validateBoardAccess(mapping.board_id);
                        if (!boardAccess) {
                            warnings.push(`Board ${mapping.board_id} may not be accessible`);
                        }
                    } catch (error) {
                        warnings.push(`Could not validate access to board ${mapping.board_id}`);
                    }
                }
            }

            // Validate permissions
            if (config.permissions && config.permissions.rolePermissions) {
                for (const perm of config.permissions.rolePermissions) {
                    if (!perm.role_id || !perm.permission_level) {
                        errors.push('Invalid permission: missing role_id or permission_level');
                    }

                    if (!['admin', 'moderator', 'user'].includes(perm.permission_level)) {
                        errors.push(`Invalid permission level: ${perm.permission_level}`);
                    }
                }
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            return {
                valid: false,
                errors: ['Validation failed: ' + error.message],
                warnings
            };
        }
    }

    generateImportPreview(importData) {
        const preview = {
            channelMappings: 0,
            defaultConfig: false,
            rolePermissions: 0,
            webhooks: 0
        };

        const config = importData.configuration;

        if (config.channelMappings) {
            preview.channelMappings = config.channelMappings.length;
        }

        if (config.defaultConfig) {
            preview.defaultConfig = true;
        }

        if (config.permissions && config.permissions.rolePermissions) {
            preview.rolePermissions = config.permissions.rolePermissions.length;
        }

        if (config.webhooks) {
            preview.webhooks = config.webhooks.length;
        }

        return preview;
    }

    async applyConfiguration(guildId, configData, overwriteExisting) {
        const result = {
            success: true,
            applied: 0,
            skipped: 0,
            errors: [],
            summary: {}
        };

        try {
            // Apply channel mappings
            if (configData.channelMappings) {
                for (const mapping of configData.channelMappings) {
                    try {
                        const existing = await this.configManager.getChannelMapping(guildId, mapping.channel_id);
                        
                        if (existing && !overwriteExisting) {
                            result.skipped++;
                            continue;
                        }

                        await this.configManager.setChannelMapping(
                            guildId, 
                            mapping.channel_id, 
                            mapping.board_id, 
                            mapping.list_id
                        );
                        
                        result.applied++;
                    } catch (error) {
                        result.errors.push(`Failed to apply channel mapping: ${error.message}`);
                    }
                }
                result.summary.channelMappings = result.applied;
            }

            // Apply default config
            if (configData.defaultConfig) {
                try {
                    await this.configManager.setDefaultConfig(
                        guildId,
                        configData.defaultConfig.default_board_id,
                        configData.defaultConfig.default_list_id
                    );
                    result.summary.defaultConfig = true;
                } catch (error) {
                    result.errors.push(`Failed to apply default config: ${error.message}`);
                }
            }

            // Apply role permissions
            if (configData.permissions && configData.permissions.rolePermissions) {
                let permissionsApplied = 0;
                for (const perm of configData.permissions.rolePermissions) {
                    try {
                        await this.db.runQuery(`
                            INSERT OR REPLACE INTO role_permissions (guild_id, role_id, permission_level, updated_at)
                            VALUES (?, ?, ?, datetime('now'))
                        `, [guildId, perm.role_id, perm.permission_level]);
                        
                        permissionsApplied++;
                    } catch (error) {
                        result.errors.push(`Failed to apply permission: ${error.message}`);
                    }
                }
                result.summary.rolePermissions = permissionsApplied;
            }

            result.success = result.errors.length === 0;
            return result;

        } catch (error) {
            console.error('❌ Error applying configuration:', error);
            return {
                success: false,
                applied: 0,
                skipped: 0,
                errors: [error.message],
                summary: {}
            };
        }
    }

    createTemplateFromConfig(configData) {
        // Convert specific configuration to template patterns
        const template = JSON.parse(configData);

        // Replace specific channel IDs with patterns
        if (template.configuration.channelMappings) {
            template.configuration.channelMappings = template.configuration.channelMappings.map(mapping => ({
                channelPattern: '*', // Could be enhanced with actual pattern detection
                boardType: 'project', // Categorize board types
                listType: 'todo',     // Categorize list types
                originalBoardId: mapping.board_id,
                originalListId: mapping.list_id
            }));
        }

        return template;
    }

    async applyTemplateWithMapping(guildId, templateData, channelMapping, boardMapping, overwriteExisting) {
        // Apply template while mapping template patterns to actual channels/boards
        const configData = this.resolveTemplatePatterns(templateData, channelMapping, boardMapping);
        return await this.applyConfiguration(guildId, configData, overwriteExisting);
    }

    resolveTemplatePatterns(templateData, channelMapping, boardMapping) {
        // Convert template patterns back to specific configuration
        // This is a simplified implementation
        return templateData.configuration || templateData;
    }

    countConfigurationItems(configData) {
        let count = 0;
        
        if (configData.channelMappings) count += configData.channelMappings.length;
        if (configData.defaultConfig) count += 1;
        if (configData.permissions && configData.permissions.rolePermissions) {
            count += configData.permissions.rolePermissions.length;
        }
        if (configData.webhooks) count += configData.webhooks.length;
        
        return count;
    }

    /**
     * Create export attachment for Discord
     */
    createExportAttachment(exportResult) {
        if (!exportResult.success) {
            return null;
        }

        const buffer = Buffer.from(exportResult.data, 'utf8');
        return new AttachmentBuilder(buffer, { name: exportResult.filename });
    }

    /**
     * Create template usage embed
     */
    createTemplateListEmbed(templates) {
        const embed = new EmbedBuilder()
            .setColor(0x0079bf)
            .setTitle('📝 Available Configuration Templates')
            .setTimestamp()
            .setFooter({ text: 'Discord-Trello Bot • Template Manager' });

        if (templates.length === 0) {
            embed.setDescription('No templates available. Create your first template with `admin templates create`.');
            return embed;
        }

        templates.slice(0, 10).forEach(template => {
            const visibility = template.is_public ? '🌐 Public' : '🔒 Private';
            const usage = template.use_count || 0;
            
            embed.addFields({
                name: `${template.name} (ID: ${template.id})`,
                value: `${template.description}\n**Creator**: ${template.created_by} • **Visibility**: ${visibility} • **Used**: ${usage} times`,
                inline: false
            });
        });

        if (templates.length > 10) {
            embed.setDescription(`Showing 10 of ${templates.length} templates. Use pagination to view more.`);
        }

        return embed;
    }

    /**
     * Health check for template manager
     */
    async healthCheck() {
        try {
            const templateCount = await this.db.getQuery('SELECT COUNT(*) as count FROM configuration_templates');
            
            return {
                healthy: true,
                templateCount: templateCount ? templateCount.count : 0,
                supportedFormats: this.supportedFormats,
                features: {
                    export: true,
                    import: true,
                    templates: true,
                    backup: true
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

module.exports = { TemplateManager };