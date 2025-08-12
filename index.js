require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const genaiModule = require('@google/genai');
const GoogleGenAI = genaiModule.GoogleGenAI;
const express = require('express');
const crypto = require('crypto');

// Import new modular services
const { getDatabase } = require('./src/database/connection');
const { MigrationManager } = require('./src/database/migrations');
const { ConfigManager } = require('./src/services/ConfigManager');
const { TrelloService } = require('./src/services/TrelloService');
const { WebhookManager } = require('./src/services/WebhookManager');
const { CommandRouter } = require('./src/commands/CommandRouter');
const { ValidationUtils } = require('./src/utils/validation');
const { getCache } = require('./src/utils/cache');

// Phase 3.3 Advanced Services
const { PermissionManager } = require('./src/services/PermissionManager');
const { AnalyticsManager } = require('./src/services/AnalyticsManager');
const { AuditLogger } = require('./src/services/AuditLogger');
const { TemplateManager } = require('./src/services/TemplateManager');
const { AIEnhancedManager } = require('./src/services/AIEnhancedManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Environment variables
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!t';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001';
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Initialize services
let db;
let configManager;
let trelloService;
let webhookManager;
let commandRouter;
let configCache;
let genAI;

// Phase 3.3 Advanced Services
let permissionManager;
let analyticsManager;
let auditLogger;
let templateManager;
let aiEnhancedManager;

// Initialize Gemini AI
if (GEMINI_API_KEY) {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// Initialize Express server for webhooks
const app = express();
app.use(express.raw({ type: 'application/json' }));

// Service initialization function
async function initializeServices() {
    try {
        console.log('🔧 Initializing services...');
        
        // Initialize database and run migrations
        db = getDatabase();
        const migrationManager = new MigrationManager();
        await migrationManager.runMigrations();
        
        // Initialize cache
        configCache = getCache();
        
        // Initialize core services with database and cache integration
        configManager = new ConfigManager();
        trelloService = new TrelloService(configManager);
        webhookManager = new WebhookManager(trelloService);
        
        // Initialize Phase 3.3 advanced services
        console.log('🚀 Initializing Phase 3.3 advanced services...');
        
        permissionManager = new PermissionManager();
        analyticsManager = new AnalyticsManager();
        auditLogger = new AuditLogger();
        templateManager = new TemplateManager(configManager, trelloService);
        aiEnhancedManager = new AIEnhancedManager(configManager, trelloService, analyticsManager, genAI);
        
        // Initialize enhanced CommandRouter with all Phase 3.3 services
        commandRouter = new CommandRouter(
            configManager, 
            trelloService, 
            genAI, 
            webhookManager,
            {
                permissionManager,
                analyticsManager,
                auditLogger,
                templateManager,
                aiEnhancedManager
            }
        );
        
        console.log('✅ Phase 3.3 services initialized successfully');
        
        // Enhanced ConfigManager with caching
        configManager.getChannelMapping = async function(guildId, channelId) {
            // Try cache first
            const cached = await configCache.getChannelMapping(guildId, channelId);
            if (cached) {
                return cached;
            }
            
            // Get from database
            const originalMethod = ConfigManager.prototype.getChannelMapping;
            const result = await originalMethod.call(this, guildId, channelId);
            
            // Cache the result if found
            if (result) {
                await configCache.setChannelMapping(guildId, channelId, result);
            }
            
            return result;
        }.bind(configManager);
        
        // Enhanced TrelloService with caching
        const originalValidateBoardAccess = trelloService.validateBoardAccess;
        trelloService.validateBoardAccess = async function(boardId) {
            // Try cache first
            const cached = await configCache.getBoardValidation(boardId);
            if (cached) {
                return cached;
            }
            
            // Validate with API
            const result = await originalValidateBoardAccess.call(this, boardId);
            
            // Cache the result
            await configCache.setBoardValidation(boardId, result);
            
            return result;
        }.bind(trelloService);
        
        const originalValidateListAccess = trelloService.validateListAccess;
        trelloService.validateListAccess = async function(listId) {
            // Try cache first
            const cached = await configCache.getListValidation(listId);
            if (cached) {
                return cached;
            }
            
            // Validate with API
            const result = await originalValidateListAccess.call(this, listId);
            
            // Cache the result
            await configCache.setListValidation(listId, result);
            
            return result;
        }.bind(trelloService);
        
        console.log('✅ All services initialized successfully');
        
        // Log system startup
        if (auditLogger) {
            await auditLogger.logSystemEvent('startup', {
                version: '1.2.0',
                features: commandRouter.getEnabledFeatures(),
                timestamp: new Date().toISOString()
            }, 'LOW');
        }
        
        // Run health checks
        await runHealthChecks();
        
    } catch (error) {
        console.error('❌ Failed to initialize services:', error);
        
        // Log startup failure
        if (auditLogger) {
            await auditLogger.logSystemEvent('startup_failure', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'HIGH');
        }
        
        // Fallback to basic functionality
        console.log('⚠️ Falling back to basic functionality...');
        configManager = null;
        trelloService = null;
        commandRouter = null;
        
        // Clear Phase 3.3 services on failure
        permissionManager = null;
        analyticsManager = null;
        auditLogger = null;
        templateManager = null;
        aiEnhancedManager = null;
    }
}

async function runHealthChecks() {
    console.log('🏥 Running health checks...');
    
    try {
        // Database health check
        const dbHealth = await db.healthCheck();
        console.log(`🗃️ Database: ${dbHealth ? '✅ Healthy' : '❌ Unhealthy'}`);
        
        // Cache health check
        const cacheHealth = await configCache.healthCheck();
        console.log(`📦 Cache: ${cacheHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        
        // Trello API health check
        if (trelloService) {
            const trelloHealth = await trelloService.healthCheck();
            console.log(`🔗 Trello API: ${trelloHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        }
        
        // WebhookManager health check
        if (webhookManager) {
            const webhookHealth = await webhookManager.healthCheck();
            console.log(`🪝 Webhook Manager: ${webhookHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${webhookHealth.activeRegistrations || 0} active webhooks)`);
        }
        
        // Phase 3.3 service health checks
        if (permissionManager) {
            const permHealth = await permissionManager.healthCheck();
            console.log(`🔒 Permission Manager: ${permHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${permHealth.cacheSize} cached permissions)`);
        }
        
        if (analyticsManager) {
            const analyticsHealth = await analyticsManager.getHealthMetrics();
            console.log(`📊 Analytics Manager: ${analyticsHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${analyticsHealth.bufferStatus?.size || 0} buffered metrics)`);
        }
        
        if (auditLogger) {
            const auditHealth = await auditLogger.healthCheck();
            console.log(`📝 Audit Logger: ${auditHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${auditHealth.bufferSize} buffered logs)`);
        }
        
        if (templateManager) {
            const templateHealth = await templateManager.healthCheck();
            console.log(`📋 Template Manager: ${templateHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${templateHealth.templateCount} templates)`);
        }
        
        if (aiEnhancedManager) {
            const aiHealth = await aiEnhancedManager.healthCheck();
            console.log(`🧠 AI Enhanced Manager: ${aiHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (AI: ${aiHealth.aiEnabled ? '✅' : '❌'})`);
        }
        
        // CommandRouter comprehensive health check
        if (commandRouter) {
            const routerHealth = await commandRouter.healthCheck();
            console.log(`🎮 Command Router: ${routerHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'} (${routerHealth.commands.registered} commands registered)`);
            
            const enabledFeatures = Object.entries(routerHealth.features)
                .filter(([feature, enabled]) => enabled)
                .map(([feature]) => feature);
            
            console.log(`🚀 Enabled Features: ${enabledFeatures.join(', ')}`);
        }
        
        // Record health check in analytics
        if (analyticsManager) {
            await analyticsManager.recordSystemMetric('health_check', {
                timestamp: new Date().toISOString(),
                services: {
                    database: dbHealth,
                    cache: cacheHealth.healthy,
                    trello: trelloService ? true : false,
                    webhooks: webhookManager ? true : false,
                    permissions: permissionManager ? true : false,
                    analytics: analyticsManager ? true : false,
                    audit: auditLogger ? true : false,
                    templates: templateManager ? true : false,
                    ai: aiEnhancedManager ? true : false
                }
            });
        }
        
    } catch (error) {
        console.error('⚠️ Health check warnings:', error.message);
        
        // Log health check failure
        if (auditLogger) {
            await auditLogger.logSystemEvent('health_check_failure', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'MEDIUM');
        }
    }
}

// Webhook verification function (unchanged for compatibility)
function verifyTrelloWebhook(body, signature, secret) {
    if (!secret || !signature) {
        return false;
    }
    
    const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(body)
        .digest('base64');
    
    return signature === expectedSignature;
}

// Discord notification function (unchanged for compatibility)
async function sendDiscordNotification(channelId, embed) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('❌ Error sending Discord notification:', error);
    }
}

// Trello event embed creation (unchanged for compatibility)
function createTrelloEventEmbed(action) {
    const { type, data, memberCreator, date } = action;
    
    let embed = {
        timestamp: date,
        footer: { text: 'Trello • Discord-Trello Bot' }
    };

    switch (type) {
        case 'createCard':
            embed.title = '🆕 New Card Created';
            embed.color = 0x00ff00;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false },
                { name: '📋 List', value: data.list.name, inline: true },
                { name: '👤 Created by', value: memberCreator.fullName, inline: true }
            ];
            break;
            
        case 'updateCard':
            embed.title = '✏️ Card Updated';
            embed.color = 0xffa500;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false }
            ];
            
            if (data.old && data.card) {
                if (data.old.name !== data.card.name) {
                    embed.fields.push({ name: '🔄 Name Changed', value: `${data.old.name} → ${data.card.name}`, inline: false });
                }
                if (data.old.desc !== data.card.desc) {
                    embed.fields.push({ name: '📄 Description Updated', value: 'Description was modified', inline: false });
                }
                if (data.old.due !== data.card.due) {
                    embed.fields.push({ name: '📅 Due Date Changed', value: data.card.due ? formatDate(data.card.due) : 'Due date removed', inline: false });
                }
            }
            
            embed.fields.push({ name: '👤 Updated by', value: memberCreator.fullName, inline: true });
            break;
            
        case 'commentCard':
            embed.title = '💬 New Comment';
            embed.color = 0x0099ff;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false },
                { name: '💬 Comment', value: data.text.length > 200 ? data.text.substring(0, 200) + '...' : data.text, inline: false },
                { name: '👤 By', value: memberCreator.fullName, inline: true }
            ];
            break;
            
        case 'addMemberToCard':
            embed.title = '👥 Member Added to Card';
            embed.color = 0x9370db;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false },
                { name: '👤 Member Added', value: data.member.fullName, inline: true },
                { name: '👤 Added by', value: memberCreator.fullName, inline: true }
            ];
            break;
            
        case 'removeMemberFromCard':
            embed.title = '👥 Member Removed from Card';
            embed.color = 0xff6347;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false },
                { name: '👤 Member Removed', value: data.member.fullName, inline: true },
                { name: '👤 Removed by', value: memberCreator.fullName, inline: true }
            ];
            break;
            
        case 'updateCheckItemStateOnCard':
            const checkState = data.checkItem.state === 'complete' ? '✅' : '⬜';
            embed.title = `${checkState} Checklist Item Updated`;
            embed.color = data.checkItem.state === 'complete' ? 0x00ff00 : 0xffff00;
            embed.fields = [
                { name: '📝 Card', value: data.card.name, inline: false },
                { name: '✅ Item', value: data.checkItem.name, inline: false },
                { name: '👤 By', value: memberCreator.fullName, inline: true }
            ];
            break;
            
        default:
            embed.title = '🔔 Trello Activity';
            embed.color = 0x0079bf;
            embed.fields = [
                { name: '📋 Event', value: type, inline: false },
                { name: '👤 By', value: memberCreator.fullName, inline: true }
            ];
            break;
    }

    return embed;
}

