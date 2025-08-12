require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const genaiModule = require('@google/genai');
const GoogleGenAI = genaiModule.GoogleGenAI;
const express = require('express');
const crypto = require('crypto');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!t';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001';
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Initialize Gemini AI
let genAI;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// Initialize Express server for webhooks
const app = express();
app.use(express.raw({ type: 'application/json' }));

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

async function analyzeTaskWithGemini(taskInput, discordContext) {
    if (!genAI) {
        console.log('Gemini API not configured, falling back to basic card creation');
        return null;
    }

    try {
        // Use the new API with models.generateContent
        
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

        const response = await genAI.models.generateContent({
            model: GEMINI_MODEL,
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
        console.error('Error analyzing task with Gemini:', error);
        return null;
    }
}

async function getOrCreateTrelloLabels(labelNames) {
    if (!labelNames || labelNames.length === 0) return [];
    
    try {
        // Get existing labels on the board
        const boardLabelsResponse = await axios.get(
            `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels`,
            { params: { key: TRELLO_API_KEY, token: TRELLO_API_TOKEN } }
        );
        const existingLabels = boardLabelsResponse.data;
        
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
                    const newLabelResponse = await axios.post(
                        'https://api.trello.com/1/labels',
                        null,
                        {
                            params: {
                                key: TRELLO_API_KEY,
                                token: TRELLO_API_TOKEN,
                                name: labelName,
                                color: labelColors[Math.floor(Math.random() * labelColors.length)],
                                idBoard: TRELLO_BOARD_ID
                            }
                        }
                    );
                    labelIds.push(newLabelResponse.data.id);
                } catch (createError) {
                    console.error(`Error creating label "${labelName}":`, createError.message);
                }
            }
        }
        
        return labelIds;
    } catch (error) {
        console.error('Error managing Trello labels:', error.message);
        return [];
    }
}

async function createTrelloCard(name, description = '', options = {}) {
    try {
        const url = `https://api.trello.com/1/cards`;
        const params = {
            key: TRELLO_API_KEY,
            token: TRELLO_API_TOKEN,
            idList: TRELLO_LIST_ID,
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
        console.error('Error creating Trello card:', error.response?.data || error.message);
        throw error;
    }
}

async function createTrelloWebhook(callbackURL, description) {
    try {
        const response = await axios.post('https://api.trello.com/1/webhooks', null, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN,
                callbackURL: callbackURL,
                idModel: TRELLO_BOARD_ID,
                description: description || 'Discord-Trello Bot Webhook'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating Trello webhook:', error.response?.data || error.message);
        throw error;
    }
}

async function deleteTrelloWebhook(webhookId) {
    try {
        await axios.delete(`https://api.trello.com/1/webhooks/${webhookId}`, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN
            }
        });
        console.log(`🗑️ Webhook ${webhookId} deleted successfully`);
    } catch (error) {
        console.error('Error deleting Trello webhook:', error.response?.data || error.message);
        throw error;
    }
}

async function listTrelloWebhooks() {
    try {
        const response = await axios.get(`https://api.trello.com/1/tokens/${TRELLO_API_TOKEN}/webhooks`, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error listing Trello webhooks:', error.response?.data || error.message);
        throw error;
    }
}

async function sendDiscordNotification(channelId, embed) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error sending Discord notification:', error);
    }
}

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

// Webhook endpoint
app.post('/webhook/trello', (req, res) => {
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
        const { action } = payload;
        
        console.log(`🔔 Webhook received: ${action.type} by ${action.memberCreator.fullName}`);
        
        // Create and send Discord notification
        const embed = createTrelloEventEmbed(action);
        
        // Send to all channels where bot has been used (this is a simplified approach)
        // In a production setup, you'd want to store channel mappings in a database
        client.guilds.cache.forEach(guild => {
            const systemChannel = guild.systemChannel;
            if (systemChannel && systemChannel.permissionsFor(client.user).has('SendMessages')) {
                sendDiscordNotification(systemChannel.id, embed);
            }
        });
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

async function getBoardStatus() {
    try {
        const boardResponse = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}`, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN,
                lists: 'open',
                cards: 'open'
            }
        });
        
        const listsResponse = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists`, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN,
                cards: 'open'
            }
        });
        
        return {
            board: boardResponse.data,
            lists: listsResponse.data
        };
    } catch (error) {
        console.error('Error getting board status:', error.response?.data || error.message);
        throw error;
    }
}

