require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

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

async function createTrelloCard(name, description = '') {
    try {
        const url = `https://api.trello.com/1/cards`;
        const params = {
            key: TRELLO_API_KEY,
            token: TRELLO_API_TOKEN,
            idList: TRELLO_LIST_ID,
            name: name,
            desc: description,
        };

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
            
            const taskName = args;
            const taskDescription = `Created by ${message.author.tag} in Discord channel: #${message.channel.name}`;
            
            const card = await createTrelloCard(taskName, taskDescription);
            
            await message.reactions.removeAll();
            await message.react('✅');
            
            const embed = {
                color: 0x0099ff,
                title: '📋 Task Created Successfully!',
                fields: [
                    {
                        name: '📝 Task',
                        value: taskName,
                        inline: false
                    },
                    {
                        name: '🔗 Trello Card',
                        value: card.shortUrl || 'Created successfully',
                        inline: false
                    },
                    {
                        name: '👤 Created by',
                        value: message.author.tag,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Discord-Trello Bot'
                }
            };

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.reactions.removeAll();
            await message.react('❌');
            
            console.error('Error processing command:', error);
            await message.reply('❌ Failed to create Trello card. Please check the bot configuration and try again.');
        }
    }
});

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