// Enhanced webhook endpoint with multi-board support
app.post('/webhook/trello', async (req, res) => {
    try {
        const signature = req.get('X-Trello-Webhook');
        const body = req.body;
        
        // Verify webhook signature if secret is configured
        if (WEBHOOK_SECRET) {
            if (!verifyTrelloWebhook(body, signature, WEBHOOK_SECRET)) {
                console.log('❌ Webhook signature verification failed');
                return res.status(401).send('Unauthorized');
            }
        }
        
        const payload = JSON.parse(body.toString());
        
        // Validate webhook payload
        const validation = ValidationUtils.validateWebhookPayload(payload);
        if (!validation.valid) {
            console.error('❌ Invalid webhook payload:', validation.error);
            return res.status(400).send('Bad Request');
        }
        
        const { action } = payload;
        
        console.log(`🔔 Webhook received: ${action.type} by ${action.memberCreator.fullName}`);
        
        // Create Discord notification
        const embed = createTrelloEventEmbed(action);
        
        // Enhanced multi-board notification routing via WebhookManager
        if (webhookManager && action.data.board) {
            try {
                const boardId = action.data.board.id;
                console.log(`🔀 Routing webhook notification for board: ${boardId}`);
                
                // Log webhook event in audit logger
                if (auditLogger) {
                    await auditLogger.logSystemEvent('webhook_received', {
                        boardId,
                        action: action.type,
                        member: action.memberCreator.fullName,
                        timestamp: new Date().toISOString()
                    }, 'LOW');
                }
                
                const result = await webhookManager.routeNotificationToChannels(boardId, client, embed);
                
                if (result.success && result.notificationsSent > 0) {
                    console.log(`✅ Successfully routed webhook notification to ${result.notificationsSent} channels`);
                    
                    // Record analytics for webhook routing
                    if (analyticsManager) {
                        await analyticsManager.recordSystemMetric('webhook_routing', {
                            boardId,
                            channelsNotified: result.notificationsSent,
                            actionType: action.type,
                            timestamp: new Date().toISOString()
                        });
                    }
                } else if (result.success && result.notificationsSent === 0) {
                    console.log(`⚠️ No channels configured for board ${boardId}, using fallback notification`);
                    
                    // Log unconfigured board warning
                    if (auditLogger) {
                        await auditLogger.logSystemEvent('webhook_unconfigured_board', {
                            boardId,
                            actionType: action.type,
                            timestamp: new Date().toISOString()
                        }, 'MEDIUM');
                    }
                    
                    // Fallback to broadcast to all guilds
                    client.guilds.cache.forEach(guild => {
                        const systemChannel = guild.systemChannel;
                        if (systemChannel && systemChannel.permissionsFor(client.user)?.has('SendMessages')) {
                            sendDiscordNotification(systemChannel.id, embed);
                        }
                    });
                }
            } catch (error) {
                console.error('❌ Error in webhook manager routing:', error);
                
                // Log webhook routing failure
                if (auditLogger) {
                    await auditLogger.logSystemEvent('webhook_routing_failure', {
                        boardId: action.data.board.id,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }, 'HIGH');
                }
                
                // Fallback to original behavior
                client.guilds.cache.forEach(guild => {
                    const systemChannel = guild.systemChannel;
                    if (systemChannel && systemChannel.permissionsFor(client.user)?.has('SendMessages')) {
                        sendDiscordNotification(systemChannel.id, embed);
                    }
                });
            }
        } else {
            // Fallback when WebhookManager not available or no board data
            console.log('⚠️ WebhookManager not available or no board data, using broadcast fallback');
            
            if (auditLogger) {
                await auditLogger.logSystemEvent('webhook_fallback', {
                    reason: webhookManager ? 'no_board_data' : 'webhook_manager_unavailable',
                    actionType: action.type,
                    timestamp: new Date().toISOString()
                }, 'MEDIUM');
            }
            
            client.guilds.cache.forEach(guild => {
                const systemChannel = guild.systemChannel;
                if (systemChannel && systemChannel.permissionsFor(client.user)?.has('SendMessages')) {
                    sendDiscordNotification(systemChannel.id, embed);
                }
            });
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint (enhanced for Phase 3.3)
app.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            version: '1.2.0',
            phase: 'Phase 3.3 - Advanced Features & Admin Tools',
            services: {
                database: false,
                cache: false,
                trello: false,
                webhook_manager: false,
                discord: client.readyAt !== null,
                // Phase 3.3 services
                permission_manager: false,
                analytics_manager: false,
                audit_logger: false,
                template_manager: false,
                ai_enhanced_manager: false
            }
        };
        
        // Core services
        if (db) {
            health.services.database = await db.healthCheck();
        }
        
        if (configCache) {
            const cacheHealth = await configCache.healthCheck();
            health.services.cache = cacheHealth.healthy;
            health.cache_stats = cacheHealth.stats;
        }
        
        if (trelloService) {
            const trelloHealth = await trelloService.healthCheck();
            health.services.trello = trelloHealth.healthy;
        }
        
        if (webhookManager) {
            const webhookHealth = await webhookManager.healthCheck();
            health.services.webhook_manager = webhookHealth.healthy;
            health.webhook_stats = {
                totalRegistrations: webhookHealth.totalRegistrations,
                activeRegistrations: webhookHealth.activeRegistrations
            };
        }
        
        // Phase 3.3 services health checks
        if (permissionManager) {
            const permHealth = await permissionManager.healthCheck();
            health.services.permission_manager = permHealth.healthy;
            health.permission_stats = {
                cacheSize: permHealth.cacheSize,
                features: permHealth.features
            };
        }
        
        if (analyticsManager) {
            const analyticsHealth = await analyticsManager.getHealthMetrics();
            health.services.analytics_manager = analyticsHealth.healthy;
            health.analytics_stats = {
                bufferSize: analyticsHealth.bufferStatus?.size || 0,
                maxBufferSize: analyticsHealth.bufferStatus?.maxSize || 0,
                realTimeMetrics: analyticsHealth.realTime
            };
        }
        
        if (auditLogger) {
            const auditHealth = await auditLogger.healthCheck();
            health.services.audit_logger = auditHealth.healthy;
            health.audit_stats = {
                bufferSize: auditHealth.bufferSize,
                features: auditHealth.features
            };
        }
        
        if (templateManager) {
            const templateHealth = await templateManager.healthCheck();
            health.services.template_manager = templateHealth.healthy;
            health.template_stats = {
                templateCount: templateHealth.templateCount,
                supportedFormats: templateHealth.supportedFormats
            };
        }
        
        if (aiEnhancedManager) {
            const aiHealth = await aiEnhancedManager.healthCheck();
            health.services.ai_enhanced_manager = aiHealth.healthy;
            health.ai_stats = {
                aiEnabled: aiHealth.aiEnabled,
                cacheSize: aiHealth.cacheSize,
                features: aiHealth.features
            };
        }
        
        // CommandRouter comprehensive health
        if (commandRouter) {
            const routerHealth = await commandRouter.healthCheck();
            health.command_router = {
                healthy: routerHealth.healthy,
                commandsRegistered: routerHealth.commands.registered,
                availableCommands: routerHealth.commands.available,
                enabledFeatures: routerHealth.features
            };
        }
        
        // Overall system health assessment
        const unhealthyServices = Object.entries(health.services)
            .filter(([service, healthy]) => !healthy)
            .map(([service]) => service);
        
        if (unhealthyServices.length > 0) {
            health.status = 'DEGRADED';
            health.degraded_services = unhealthyServices;
        }
        
        // Record health check request in analytics
        if (analyticsManager) {
            await analyticsManager.recordSystemMetric('health_check_request', {
                timestamp: health.timestamp,
                status: health.status,
                degradedServices: unhealthyServices
            });
        }
        
        res.status(200).json(health);
    } catch (error) {
        console.error('❌ Health check endpoint error:', error);
        
        // Log health check failure
        if (auditLogger) {
            await auditLogger.logSystemEvent('health_endpoint_failure', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'HIGH');
        }
        
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            version: '1.2.0',
            phase: 'Phase 3.3 - Advanced Features & Admin Tools',
            error: error.message
        });
    }
});

