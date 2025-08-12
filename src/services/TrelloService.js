const axios = require('axios');

class TrelloService {
    constructor(configManager = null) {
        this.apiKey = process.env.TRELLO_API_KEY;
        this.apiToken = process.env.TRELLO_API_TOKEN;
        this.baseUrl = 'https://api.trello.com/1';
        this.configManager = configManager;
        
        if (!this.apiKey || !this.apiToken) {
            throw new Error('Trello API credentials not configured');
        }
    }

    getAuthParams() {
        return {
            key: this.apiKey,
            token: this.apiToken
        };
    }

    async createCard(boardId, listId, name, description = '', options = {}) {
        try {
            const url = `${this.baseUrl}/cards`;
            const params = {
                ...this.getAuthParams(),
                idList: listId,
                name: name,
                desc: description,
            };

            // Add optional rich parameters
            if (options.due) params.due = options.due;
            if (options.pos) params.pos = options.pos;
            if (options.idLabels && options.idLabels.length > 0) {
                params.idLabels = options.idLabels.join(',');
            }

            const response = await axios.post(url, null, { params });
            return response.data;
        } catch (error) {
            console.error(`❌ Error creating Trello card on board ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async updateCard(cardId, updates) {
        try {
            const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, {
                params: {
                    ...this.getAuthParams(),
                    ...updates
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error updating Trello card ${cardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getCard(cardId) {
        try {
            const response = await axios.get(`${this.baseUrl}/cards/${cardId}`, {
                params: this.getAuthParams()
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error getting Trello card ${cardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getBoardStatus(boardId) {
        try {
            const boardResponse = await axios.get(`${this.baseUrl}/boards/${boardId}`, {
                params: {
                    ...this.getAuthParams(),
                    lists: 'open',
                    cards: 'open'
                }
            });
            
            const listsResponse = await axios.get(`${this.baseUrl}/boards/${boardId}/lists`, {
                params: {
                    ...this.getAuthParams(),
                    cards: 'open'
                }
            });
            
            return {
                board: boardResponse.data,
                lists: listsResponse.data
            };
        } catch (error) {
            console.error(`❌ Error getting board status for ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getRecentCards(boardId, limit = 10) {
        try {
            const response = await axios.get(`${this.baseUrl}/boards/${boardId}/cards`, {
                params: {
                    ...this.getAuthParams(),
                    limit: limit,
                    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error getting recent cards for board ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getBoardLabels(boardId) {
        try {
            const response = await axios.get(`${this.baseUrl}/boards/${boardId}/labels`, {
                params: this.getAuthParams()
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error getting board labels for ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async createLabel(boardId, name, color) {
        try {
            const response = await axios.post(`${this.baseUrl}/labels`, null, {
                params: {
                    ...this.getAuthParams(),
                    name: name,
                    color: color,
                    idBoard: boardId
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error creating label "${name}" on board ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getOrCreateLabels(boardId, labelNames) {
        if (!labelNames || labelNames.length === 0) return [];
        
        try {
            // Get existing labels on the board
            const existingLabels = await this.getBoardLabels(boardId);
            
            const labelIds = [];
            const labelColors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'sky', 'lime', 'black'];
            
            for (const labelName of labelNames) {
                // Check if label already exists
                const existingLabel = existingLabels.find(label => 
                    label.name.toLowerCase() === labelName.toLowerCase()
                );
                
                if (existingLabel) {
                    labelIds.push(existingLabel.id);
                } else {
                    // Create new label
                    try {
                        const newLabel = await this.createLabel(
                            boardId,
                            labelName,
                            labelColors[Math.floor(Math.random() * labelColors.length)]
                        );
                        labelIds.push(newLabel.id);
                    } catch (createError) {
                        console.error(`❌ Error creating label "${labelName}":`, createError.message);
                    }
                }
            }
            
            return labelIds;
        } catch (error) {
            console.error(`❌ Error managing Trello labels for board ${boardId}:`, error.message);
            return [];
        }
    }

    async validateBoardAccess(boardId) {
        try {
            const response = await axios.get(`${this.baseUrl}/boards/${boardId}`, {
                params: this.getAuthParams()
            });
            return {
                valid: true,
                board: response.data
            };
        } catch (error) {
            return {
                valid: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async validateListAccess(listId) {
        try {
            const response = await axios.get(`${this.baseUrl}/lists/${listId}`, {
                params: this.getAuthParams()
            });
            return {
                valid: true,
                list: response.data
            };
        } catch (error) {
            return {
                valid: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async getBoardLists(boardId) {
        try {
            const response = await axios.get(`${this.baseUrl}/boards/${boardId}/lists`, {
                params: {
                    ...this.getAuthParams(),
                    filter: 'open'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error getting lists for board ${boardId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    // Webhook management methods
    async createWebhook(callbackURL, boardId, description) {
        try {
            const response = await axios.post(`${this.baseUrl}/webhooks`, null, {
                params: {
                    ...this.getAuthParams(),
                    callbackURL: callbackURL,
                    idModel: boardId,
                    description: description || 'Discord-Trello Bot Webhook'
                }
            });
            return response.data;
        } catch (error) {
            console.error('❌ Error creating Trello webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    async deleteWebhook(webhookId) {
        try {
            await axios.delete(`${this.baseUrl}/webhooks/${webhookId}`, {
                params: this.getAuthParams()
            });
            console.log(`🗑️ Webhook ${webhookId} deleted successfully`);
        } catch (error) {
            console.error('❌ Error deleting Trello webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    async listWebhooks() {
        try {
            const response = await axios.get(`${this.baseUrl}/tokens/${this.apiToken}/webhooks`, {
                params: this.getAuthParams()
            });
            return response.data;
        } catch (error) {
            console.error('❌ Error listing Trello webhooks:', error.response?.data || error.message);
            throw error;
        }
    }

    async getWebhooksForBoard(boardId) {
        try {
            const allWebhooks = await this.listWebhooks();
            return allWebhooks.filter(webhook => webhook.idModel === boardId);
        } catch (error) {
            console.error(`❌ Error getting webhooks for board ${boardId}:`, error.message);
            throw error;
        }
    }

    // Health check method
    async healthCheck() {
        try {
            // Try to get user information to verify API access
            const response = await axios.get(`${this.baseUrl}/members/me`, {
                params: this.getAuthParams()
            });
            return {
                healthy: true,
                user: response.data.fullName,
                userId: response.data.id
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Board discovery methods
    async getUserBoards() {
        try {
            const response = await axios.get(`${this.baseUrl}/members/me/boards`, {
                params: {
                    ...this.getAuthParams(),
                    filter: 'open'
                }
            });
            return response.data;
        } catch (error) {
            console.error('❌ Error getting user boards:', error.response?.data || error.message);
            throw error;
        }
    }

    async searchBoards(query) {
        try {
            const userBoards = await this.getUserBoards();
            const filteredBoards = userBoards.filter(board => 
                board.name.toLowerCase().includes(query.toLowerCase())
            );
            return filteredBoards;
        } catch (error) {
            console.error(`❌ Error searching boards for "${query}":`, error.message);
            throw error;
        }
    }

    // ====================================================================
    // PHASE 3.2: DYNAMIC CONTEXT-AWARE METHODS
    // These methods resolve board/list configurations dynamically
    // ====================================================================

    /**
     * Create card with dynamic board/list resolution
     */
    async createCardWithContext(guildId, channelId, name, description = '', options = {}) {
        if (!this.configManager) {
            throw new Error('ConfigManager not available - cannot resolve board configuration');
        }

        try {
            const config = await this.configManager.getChannelMapping(guildId, channelId);
            if (!config) {
                throw new Error('No board configuration found for this channel');
            }

            return await this.createCard(config.boardId, config.listId, name, description, options);
        } catch (error) {
            console.error(`❌ Error creating card with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Get board status with dynamic board resolution
     */
    async getBoardStatusWithContext(guildId, channelId) {
        if (!this.configManager) {
            throw new Error('ConfigManager not available - cannot resolve board configuration');
        }

        try {
            const config = await this.configManager.getChannelMapping(guildId, channelId);
            if (!config) {
                throw new Error('No board configuration found for this channel');
            }

            const status = await this.getBoardStatus(config.boardId);
            return {
                ...status,
                config: config // Include configuration details
            };
        } catch (error) {
            console.error(`❌ Error getting board status with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Get recent cards with dynamic board resolution
     */
    async getRecentCardsWithContext(guildId, channelId, limit = 10) {
        if (!this.configManager) {
            throw new Error('ConfigManager not available - cannot resolve board configuration');
        }

        try {
            const config = await this.configManager.getChannelMapping(guildId, channelId);
            if (!config) {
                throw new Error('No board configuration found for this channel');
            }

            const cards = await this.getRecentCards(config.boardId, limit);
            return {
                cards: cards,
                config: config // Include configuration details
            };
        } catch (error) {
            console.error(`❌ Error getting recent cards with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Get or create labels with dynamic board resolution
     */
    async getOrCreateLabelsWithContext(guildId, channelId, labelNames) {
        if (!this.configManager) {
            throw new Error('ConfigManager not available - cannot resolve board configuration');
        }

        try {
            const config = await this.configManager.getChannelMapping(guildId, channelId);
            if (!config) {
                throw new Error('No board configuration found for this channel');
            }

            return await this.getOrCreateLabels(config.boardId, labelNames);
        } catch (error) {
            console.error(`❌ Error getting/creating labels with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Update card with board context validation (optional)
     * Validates that the card belongs to the board configured for the channel
     */
    async updateCardWithContext(guildId, channelId, cardId, updates, validateBoard = false) {
        if (!this.configManager) {
            console.log('⚠️ ConfigManager not available - updating card without board validation');
            return await this.updateCard(cardId, updates);
        }

        try {
            if (validateBoard) {
                const config = await this.configManager.getChannelMapping(guildId, channelId);
                if (config) {
                    // Get card details to verify it belongs to the configured board
                    const card = await this.getCard(cardId);
                    if (card.idBoard !== config.boardId) {
                        throw new Error(`Card ${cardId} does not belong to the configured board for this channel`);
                    }
                }
            }

            return await this.updateCard(cardId, updates);
        } catch (error) {
            console.error(`❌ Error updating card with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Get board lists with dynamic board resolution
     */
    async getBoardListsWithContext(guildId, channelId) {
        if (!this.configManager) {
            throw new Error('ConfigManager not available - cannot resolve board configuration');
        }

        try {
            const config = await this.configManager.getChannelMapping(guildId, channelId);
            if (!config) {
                throw new Error('No board configuration found for this channel');
            }

            const lists = await this.getBoardLists(config.boardId);
            return {
                lists: lists,
                config: config // Include configuration details
            };
        } catch (error) {
            console.error(`❌ Error getting board lists with context (guild: ${guildId}, channel: ${channelId}):`, error);
            throw error;
        }
    }

    /**
     * Resolve configuration with fallback support
     * This method provides backward compatibility with environment variables
     */
    async resolveConfiguration(guildId, channelId) {
        try {
            if (this.configManager) {
                const config = await this.configManager.getChannelMapping(guildId, channelId);
                if (config) {
                    return config;
                }
            }

            // Fallback to environment variables if available
            const envBoardId = process.env.TRELLO_BOARD_ID;
            const envListId = process.env.TRELLO_LIST_ID;
            
            if (envBoardId && envListId) {
                console.log('⚠️ Using environment variable fallback for board configuration');
                return {
                    boardId: envBoardId,
                    listId: envListId,
                    isEnvironment: true,
                    source: 'environment'
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Error resolving configuration:', error);
            return null;
        }
    }

    /**
     * Set ConfigManager for dependency injection
     */
    setConfigManager(configManager) {
        this.configManager = configManager;
    }
}

module.exports = { TrelloService };