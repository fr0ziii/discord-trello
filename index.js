require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const genaiModule = require('@google/genai');
const GoogleGenAI = genaiModule.GoogleGenAI;

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

// Initialize Gemini AI
let genAI;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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
        const args = message.content.slice(COMMAND_PREFIX.length).trim();
        
        if (!args) {
            await message.reply('❌ Please provide a task description. Usage: `!t <task_description>`');
            return;
        }

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
                analysis = await analyzeTaskWithGemini(args, discordContext);
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
                card = await createTrelloCard(args, taskDescription);
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
            
            console.error('Error processing command:', error);
            await message.reply('❌ Failed to create Trello card. Please check the bot configuration and try again.');
        }
    }
});

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

process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

validateEnvironmentVariables();

client.login(DISCORD_BOT_TOKEN).catch((error) => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});