// Environment validation (enhanced)
function validateEnvironmentVariables() {
    const validation = ValidationUtils.validateEnvironmentVariables();
    
    if (!validation.valid) {
        console.error('❌ Missing required environment variables:');
        validation.missingRequired.forEach(varName => console.error(`   - ${varName}`));
        console.error('\nPlease check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
        console.log('⚠️ Configuration warnings:');
        validation.warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    
    console.log('✅ Environment validation passed');
    if (validation.presentOptional.length > 0) {
        console.log(`🔧 Optional features enabled: ${validation.presentOptional.join(', ')}`);
    }
}

// Discord client ready event (enhanced for Phase 3.3)
client.once('ready', async () => {
    console.log('🤖 Discord-Trello Bot is online!');
    console.log(`🎯 Listening for "${COMMAND_PREFIX}" commands`);
    console.log('🚀 Phase 3.3: Advanced Features & Admin Tools Enabled');
    
    // Initialize services after Discord client is ready
    await initializeServices();
    
    if (genAI) {
        console.log('🧠 Gemini AI integration enabled - Smart card creation active');
    } else {
        console.log('📝 Gemini AI not configured - Using basic card creation');
    }
    
    // Set activity based on available Phase 3.3 features
    const features = [];
    if (configManager) features.push('Multi-board');
    if (genAI) features.push('AI');
    if (WEBHOOK_URL && webhookManager) features.push('Smart Webhooks');
    if (permissionManager) features.push('Permissions');
    if (analyticsManager) features.push('Analytics');
    if (auditLogger) features.push('Audit');
    if (templateManager) features.push('Templates');
    if (aiEnhancedManager) features.push('AI-Enhanced');
    
    const activityText = features.length > 0 
        ? `${COMMAND_PREFIX} help • ${features.slice(0, 3).join(', ')}${features.length > 3 ? '...' : ''}`
        : `${COMMAND_PREFIX} help`;
    
    client.user.setActivity(activityText, { type: 'LISTENING' });
    
    // Log successful startup
    if (auditLogger) {
        await auditLogger.logSystemEvent('bot_ready', {
            features: features,
            commandPrefix: COMMAND_PREFIX,
            guilds: client.guilds.cache.size,
            timestamp: new Date().toISOString()
        }, 'LOW');
    }
    
    // Log system statistics
    if (analyticsManager) {
        await analyticsManager.recordSystemMetric('bot_startup', {
            guilds: client.guilds.cache.size,
            features: features,
            version: '1.2.0',
            phase: 'Phase 3.3',
            timestamp: new Date().toISOString()
        });
    }
    
    console.log(`🏆 Bot ready! Serving ${client.guilds.cache.size} guilds with ${features.length} advanced features enabled.`);
});

// Enhanced message handling with modular routing
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith(COMMAND_PREFIX)) {
        try {
            if (commandRouter) {
                // Use modular command routing
                await commandRouter.routeCommand(message, COMMAND_PREFIX);
            } else {
                // Fallback to basic functionality
                await message.reply('⚠️ Bot services are initializing. Please try again in a moment.');
            }
        } catch (error) {
            console.error('❌ Error in message handling:', error);
            await message.reply('❌ An error occurred. Please try again.');
        }
    }
});

