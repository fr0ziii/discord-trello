class ValidationUtils {
    static validateTrelloId(id, type = 'ID') {
        if (!id || typeof id !== 'string') {
            return {
                valid: false,
                error: `${type} is required and must be a string`
            };
        }

        // Trello IDs are typically 24 character hexadecimal strings
        const trelloIdRegex = /^[a-f\d]{24}$/i;
        
        if (!trelloIdRegex.test(id)) {
            return {
                valid: false,
                error: `Invalid ${type} format. Trello IDs should be 24 character hexadecimal strings.`
            };
        }

        return { valid: true };
    }

    static validateBoardId(boardId) {
        return this.validateTrelloId(boardId, 'Board ID');
    }

    static validateListId(listId) {
        return this.validateTrelloId(listId, 'List ID');
    }

    static validateCardId(cardId) {
        return this.validateTrelloId(cardId, 'Card ID');
    }

    static validateDiscordId(id, type = 'Discord ID') {
        if (!id || typeof id !== 'string') {
            return {
                valid: false,
                error: `${type} is required and must be a string`
            };
        }

        // Discord snowflake IDs are 17-19 digit numbers
        const discordIdRegex = /^\d{17,19}$/;
        
        if (!discordIdRegex.test(id)) {
            return {
                valid: false,
                error: `Invalid ${type} format. Discord IDs should be 17-19 digit numbers.`
            };
        }

        return { valid: true };
    }

    static validateGuildId(guildId) {
        return this.validateDiscordId(guildId, 'Guild ID');
    }

    static validateChannelId(channelId) {
        return this.validateDiscordId(channelId, 'Channel ID');
    }

    static validateEnvironmentVariables() {
        const requiredVars = [
            'DISCORD_BOT_TOKEN',
            'TRELLO_API_KEY',
            'TRELLO_API_TOKEN'
        ];

        const optionalVars = [
            'TRELLO_BOARD_ID',
            'TRELLO_LIST_ID',
            'COMMAND_PREFIX',
            'GEMINI_API_KEY',
            'GEMINI_MODEL',
            'WEBHOOK_PORT',
            'WEBHOOK_SECRET',
            'WEBHOOK_URL',
            'DATABASE_PATH',
            'CONFIG_CACHE_TTL'
        ];

        const missingRequired = requiredVars.filter(varName => !process.env[varName]);
        const presentOptional = optionalVars.filter(varName => process.env[varName]);

        const result = {
            valid: missingRequired.length === 0,
            missingRequired,
            presentOptional,
            warnings: []
        };

        // Add warnings for deprecated environment-only configuration
        if (process.env.TRELLO_BOARD_ID && process.env.TRELLO_LIST_ID) {
            result.warnings.push('Using environment variables for board configuration. Consider migrating to database-backed configuration for multi-board support.');
        }

        if (!process.env.DATABASE_PATH) {
            result.warnings.push('DATABASE_PATH not set, using default: ./data/discord-trello.db');
        }

        return result;
    }

    static validateTaskInput(taskInput) {
        if (!taskInput || typeof taskInput !== 'string') {
            return {
                valid: false,
                error: 'Task description is required'
            };
        }

        const trimmed = taskInput.trim();
        
        if (trimmed.length === 0) {
            return {
                valid: false,
                error: 'Task description cannot be empty'
            };
        }

        if (trimmed.length > 1000) {
            return {
                valid: false,
                error: 'Task description is too long (max 1000 characters)'
            };
        }

        return { valid: true, taskInput: trimmed };
    }

    static validateCardUpdate(field, value) {
        const allowedFields = ['name', 'desc', 'description', 'due'];
        
        if (!allowedFields.includes(field.toLowerCase())) {
            return {
                valid: false,
                error: `Invalid field '${field}'. Allowed fields: ${allowedFields.join(', ')}`
            };
        }

        if (!value || (typeof value !== 'string' && typeof value !== 'number')) {
            return {
                valid: false,
                error: 'Update value is required'
            };
        }

        // Specific validation for due dates
        if (field.toLowerCase() === 'due') {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                return {
                    valid: false,
                    error: 'Invalid date format for due date'
                };
            }
        }

        // Length validation for text fields
        if (['name', 'desc', 'description'].includes(field.toLowerCase())) {
            const stringValue = String(value);
            if (stringValue.length > 16384) {
                return {
                    valid: false,
                    error: `${field} is too long (max 16384 characters)`
                };
            }
        }

        return { valid: true };
    }

    static validateConfigCommand(subcommand, args) {
        const validSubcommands = ['board', 'show', 'list', 'remove', 'default', 'help'];
        
        if (!validSubcommands.includes(subcommand)) {
            return {
                valid: false,
                error: `Invalid config subcommand '${subcommand}'. Valid commands: ${validSubcommands.join(', ')}`
            };
        }

        // Validate arguments based on subcommand
        switch (subcommand) {
            case 'board':
                if (args.length < 1) {
                    return {
                        valid: false,
                        error: 'Board command requires at least a board ID'
                    };
                }
                
                const boardValidation = this.validateBoardId(args[0]);
                if (!boardValidation.valid) {
                    return boardValidation;
                }

                if (args.length > 1) {
                    const listValidation = this.validateListId(args[1]);
                    if (!listValidation.valid) {
                        return listValidation;
                    }
                }
                break;

            case 'default':
                if (args.length < 2) {
                    return {
                        valid: false,
                        error: 'Default command requires both board ID and list ID'
                    };
                }
                
                const defaultBoardValidation = this.validateBoardId(args[0]);
                if (!defaultBoardValidation.valid) {
                    return defaultBoardValidation;
                }

                const defaultListValidation = this.validateListId(args[1]);
                if (!defaultListValidation.valid) {
                    return defaultListValidation;
                }
                break;
        }

        return { valid: true };
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') {
            return input;
        }

        // Remove potentially dangerous characters and normalize whitespace
        return input
            .replace(/[<>]/g, '') // Remove angle brackets to prevent injection
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    static validateWebhookPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return {
                valid: false,
                error: 'Invalid webhook payload format'
            };
        }

        if (!payload.action || typeof payload.action !== 'object') {
            return {
                valid: false,
                error: 'Webhook payload missing action object'
            };
        }

        const { action } = payload;

        if (!action.type || typeof action.type !== 'string') {
            return {
                valid: false,
                error: 'Webhook action missing type'
            };
        }

        if (!action.memberCreator || typeof action.memberCreator !== 'object') {
            return {
                valid: false,
                error: 'Webhook action missing memberCreator'
            };
        }

        return { valid: true };
    }

    static validatePermissions(member, requiredPermissions) {
        if (!member || !member.permissions) {
            return {
                valid: false,
                error: 'Unable to check user permissions'
            };
        }

        const missingPermissions = requiredPermissions.filter(
            permission => !member.permissions.has(permission)
        );

        if (missingPermissions.length > 0) {
            return {
                valid: false,
                error: `Missing required permissions: ${missingPermissions.join(', ')}`
            };
        }

        return { valid: true };
    }

    static validateDatabaseConnection(db) {
        if (!db) {
            return {
                valid: false,
                error: 'Database connection not available'
            };
        }

        return { valid: true };
    }

    static logValidationError(context, validationResult) {
        if (!validationResult.valid) {
            console.error(`❌ Validation failed in ${context}: ${validationResult.error}`);
        }
    }
}

module.exports = { ValidationUtils };