async function updateTrelloCard(cardId, updates) {
    try {
        const response = await axios.put(`https://api.trello.com/1/cards/${cardId}`, null, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN,
                ...updates
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating Trello card:', error.response?.data || error.message);
        throw error;
    }
}

async function getRecentCards(limit = 10) {
    try {
        const response = await axios.get(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/cards`, {
            params: {
                key: TRELLO_API_KEY,
                token: TRELLO_API_TOKEN,
                limit: limit,
                since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting recent cards:', error.response?.data || error.message);
        throw error;
    }
}

function validateEnvironmentVariables() {
    const requiredVars = [
        'DISCORD_BOT_TOKEN',
        'TRELLO_API_KEY',
        'TRELLO_API_TOKEN',
        'TRELLO_BOARD_ID',
        'TRELLO_LIST_ID'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:');
        missingVars.forEach(varName => console.error(`   - ${varName}`));
        console.error('\nPlease check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
}

client.once('ready', () => {
    console.log('🤖 Discord-Trello Bot is online!');
    console.log(`📋 Connected to Trello Board: ${TRELLO_BOARD_ID}`);
    console.log(`🎯 Listening for "${COMMAND_PREFIX}" commands`);
    
    if (genAI) {
        console.log('🧠 Gemini AI integration enabled - Smart card creation active');
    } else {
        console.log('📝 Gemini AI not configured - Using basic card creation');
    }
    
    client.user.setActivity(`${COMMAND_PREFIX} <task>`, { type: 'LISTENING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith(COMMAND_PREFIX)) {
        const fullArgs = message.content.slice(COMMAND_PREFIX.length).trim();
        const [command, ...args] = fullArgs.split(' ');
        
        if (!command) {
            await message.reply('❌ Please provide a command. Available commands: `create`, `status`, `list`, `update`, `help`');
            return;
        }

        try {
            switch (command.toLowerCase()) {
                case 'help':
                    await handleHelpCommand(message);
                    break;
                    
                case 'status':
                    await handleStatusCommand(message);
                    break;
                    
                case 'list':
                    await handleListCommand(message, args);
                    break;
                    
                case 'update':
                    await handleUpdateCommand(message, args);
                    break;
                    
                default:
                    // Default behavior - create card (backward compatibility)
                    await handleCreateCommand(message, fullArgs);
                    break;
            }
        } catch (error) {
            console.error('Error processing command:', error);
            await message.reply('❌ An error occurred processing your command. Please try again.');
        }
    }
});

async function handleHelpCommand(message) {
    const embed = {
        color: 0x0079bf,
        title: '🤖 Discord-Trello Bot Commands',
        fields: [
            {
                name: `${COMMAND_PREFIX} <task_description>`,
                value: 'Create a new Trello card with AI-powered analysis',
                inline: false
            },
            {
                name: `${COMMAND_PREFIX} status`,
                value: 'Show current board status and statistics',
                inline: false
            },
            {
                name: `${COMMAND_PREFIX} list [limit]`,
                value: 'Show recent cards (default: 5, max: 20)',
                inline: false
            },
            {
                name: `${COMMAND_PREFIX} update <card-id> <field>=<value>`,
                value: 'Update an existing card (fields: name, desc, due)',
                inline: false
            },
            {
                name: `${COMMAND_PREFIX} help`,
                value: 'Show this help message',
                inline: false
            }
        ],
        footer: {
            text: genAI ? 'Discord-Trello Bot • Powered by Gemini AI' : 'Discord-Trello Bot'
        },
        timestamp: new Date().toISOString()
    };
    
    await message.reply({ embeds: [embed] });
}

async function handleStatusCommand(message) {
    try {
        await message.react('⏳');
        
        const status = await getBoardStatus();
        let totalCards = 0;
        
        const listFields = status.lists.map(list => {
            totalCards += list.cards.length;
            return {
                name: `📋 ${list.name}`,
                value: `${list.cards.length} cards`,
                inline: true
            };
        });
        
        const embed = {
            color: 0x0079bf,
            title: `📊 Board Status: ${status.board.name}`,
            fields: [
                {
                    name: '📈 Overview',
                    value: `**Total Cards**: ${totalCards}\n**Lists**: ${status.lists.length}`,
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
        console.error('Error getting board status:', error);
        await message.reply('❌ Failed to get board status. Please check the bot configuration.');
    }
}

async function handleListCommand(message, args) {
    try {
        await message.react('⏳');
        
        const limit = Math.min(parseInt(args[0]) || 5, 20);
        const recentCards = await getRecentCards(limit);
        
        if (recentCards.length === 0) {
            await message.reply('📝 No recent cards found.');
            return;
        }
        
        const cardFields = recentCards.slice(0, limit).map(card => ({
            name: `📝 ${card.name}`,
            value: `**ID**: ${card.id.substring(0, 8)}\n**Created**: ${formatDate(card.dateLastActivity)}${card.due ? `\n**Due**: ${formatDate(card.due)}` : ''}`,
            inline: true
        }));
        
        const embed = {
            color: 0x0079bf,
            title: `📋 Recent Cards (${cardFields.length})`,
            fields: cardFields,
            footer: { text: 'Discord-Trello Bot' },
            timestamp: new Date().toISOString()
        };
        
        await message.reactions.removeAll();
        await message.react('✅');
        await message.reply({ embeds: [embed] });
        
    } catch (error) {
        await message.react('❌');
        console.error('Error getting recent cards:', error);
        await message.reply('❌ Failed to get recent cards. Please check the bot configuration.');
    }
}

async function handleUpdateCommand(message, args) {
    try {
        if (args.length < 2) {
            await message.reply('❌ Usage: `!tupdate <card-id> <field>=<value>`\nExample: `!tupdate abc12345 name=New Task Name`');
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
        
        const updatedCard = await updateTrelloCard(cardId, updates);
        
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
        console.error('Error updating card:', error);
        await message.reply('❌ Failed to update card. Please check the card ID and try again.');
    }
}

async function handleCreateCommand(message, fullArgs) {
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
        
        // Try Gemini analysis first
        if (genAI) {
            console.log('🤖 Analyzing task with Gemini...');
            analysis = await analyzeTaskWithGemini(fullArgs, discordContext);
        }
        
        if (analysis) {
            // Create rich card with Gemini analysis
            console.log('✨ Creating rich card with analysis:', analysis);
            
            const labelIds = await getOrCreateTrelloLabels(analysis.labels);
            const cardOptions = {
                pos: analysis.priority === 'High' ? 'top' : 'bottom',
                idLabels: labelIds
            };
            
            if (analysis.dueDate) {
                cardOptions.due = analysis.dueDate;
            }
            
            const enrichedDescription = `${analysis.description}\n\n---\n**Created by:** ${message.author.tag}\n**Channel:** #${message.channel.name}\n**Priority:** ${analysis.priority}\n**Estimated Effort:** ${analysis.estimatedEffort}`;
            
            card = await createTrelloCard(analysis.title, enrichedDescription, cardOptions);
        } else {
            // Fallback to basic card creation
            console.log('📝 Creating basic card (Gemini unavailable)');
            const taskDescription = `Created by ${message.author.tag} in Discord channel: #${message.channel.name}`;
            card = await createTrelloCard(fullArgs, taskDescription);
        }
        
        await message.reactions.removeAll();
        await message.react('✅');
        
        // Create enhanced embed response
        const embed = createTaskEmbed(card, analysis, message.author.tag);
        await message.reply({ embeds: [embed] });
        
    } catch (error) {
        try {
            await message.reactions.removeAll();
        } catch (reactionError) {
            if (reactionError.code === 50013) {
                console.log('Missing permissions to manage reactions');
            } else {
                console.error('Error removing reactions:', reactionError);
            }
        }
        await message.react('❌');
        
        console.error('Error creating card:', error);
        await message.reply('❌ Failed to create Trello card. Please check the bot configuration and try again.');
    }
}

function createTaskEmbed(card, analysis, authorTag) {
    const embed = {
        color: analysis ? getPriorityColor(analysis.priority) : 0x0099ff,
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
                value: `${getPriorityEmoji(analysis.priority)} ${analysis.priority}`,
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
                value: formatDate(analysis.dueDate),
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

function getPriorityColor(priority) {
    switch (priority) {
        case 'High': return 0xff4444;
        case 'Medium': return 0xffaa00;
        case 'Low': return 0x44ff44;
        default: return 0x0099ff;
    }
}

function getPriorityEmoji(priority) {
    switch (priority) {
        case 'High': return '🔴';
        case 'Medium': return '🟡';
        case 'Low': return '🟢';
        default: return '🔵';
    }
}

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

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

validateEnvironmentVariables();

client.login(DISCORD_BOT_TOKEN).catch((error) => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});

// Start Express server for webhooks
const server = app.listen(WEBHOOK_PORT, () => {
    console.log(`🌐 Webhook server running on port ${WEBHOOK_PORT}`);
    
    // Initialize webhooks if URL is configured
    if (WEBHOOK_URL) {
        console.log(`🪝 Webhook URL configured: ${WEBHOOK_URL}`);
        
        // Auto-register webhook on startup (optional)
        setTimeout(async () => {
            try {
                const existingWebhooks = await listTrelloWebhooks();
                const botWebhook = existingWebhooks.find(webhook => 
                    webhook.callbackURL === `${WEBHOOK_URL}/webhook/trello`
                );
                
                if (!botWebhook) {
                    console.log('🔧 Registering new webhook...');
                    const webhook = await createTrelloWebhook(
                        `${WEBHOOK_URL}/webhook/trello`,
                        'Discord-Trello Bot Auto-registered'
                    );
                    console.log(`✅ Webhook registered: ${webhook.id}`);
                } else {
                    console.log(`✅ Webhook already exists: ${botWebhook.id}`);
                }
            } catch (error) {
                console.error('⚠️ Failed to register webhook:', error.message);
                console.log('💡 You can manually register webhooks later.');
            }
        }, 5000); // Wait 5 seconds for Discord client to be ready
    } else {
        console.log('⚠️ WEBHOOK_URL not configured - webhook notifications disabled');
    }
});

// Gracefully close server on shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    server.close(() => {
        client.destroy();
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        client.destroy();
        process.exit(0);
    });
});