// Utility function (unchanged for compatibility)
function formatDate(dateString) {
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

// Error handling (enhanced)
client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Graceful shutdown (enhanced for Phase 3.3)
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
        // Log shutdown event
        if (auditLogger) {
            await auditLogger.logSystemEvent('shutdown_initiated', {
                signal,
                timestamp: new Date().toISOString()
            }, 'LOW');
            
            // Flush any remaining audit logs
            await auditLogger.flushLogBuffer();
        }
        
        // Flush analytics buffer
        if (analyticsManager) {
            console.log('📊 Flushing analytics data...');
            await analyticsManager.flushMetricsBuffer();
        }
        
        // Close Phase 3.3 services
        console.log('🔄 Closing Phase 3.3 services...');
        
        if (permissionManager) {
            permissionManager.clearPermissionCache();
        }
        
        if (templateManager) {
            console.log('📋 Template manager shutdown');
        }
        
        if (aiEnhancedManager) {
            console.log('🧠 AI enhanced manager shutdown');
        }
        
        // Close webhook services
        if (webhookManager) {
            console.log('🧹 Running webhook cleanup...');
            try {
                await webhookManager.cleanupOrphanedWebhooks();
            } catch (cleanupError) {
                console.error('⚠️ Webhook cleanup failed:', cleanupError.message);
            }
        }
        
        // Close cache and database
        if (configCache) {
            configCache.close();
            console.log('📦 Cache closed');
        }
        
        if (db) {
            await db.close();
            console.log('🗃️ Database connection closed');
        }
        
        // Close Express server
        if (server) {
            server.close(() => {
                console.log('🌐 Webhook server closed');
            });
        }
        
        // Destroy Discord client
        client.destroy();
        console.log('🤖 Discord client disconnected');
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        
        // Log shutdown error if possible
        if (auditLogger) {
            try {
                await auditLogger.logSystemEvent('shutdown_error', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'HIGH');
            } catch (logError) {
                console.error('Failed to log shutdown error:', logError.message);
            }
        }
        
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Legacy webhook management functions (for compatibility with deployment scripts)
async function createTrelloWebhook(callbackURL, description) {
    if (trelloService) {
        return await trelloService.createWebhook(callbackURL, process.env.TRELLO_BOARD_ID, description);
    }
    throw new Error('TrelloService not available');
}

async function deleteTrelloWebhook(webhookId) {
    if (trelloService) {
        return await trelloService.deleteWebhook(webhookId);
    }
    throw new Error('TrelloService not available');
}

async function listTrelloWebhooks() {
    if (trelloService) {
        return await trelloService.listWebhooks();
    }
    throw new Error('TrelloService not available');
}

// Main initialization
console.log('🚀 Starting Discord-Trello Bot...');
validateEnvironmentVariables();

client.login(DISCORD_BOT_TOKEN).catch((error) => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});

