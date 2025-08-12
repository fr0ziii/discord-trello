const { EmbedBuilder } = require('discord.js');

class AIEnhancedManager {
    constructor(configManager, trelloService, analyticsManager, geminiService = null) {
        this.configManager = configManager;
        this.trelloService = trelloService;
        this.analyticsManager = analyticsManager;
        this.geminiService = geminiService;
        this.analysisCache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Generate intelligent configuration suggestions for a server
     */
    async generateConfigurationSuggestions(guildId, channels = [], options = {}) {
        try {
            if (!this.geminiService) {
                return this.getFallbackSuggestions(guildId, channels);
            }

            const cacheKey = `config_suggestions_${guildId}`;
            const cached = this.getCachedAnalysis(cacheKey);
            if (cached) return cached;

            // Gather context data
            const contextData = await this.gatherServerContext(guildId, channels);
            
            // Generate AI suggestions
            const suggestions = await this.generateAISuggestions(contextData, options);
            
            // Cache results
            this.setCachedAnalysis(cacheKey, suggestions);
            
            return suggestions;

        } catch (error) {
            console.error('❌ Error generating configuration suggestions:', error);
            return this.getFallbackSuggestions(guildId, channels);
        }
    }

    /**
     * Analyze server usage patterns and suggest optimizations
     */
    async analyzeUsagePatterns(guildId, timeframe = '30d') {
        try {
            if (!this.analyticsManager) {
                return this.getBasicUsageAnalysis(guildId);
            }

            const cacheKey = `usage_analysis_${guildId}_${timeframe}`;
            const cached = this.getCachedAnalysis(cacheKey);
            if (cached) return cached;

            // Get analytics data
            const analyticsData = await this.analyticsManager.getGuildAnalytics(guildId, timeframe);
            
            // Analyze patterns
            const analysis = await this.performUsageAnalysis(analyticsData);
            
            // Generate recommendations
            const recommendations = await this.generateUsageRecommendations(analysis, guildId);
            
            const result = {
                analysis,
                recommendations,
                insights: await this.generateUsageInsights(analysis),
                generatedAt: new Date().toISOString()
            };

            this.setCachedAnalysis(cacheKey, result);
            return result;

        } catch (error) {
            console.error('❌ Error analyzing usage patterns:', error);
            return this.getBasicUsageAnalysis(guildId);
        }
    }

    /**
     * Suggest optimal board organization based on content analysis
     */
    async suggestBoardOrganization(guildId, options = {}) {
        try {
            if (!this.geminiService) {
                return this.getBasicBoardSuggestions(guildId);
            }

            const { 
                analyzeExistingCards = true,
                considerChannelNames = true,
                includeWorkflowAnalysis = true
            } = options;

            // Gather board and channel data
            const boardData = await this.gatherBoardData(guildId, {
                analyzeExistingCards,
                considerChannelNames,
                includeWorkflowAnalysis
            });

            // Generate AI-powered suggestions
            const suggestions = await this.generateBoardOrganizationSuggestions(boardData);

            return {
                suggestions,
                currentStructure: boardData.currentStructure,
                optimization: suggestions.optimization,
                implementation: suggestions.implementation,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error suggesting board organization:', error);
            return this.getBasicBoardSuggestions(guildId);
        }
    }

    /**
     * Analyze migration needs and suggest optimal multi-board configuration
     */
    async analyzeMigrationNeeds(guildId) {
        try {
            const migrationAnalysis = await this.performMigrationAnalysis(guildId);
            
            if (!this.geminiService) {
                return {
                    ...migrationAnalysis,
                    aiSuggestions: null,
                    fallbackRecommendations: this.getBasicMigrationRecommendations(migrationAnalysis)
                };
            }

            // Generate AI-enhanced migration plan
            const aiSuggestions = await this.generateMigrationPlan(migrationAnalysis);

            return {
                ...migrationAnalysis,
                aiSuggestions,
                migrationStrategy: aiSuggestions.strategy,
                implementationSteps: aiSuggestions.steps,
                riskAssessment: aiSuggestions.risks,
                timeline: aiSuggestions.timeline
            };

        } catch (error) {
            console.error('❌ Error analyzing migration needs:', error);
            return {
                currentSetup: 'unknown',
                migrationNeeded: false,
                error: error.message
            };
        }
    }

    /**
     * Generate smart workflow automation suggestions
     */
    async suggestWorkflowAutomation(guildId, boardId = null) {
        try {
            if (!this.geminiService) {
                return this.getBasicWorkflowSuggestions(guildId);
            }

            const workflowData = await this.analyzeWorkflowPatterns(guildId, boardId);
            const automationSuggestions = await this.generateAutomationSuggestions(workflowData);

            return {
                currentWorkflows: workflowData.patterns,
                automationOpportunities: automationSuggestions.opportunities,
                suggestedRules: automationSuggestions.rules,
                implementation: automationSuggestions.implementation,
                benefits: automationSuggestions.benefits,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error suggesting workflow automation:', error);
            return this.getBasicWorkflowSuggestions(guildId);
        }
    }

    /**
     * Predict optimal due dates and priority assignments
     */
    async predictTaskMetadata(taskDescription, contextData = {}) {
        try {
            if (!this.geminiService) {
                return this.getBasicTaskMetadata(taskDescription);
            }

            const prediction = await this.generateTaskMetadataPrediction(taskDescription, contextData);

            return {
                suggestedDueDate: prediction.dueDate,
                predictedPriority: prediction.priority,
                estimatedEffort: prediction.effort,
                suggestedLabels: prediction.labels,
                workflowStage: prediction.stage,
                confidence: prediction.confidence,
                reasoning: prediction.reasoning
            };

        } catch (error) {
            console.error('❌ Error predicting task metadata:', error);
            return this.getBasicTaskMetadata(taskDescription);
        }
    }

    // Core AI interaction methods

    async generateAISuggestions(contextData, options) {
        try {
            const prompt = this.buildConfigurationPrompt(contextData, options);
            
            const response = await this.geminiService.models.generateContent({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-001',
                contents: prompt
            });

            const suggestions = this.parseAIResponse(response.text);
            
            return {
                suggestions: suggestions.configurations,
                reasoning: suggestions.reasoning,
                implementation: suggestions.implementation,
                priority: suggestions.priority,
                confidence: suggestions.confidence || 0.8,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error in AI suggestion generation:', error);
            throw error;
        }
    }

    async generateBoardOrganizationSuggestions(boardData) {
        try {
            const prompt = this.buildBoardOrganizationPrompt(boardData);
            
            const response = await this.geminiService.models.generateContent({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-001',
                contents: prompt
            });

            const suggestions = this.parseAIResponse(response.text);
            
            return {
                optimization: suggestions.optimization,
                newStructure: suggestions.structure,
                consolidationOpportunities: suggestions.consolidation,
                workflowImprovements: suggestions.workflows,
                implementation: suggestions.implementation,
                confidence: suggestions.confidence || 0.7
            };

        } catch (error) {
            console.error('❌ Error generating board organization suggestions:', error);
            throw error;
        }
    }

    async generateMigrationPlan(migrationAnalysis) {
        try {
            const prompt = this.buildMigrationPrompt(migrationAnalysis);
            
            const response = await this.geminiService.models.generateContent({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-001',
                contents: prompt
            });

            const plan = this.parseAIResponse(response.text);
            
            return {
                strategy: plan.strategy,
                steps: plan.steps,
                risks: plan.risks,
                timeline: plan.timeline,
                rollbackPlan: plan.rollback,
                testing: plan.testing,
                confidence: plan.confidence || 0.75
            };

        } catch (error) {
            console.error('❌ Error generating migration plan:', error);
            throw error;
        }
    }

    // Context gathering methods

    async gatherServerContext(guildId, channels) {
        try {
            const context = {
                guildId,
                channelCount: channels.length,
                channels: channels.map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    category: channel.parent?.name || null,
                    memberCount: channel.members?.size || 0
                })),
                currentConfig: await this.configManager.getServerConfigurations(guildId),
                analytics: await this.getServerAnalyticsSummary(guildId),
                patterns: this.detectChannelPatterns(channels),
                workflowHints: this.detectWorkflowHints(channels)
            };

            return context;

        } catch (error) {
            console.error('❌ Error gathering server context:', error);
            return { guildId, error: error.message };
        }
    }

    async gatherBoardData(guildId, options) {
        try {
            const currentConfig = await this.configManager.getServerConfigurations(guildId);
            const boardIds = [...new Set(currentConfig.map(config => config.board_id))];
            
            const boardData = {
                currentStructure: {
                    boardCount: boardIds.length,
                    channelMappings: currentConfig.length,
                    boards: []
                },
                contentAnalysis: [],
                workflowPatterns: []
            };

            // Analyze each board if requested
            if (options.analyzeExistingCards) {
                for (const boardId of boardIds) {
                    try {
                        const boardInfo = await this.trelloService.getBoardInfo(boardId);
                        const recentCards = await this.trelloService.getRecentCards(boardId, 20);
                        
                        boardData.currentStructure.boards.push({
                            id: boardId,
                            name: boardInfo.name,
                            lists: boardInfo.lists?.length || 0,
                            recentCardCount: recentCards?.length || 0
                        });

                        if (recentCards) {
                            boardData.contentAnalysis.push({
                                boardId,
                                cardPatterns: this.analyzeCardPatterns(recentCards),
                                labelUsage: this.analyzeLabelUsage(recentCards),
                                dueDatePatterns: this.analyzeDueDatePatterns(recentCards)
                            });
                        }
                    } catch (error) {
                        console.error(`Error analyzing board ${boardId}:`, error);
                    }
                }
            }

            return boardData;

        } catch (error) {
            console.error('❌ Error gathering board data:', error);
            return { currentStructure: { boardCount: 0, channelMappings: 0, boards: [] } };
        }
    }

    async performMigrationAnalysis(guildId) {
        try {
            const currentConfig = await this.configManager.getServerConfigurations(guildId);
            const defaultConfig = await this.configManager.getDefaultConfig(guildId);
            const analytics = await this.getServerAnalyticsSummary(guildId);

            const analysis = {
                currentSetup: this.categorizeCurrentSetup(currentConfig, defaultConfig),
                complexity: this.calculateConfigurationComplexity(currentConfig),
                usage: analytics,
                migrationNeeded: this.assessMigrationNeed(currentConfig, analytics),
                challenges: this.identifyMigrationChallenges(currentConfig),
                opportunities: this.identifyOptimizationOpportunities(currentConfig, analytics)
            };

            return analysis;

        } catch (error) {
            console.error('❌ Error performing migration analysis:', error);
            return {
                currentSetup: 'unknown',
                migrationNeeded: false,
                error: error.message
            };
        }
    }

    // Analysis helper methods

    detectChannelPatterns(channels) {
        const patterns = {
            naming: {
                hasPrefix: false,
                commonPrefixes: [],
                hasCategory: false,
                categoryPatterns: []
            },
            structure: {
                hasCategories: false,
                categoryCount: 0,
                averageChannelsPerCategory: 0
            },
            purpose: {
                development: 0,
                support: 0,
                general: 0,
                project: 0
            }
        };

        // Analyze naming patterns
        const channelNames = channels.map(ch => ch.name.toLowerCase());
        const prefixes = this.extractCommonPrefixes(channelNames);
        patterns.naming.commonPrefixes = prefixes;
        patterns.naming.hasPrefix = prefixes.length > 0;

        // Analyze categories
        const categories = [...new Set(channels.map(ch => ch.parent?.name).filter(Boolean))];
        patterns.structure.hasCategories = categories.length > 0;
        patterns.structure.categoryCount = categories.length;
        patterns.structure.averageChannelsPerCategory = categories.length > 0 ? channels.length / categories.length : 0;

        // Detect purpose patterns
        channelNames.forEach(name => {
            if (this.isDevelopmentChannel(name)) patterns.purpose.development++;
            else if (this.isSupportChannel(name)) patterns.purpose.support++;
            else if (this.isProjectChannel(name)) patterns.purpose.project++;
            else patterns.purpose.general++;
        });

        return patterns;
    }

    detectWorkflowHints(channels) {
        const hints = {
            hasStages: false,
            stageChannels: [],
            hasEnvironments: false,
            environments: [],
            hasProjects: false,
            projectChannels: []
        };

        const channelNames = channels.map(ch => ch.name.toLowerCase());

        // Detect stage-based workflows (dev, staging, prod, etc.)
        const stageKeywords = ['dev', 'staging', 'test', 'prod', 'production', 'qa'];
        stageKeywords.forEach(keyword => {
            const matchingChannels = channelNames.filter(name => name.includes(keyword));
            if (matchingChannels.length > 0) {
                hints.hasStages = true;
                hints.stageChannels.push({ stage: keyword, channels: matchingChannels });
            }
        });

        // Detect environment-based separation
        const envKeywords = ['development', 'staging', 'production', 'demo'];
        envKeywords.forEach(env => {
            const matchingChannels = channelNames.filter(name => name.includes(env));
            if (matchingChannels.length > 0) {
                hints.hasEnvironments = true;
                hints.environments.push({ environment: env, channels: matchingChannels });
            }
        });

        // Detect project-based organization
        const projectKeywords = ['project', 'team', 'client', 'feature'];
        projectKeywords.forEach(keyword => {
            const matchingChannels = channelNames.filter(name => name.includes(keyword));
            if (matchingChannels.length > 0) {
                hints.hasProjects = true;
                hints.projectChannels.push({ type: keyword, channels: matchingChannels });
            }
        });

        return hints;
    }

    analyzeCardPatterns(cards) {
        return {
            averageNameLength: cards.reduce((sum, card) => sum + card.name.length, 0) / cards.length,
            commonWords: this.extractCommonWords(cards.map(card => card.name)),
            hasDescriptions: cards.filter(card => card.desc).length / cards.length,
            hasDueDates: cards.filter(card => card.due).length / cards.length,
            hasLabels: cards.filter(card => card.labels && card.labels.length > 0).length / cards.length
        };
    }

    analyzeLabelUsage(cards) {
        const labelCounts = new Map();
        cards.forEach(card => {
            if (card.labels) {
                card.labels.forEach(label => {
                    labelCounts.set(label.name, (labelCounts.get(label.name) || 0) + 1);
                });
            }
        });

        return Array.from(labelCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

    analyzeDueDatePatterns(cards) {
        const cardsWithDues = cards.filter(card => card.due);
        if (cardsWithDues.length === 0) return { usage: 0, patterns: [] };

        const dueDates = cardsWithDues.map(card => new Date(card.due));
        const now = new Date();
        
        return {
            usage: cardsWithDues.length / cards.length,
            patterns: {
                futureCount: dueDates.filter(date => date > now).length,
                pastCount: dueDates.filter(date => date < now).length,
                averageDaysOut: this.calculateAverageDaysOut(dueDates, now)
            }
        };
    }

    // Prompt building methods

    buildConfigurationPrompt(contextData, options) {
        return `You are an AI assistant helping to optimize Discord-Trello bot configurations. Analyze the server context and provide intelligent configuration suggestions.

Server Context:
- Guild ID: ${contextData.guildId}
- Channel Count: ${contextData.channelCount}
- Current Configurations: ${contextData.currentConfig?.length || 0}
- Channel Patterns: ${JSON.stringify(contextData.patterns)}
- Workflow Hints: ${JSON.stringify(contextData.workflowHints)}

Channels:
${contextData.channels?.map(ch => `- ${ch.name} (${ch.type}, category: ${ch.category || 'none'})`).join('\n') || 'No channel data available'}

Please provide configuration suggestions as a JSON object with this structure:
{
  "configurations": [
    {
      "channelPattern": "pattern or specific channel name",
      "suggestedBoard": "board purpose/type",
      "suggestedList": "list purpose/type",
      "reasoning": "why this configuration is suggested",
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "overall reasoning for the suggestions",
  "implementation": {
    "order": ["step 1", "step 2", "step 3"],
    "considerations": ["consideration 1", "consideration 2"],
    "timeline": "estimated implementation time"
  },
  "priority": "overall priority level",
  "confidence": 0.8
}

Focus on:
1. Logical grouping of channels to boards
2. Workflow optimization
3. Team collaboration efficiency
4. Scalability for future growth`;
    }

    buildBoardOrganizationPrompt(boardData) {
        return `Analyze the current Trello board organization and suggest optimizations for better workflow efficiency.

Current Structure:
- Board Count: ${boardData.currentStructure.boardCount}
- Channel Mappings: ${boardData.currentStructure.channelMappings}
- Boards: ${JSON.stringify(boardData.currentStructure.boards)}

Content Analysis:
${JSON.stringify(boardData.contentAnalysis)}

Provide optimization suggestions as JSON:
{
  "optimization": {
    "consolidationOpportunities": ["opportunity 1", "opportunity 2"],
    "separationNeeds": ["need 1", "need 2"],
    "workflowImprovements": ["improvement 1", "improvement 2"]
  },
  "structure": {
    "recommendedBoards": [
      {
        "purpose": "board purpose",
        "suggestedLists": ["list 1", "list 2"],
        "channelMappings": ["channel pattern 1", "channel pattern 2"]
      }
    ]
  },
  "implementation": {
    "phases": ["phase 1", "phase 2"],
    "riskMitigation": ["mitigation 1", "mitigation 2"]
  },
  "confidence": 0.7
}`;
    }

    buildMigrationPrompt(migrationAnalysis) {
        return `Create a comprehensive migration plan for transitioning to an optimized multi-board Discord-Trello configuration.

Current Analysis:
- Setup Type: ${migrationAnalysis.currentSetup}
- Complexity: ${migrationAnalysis.complexity}
- Migration Needed: ${migrationAnalysis.migrationNeeded}
- Challenges: ${JSON.stringify(migrationAnalysis.challenges)}
- Opportunities: ${JSON.stringify(migrationAnalysis.opportunities)}

Provide a migration plan as JSON:
{
  "strategy": "migration strategy description",
  "steps": [
    {
      "phase": "phase name",
      "description": "what to do in this phase",
      "duration": "estimated time",
      "dependencies": ["dependency 1", "dependency 2"],
      "rollbackProcedure": "how to rollback if needed"
    }
  ],
  "risks": [
    {
      "risk": "risk description",
      "impact": "high|medium|low",
      "mitigation": "mitigation strategy"
    }
  ],
  "timeline": "overall timeline estimate",
  "rollback": "overall rollback strategy",
  "testing": ["test 1", "test 2", "test 3"],
  "confidence": 0.75
}`;
    }

    // Response parsing

    parseAIResponse(responseText) {
        try {
            // Extract JSON from response (handle potential markdown formatting)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }
            
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('❌ Error parsing AI response:', error);
            return {
                error: 'Failed to parse AI response',
                rawResponse: responseText
            };
        }
    }

    // Fallback methods for when AI is not available

    getFallbackSuggestions(guildId, channels) {
        return {
            suggestions: [
                {
                    channelPattern: 'general',
                    suggestedBoard: 'Main Project Board',
                    suggestedList: 'To Do',
                    reasoning: 'Default configuration for general purpose channels',
                    priority: 'medium'
                }
            ],
            reasoning: 'Basic fallback suggestions (AI not available)',
            implementation: {
                order: ['Configure main board', 'Set up channel mappings', 'Test configuration'],
                considerations: ['Verify board access', 'Set up webhooks'],
                timeline: '15-30 minutes'
            },
            priority: 'medium',
            confidence: 0.5,
            fallback: true,
            generatedAt: new Date().toISOString()
        };
    }

    getBasicUsageAnalysis(guildId) {
        return {
            analysis: {
                patterns: 'Basic analysis not available without AI',
                trends: 'Trend analysis requires AI capabilities'
            },
            recommendations: [
                'Monitor command usage patterns',
                'Review channel activity regularly',
                'Consider board consolidation if usage is low'
            ],
            insights: [
                'Enable AI features for detailed insights',
                'Collect more usage data for better analysis'
            ],
            fallback: true,
            generatedAt: new Date().toISOString()
        };
    }

    getBasicBoardSuggestions(guildId) {
        return {
            suggestions: [
                'Consider separate boards for different teams or projects',
                'Use consistent naming conventions across boards',
                'Implement a standard list structure'
            ],
            currentStructure: 'Analysis not available without AI',
            optimization: 'Enable AI features for detailed optimization suggestions',
            implementation: 'Basic implementation guidelines available',
            fallback: true,
            generatedAt: new Date().toISOString()
        };
    }

    getBasicMigrationRecommendations(analysis) {
        return [
            'Review current configuration usage',
            'Plan migration during low-activity periods',
            'Create backups before making changes',
            'Test new configuration with a small group first'
        ];
    }

    getBasicWorkflowSuggestions(guildId) {
        return {
            currentWorkflows: 'Analysis not available without AI',
            automationOpportunities: [
                'Use consistent labeling for automation',
                'Set up webhook notifications',
                'Consider due date automation'
            ],
            suggestedRules: [],
            implementation: 'Basic workflow suggestions available',
            benefits: ['Improved consistency', 'Reduced manual work'],
            fallback: true,
            generatedAt: new Date().toISOString()
        };
    }

    getBasicTaskMetadata(taskDescription) {
        return {
            suggestedDueDate: null,
            predictedPriority: 'medium',
            estimatedEffort: 'medium',
            suggestedLabels: [],
            workflowStage: 'todo',
            confidence: 0.3,
            reasoning: 'Basic metadata prediction (AI not available)',
            fallback: true
        };
    }

    // Helper methods

    getCachedAnalysis(key) {
        const cached = this.analysisCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        this.analysisCache.delete(key);
        return null;
    }

    setCachedAnalysis(key, data) {
        this.analysisCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    async getServerAnalyticsSummary(guildId) {
        try {
            if (this.analyticsManager) {
                const analytics = await this.analyticsManager.getGuildAnalytics(guildId, '30d');
                return {
                    totalCommands: analytics.summary.totalCommands,
                    activeChannels: analytics.channels.length,
                    topCommands: analytics.commands.slice(0, 3).map(cmd => cmd.command)
                };
            }
            return { totalCommands: 0, activeChannels: 0, topCommands: [] };
        } catch (error) {
            return { totalCommands: 0, activeChannels: 0, topCommands: [] };
        }
    }

    extractCommonPrefixes(names) {
        const prefixes = new Map();
        names.forEach(name => {
            const parts = name.split('-');
            if (parts.length > 1) {
                const prefix = parts[0];
                prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
            }
        });

        return Array.from(prefixes.entries())
            .filter(([prefix, count]) => count > 1)
            .map(([prefix, count]) => prefix);
    }

    extractCommonWords(texts) {
        const words = new Map();
        texts.forEach(text => {
            text.toLowerCase().split(/\s+/).forEach(word => {
                if (word.length > 3) {
                    words.set(word, (words.get(word) || 0) + 1);
                }
            });
        });

        return Array.from(words.entries())
            .filter(([word, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => word);
    }

    isDevelopmentChannel(name) {
        return /dev|development|code|programming|build|deploy/.test(name);
    }

    isSupportChannel(name) {
        return /support|help|ticket|issue|bug|problem/.test(name);
    }

    isProjectChannel(name) {
        return /project|feature|epic|milestone|release/.test(name);
    }

    categorizeCurrentSetup(currentConfig, defaultConfig) {
        if (currentConfig.length === 0) return 'unconfigured';
        if (currentConfig.length === 1 && defaultConfig) return 'single-board';
        if (currentConfig.length > 1) return 'multi-board';
        return 'basic';
    }

    calculateConfigurationComplexity(currentConfig) {
        const uniqueBoards = new Set(currentConfig.map(config => config.board_id)).size;
        if (uniqueBoards === 0) return 'none';
        if (uniqueBoards === 1) return 'simple';
        if (uniqueBoards <= 3) return 'moderate';
        return 'complex';
    }

    assessMigrationNeed(currentConfig, analytics) {
        // Simple heuristics for migration assessment
        if (currentConfig.length === 0) return true;
        if (currentConfig.length > 5 && analytics.activeChannels < 3) return true;
        return false;
    }

    identifyMigrationChallenges(currentConfig) {
        const challenges = [];
        
        if (currentConfig.length > 10) {
            challenges.push('Large number of existing configurations');
        }
        
        const uniqueBoards = new Set(currentConfig.map(config => config.board_id)).size;
        if (uniqueBoards > 5) {
            challenges.push('Multiple boards requiring coordination');
        }
        
        return challenges;
    }

    identifyOptimizationOpportunities(currentConfig, analytics) {
        const opportunities = [];
        
        if (currentConfig.length < analytics.activeChannels) {
            opportunities.push('More channels could benefit from Trello integration');
        }
        
        const boardUsage = new Map();
        currentConfig.forEach(config => {
            boardUsage.set(config.board_id, (boardUsage.get(config.board_id) || 0) + 1);
        });
        
        if (boardUsage.size > 1) {
            opportunities.push('Board consolidation could simplify management');
        }
        
        return opportunities;
    }

    calculateAverageDaysOut(dueDates, now) {
        const totalDays = dueDates.reduce((sum, date) => {
            const diffTime = date.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return sum + diffDays;
        }, 0);
        
        return Math.round(totalDays / dueDates.length);
    }

    /**
     * Health check for AI Enhanced Manager
     */
    async healthCheck() {
        return {
            healthy: true,
            aiEnabled: !!this.geminiService,
            cacheSize: this.analysisCache.size,
            features: {
                configurationSuggestions: true,
                usageAnalysis: !!this.analyticsManager,
                boardOrganization: true,
                migrationAnalysis: true,
                workflowAutomation: true,
                taskMetadataPrediction: !!this.geminiService
            }
        };
    }
}

module.exports = { AIEnhancedManager };