// Start Express server for webhooks
const server = app.listen(WEBHOOK_PORT, async () => {
    console.log(`🌐 Webhook server running on port ${WEBHOOK_PORT}`);
    
    // Initialize webhooks if URL is configured
    if (WEBHOOK_URL) {
        console.log(`🪝 Webhook URL configured: ${WEBHOOK_URL}`);
        
        // Auto-register webhooks for all configured boards
        setTimeout(async () => {
            try {
                if (webhookManager) {
                    console.log('🚀 Starting auto-registration of webhooks for all configured boards...');
                    const results = await webhookManager.autoRegisterWebhooksForConfiguredBoards(WEBHOOK_URL);
                    
                    if (results.success) {
                        console.log(`✅ Webhook auto-registration completed: ${results.successful}/${results.total} boards`);
                        
                        if (results.successful < results.total) {
                            console.log('⚠️ Some webhooks failed to register. Check logs above for details.');
                            console.log('💡 You can manually manage webhooks using config commands.');
                        }
                    } else {
                        console.error('❌ Webhook auto-registration failed:', results.error);
                        console.log('💡 You can manually register webhooks using config commands.');
                    }
                }
                
                // Fallback to legacy behavior if TRELLO_BOARD_ID is set but no multi-board config
                else if (trelloService && process.env.TRELLO_BOARD_ID) {
                    console.log('📄 Using legacy webhook registration for TRELLO_BOARD_ID...');
                    const existingWebhooks = await listTrelloWebhooks();
                    const botWebhook = existingWebhooks.find(webhook => 
                        webhook.callbackURL === `${WEBHOOK_URL}/webhook/trello`
                    );
                    
                    if (!botWebhook) {
                        console.log('🔧 Registering legacy webhook...');
                        const webhook = await createTrelloWebhook(
                            `${WEBHOOK_URL}/webhook/trello`,
                            'Discord-Trello Bot Legacy Auto-registered'
                        );
                        console.log(`✅ Legacy webhook registered: ${webhook.id}`);
                    } else {
                        console.log(`✅ Legacy webhook already exists: ${botWebhook.id}`);
                    }
                }
            } catch (error) {
                console.error('⚠️ Failed to register webhooks:', error.message);
                console.log('💡 You can manually register webhooks using config commands.');
            }
        }, 8000); // Wait 8 seconds for services to fully initialize
    } else {
        console.log('⚠️ WEBHOOK_URL not configured - webhook notifications disabled');
    }
});