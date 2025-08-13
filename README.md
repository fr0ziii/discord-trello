# Discord-Trello Bot

An enterprise-ready Discord bot that provides comprehensive multi-board integration between Discord and Trello with real-time synchronization, advanced analytics, and AI-powered features. Each Discord channel can be mapped to different Trello boards, enabling sophisticated team organization, workflow management, and collaborative project tracking with intelligent automation.

## 🚀 Features

### Core Integration
- **🔄 Real-Time Synchronization**: Bidirectional Discord ↔ Trello updates via webhooks
- **🌐 Webhook Server**: Built-in Express.js server for receiving Trello notifications
- **🔐 Secure Webhooks**: HMAC-SHA1 signature verification for webhook authenticity
- **📡 Live Notifications**: Instant Discord notifications for all Trello board activity

### AI-Powered Task Management
- **🧠 AI-Powered Task Analysis**: Uses Google Gemini AI to intelligently parse natural language task descriptions
- **📝 Smart Card Creation**: Automatically extracts priority, due dates, labels, and effort estimates from conversational input
- **🎯 Priority Detection**: High priority tasks automatically go to the top of your Trello list
- **📅 Natural Language Dates**: Parse due dates from phrases like "by Friday", "next week", or "in 2 days"
- **🏷️ Automatic Labeling**: Smart label creation and assignment based on task content (bug, feature, urgent, etc.)
- **📊 Rich Context**: Creates detailed card descriptions with effort estimates and categorization

### Advanced Bot Commands
- **💬 Multiple Commands**: `help`, `status`, `list`, `update` commands beyond basic card creation
- **📊 Board Analytics**: Real-time board statistics and health monitoring
- **📋 Card Management**: View recent cards, update existing cards directly from Discord
- **🔍 Smart Search**: List and filter cards with intelligent display

### Production Ready
- **🔄 Graceful Fallback**: Works with or without AI - falls back to basic card creation if needed
- **🎨 Enhanced Discord UI**: Color-coded priority indicators and comprehensive task analysis display
- **🐳 Docker Support**: Containerized application with webhook server support
- **🌐 VPS Ready**: Includes deployment scripts for any Linux VPS
- **🔒 Environment Configuration**: Secure API key management with environment variables
- **📱 Rich Embeds**: Beautiful Discord responses with detailed task analysis and Trello links
- **🛠️ Error Handling**: Comprehensive error handling with intelligent fallbacks
- **💚 Health Monitoring**: Built-in health checks for container monitoring

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [VPS Deployment](#vps-deployment)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🔧 Prerequisites

### Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token
4. Invite the bot to your server with appropriate permissions:
   - Read Messages
   - Send Messages
   - Use Slash Commands
   - Add Reactions
   - Embed Links

### Trello API Setup
1. Get your Trello API key from [https://trello.com/app-key](https://trello.com/app-key)
2. Generate a token by visiting: `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Discord-Trello-Bot&key=YOUR_API_KEY`
3. Find your Board ID and List ID:
   - Open your Trello board in a web browser
   - Add `.json` to the end of the URL
   - Find your `id` (board ID) and the `id` of the list where you want to create cards

### Google Gemini AI Setup (Optional)
1. Go to [Google AI Studio](https://ai.google.dev/tutorials/setup)
2. Create an API key for Gemini
3. Add the key to your environment variables
4. **Note**: The bot works without Gemini AI, but you'll miss the intelligent task analysis features

### System Requirements
- Node.js 18+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- Linux VPS with Ubuntu/Debian (for production deployment)

## ⚡ Quick Start

### 1. Clone and Setup
```bash
git clone <your-repository-url>
cd discord-trello-bot
cp .env.example .env
# Edit .env with your API keys
npm install
```

### 2. Configure Environment Variables
Edit the `.env` file with your API credentials:
```bash
# Required
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TRELLO_API_KEY=your_trello_api_key_here
TRELLO_API_TOKEN=your_trello_api_token_here
TRELLO_BOARD_ID=your_trello_board_id_here
TRELLO_LIST_ID=your_trello_list_id_here

# Optional (for AI features)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-pro
```

### 3. Run the Bot
```bash
# Local development
npm start

# Or with Docker
docker-compose up -d
```

## 🔐 Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token from Developer Portal | `MTIzNDU2Nzg5MDEyMzQ1Njc4.X1Y2Z3.abc123` |
| `TRELLO_API_KEY` | ✅ | Trello API key | `1234567890abcdef` |
| `TRELLO_API_TOKEN` | ✅ | Trello API token | `abcdef1234567890` |
| `TRELLO_BOARD_ID` | ✅ | ID of your Trello board | `507f1f77bcf86cd799439011` |
| `TRELLO_LIST_ID` | ✅ | ID of the Trello list to create cards in | `507f191e810c19729de860ea` |
| `COMMAND_PREFIX` | ❌ | Command prefix (default: `!t`) | `!task` or `!todo` |
| `GEMINI_API_KEY` | ❌ | Google AI Studio API key for smart features | `AIzaSyB...` |
| `GEMINI_MODEL` | ❌ | Gemini model name (default: `gemini-2.0-flash-001`) | `gemini-2.0-flash-001` |
| `WEBHOOK_PORT` | ❌ | Port for webhook server (default: `3000`) | `3000` |
| `WEBHOOK_SECRET` | ❌ | Secret for webhook signature verification | `your_webhook_secret` |
| `WEBHOOK_URL` | ❌ | Public URL for Trello webhooks | `https://yourdomain.com` |

### Finding Trello IDs

1. **Board ID**: 
   - Open your board: `https://trello.com/b/BOARD_ID/board-name`
   - Add `.json`: `https://trello.com/b/BOARD_ID/board-name.json`
   - Find the `id` field in the JSON

2. **List ID**:
   - In the same JSON, find the `lists` array
   - Copy the `id` of the list where you want cards created

## 🛠️ Local Development

### Setup
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env

# Run in development mode
npm run dev
```

### Project Structure
```
discord-trello-bot/
├── index.js              # Main bot application with AI + webhook integration
├── package.json          # Dependencies and scripts
├── .env.example          # Environment template with webhook config
├── .env                  # Your environment variables (not committed)
├── .gitignore            # Git ignore rules
├── Dockerfile            # Docker container configuration
├── docker-compose.yml    # Docker Compose setup with webhook port
├── deploy.sh             # VPS deployment script
├── CLAUDE.md             # Project development documentation
├── docs/                 # Documentation directory
│   └── TRELLO_API_RESEARCH_SUMMARY.md  # API research and enhancement plans
└── README.md             # This file
```

### Available Scripts
```bash
npm start          # Start the bot
npm run dev        # Start in development mode
npm run docker:build  # Build Docker image
npm run docker:run    # Run with Docker Compose
npm run docker:stop   # Stop Docker containers
npm run docker:logs   # View Docker logs
```

## 🐳 Docker Deployment

### Build and Run
```bash
# Build the image
docker build -t discord-trello-bot .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Docker Compose Features
- **Webhook Server**: Express.js server on port 3000 for Trello webhooks
- **Auto-restart**: Container restarts automatically on failure
- **Resource limits**: Memory and CPU limits optimized for webhook server
- **Health checks**: Built-in webhook endpoint health monitoring
- **Log management**: Automatic log rotation
- **Volume mounting**: Persistent logs directory
- **Port Mapping**: Webhook server accessible from host

## 🌐 VPS Deployment

### Automated Deployment
Use the included deployment script for quick VPS setup:

```bash
# On your VPS (as root)
wget https://raw.githubusercontent.com/yourusername/discord-trello-bot/main/deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

### Manual VPS Deployment
```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. Clone repository
git clone <your-repo-url>
cd discord-trello-bot

# 4. Setup environment
cp .env.example .env
nano .env  # Add your credentials

# 5. Deploy
sudo docker-compose up -d
```

### Deployment Script Commands
```bash
# Full deployment
sudo ./deploy.sh deploy

# Update application
sudo ./deploy.sh update

# View logs
sudo ./deploy.sh logs

# Restart application
sudo ./deploy.sh restart

# Stop application
sudo ./deploy.sh stop

# Check status
sudo ./deploy.sh status
```

## 📖 Usage

### Available Commands
Once the bot is running in your Discord server:

#### Task Creation (Default Behavior)
```
!t Buy groceries
!t Review pull request #123 by Friday
!t Schedule team meeting for next week - high priority
!t Fix urgent bug in authentication system
!t Research new framework, should take 2-3 days
```

#### Bot Management Commands
```
!t help              # Show all available commands and usage
!t status            # Display current board statistics and health
!t list [number]     # Show recent cards (default: 5, max: 20)
!t update <card-id> <field>=<value>  # Update existing cards
```

#### Update Command Examples
```
!t update abc12345 name=New Task Title
!t update def67890 desc=Updated task description
!t update ghi13579 due=2024-12-25
```

### AI-Enhanced Examples
With Gemini AI enabled, the bot intelligently parses these complex requests:

```
!t Fix the login page crash ASAP, users can't sign in
→ Creates: High priority card, "urgent" + "bug" labels, positioned at top

!t Plan team retrospective for next Friday at 2pm
→ Creates: Meeting card with due date, "meeting" label, medium priority

!t Research React 19 features, probably 2-3 hours of work
→ Creates: Research card with "research" label, effort estimation

!t Deploy the new API endpoints to production by end of week
→ Creates: High priority deployment task with Friday due date
```

### Bot Responses

#### Task Creation Response (Basic)
- ✅ Success confirmation with task name
- 🔗 Direct link to the created Trello card
- 👤 User who created the task
- 📅 Timestamp of creation

#### Task Creation Response (AI-Enhanced)
- 🧠 Smart task analysis indicator
- 🎯 Detected priority level with color coding
- 📅 Parsed due date (if found)
- 🏷️ Auto-assigned labels
- ⏱️ Estimated effort level
- 📂 Task category
- 🔗 Direct link to the rich Trello card
- 📊 All standard information plus AI insights

#### Real-Time Trello Notifications
- 🆕 **New Card Created**: Shows card details, list, and creator
- ✏️ **Card Updated**: Highlights changes (name, description, due date)
- 💬 **New Comment**: Displays comment preview and author
- 👥 **Member Changes**: Shows member additions/removals
- ✅ **Checklist Updates**: Shows completed/uncompleted items
- 🔔 **General Activity**: Other Trello board events

#### Command Responses
- 📊 **Status Command**: Board overview, list statistics, total cards
- 📋 **List Command**: Recent cards with IDs, creation dates, due dates
- ✏️ **Update Command**: Confirmation of card updates with new values
- ❓ **Help Command**: Complete command reference with examples

### Webhook Integration

To enable real-time notifications:

1. **Configure Public URL**: Set `WEBHOOK_URL` in your `.env` to your bot's public address
2. **Set Webhook Secret**: Add `WEBHOOK_SECRET` for security (recommended)
3. **Auto-Registration**: Bot automatically registers webhooks on startup
4. **Manual Registration**: Use Trello API or bot will prompt if needed

#### Webhook Security
- HMAC-SHA1 signature verification
- Request validation and error handling
- Automatic retry mechanism from Trello
- Health check endpoint at `/health`

### Error Handling
The bot handles various error scenarios:
- **Trello API Issues**: Invalid credentials, rate limits, network problems
- **Webhook Failures**: Signature verification, malformed payloads, network issues
- **Gemini AI Failures**: Graceful fallback to basic card creation
- **Discord Permissions**: Missing bot permissions with helpful error messages
- **Malformed Commands**: Clear usage instructions with command help
- **Network Issues**: Retry logic and user feedback

## 🔧 API Reference

### Trello API Endpoints Used
- `POST /1/cards` - Create new cards with rich parameters
- `PUT /1/cards/{id}` - Update existing cards (name, description, due date)
- `GET /1/boards/{id}` - Fetch board information and statistics
- `GET /1/boards/{id}/lists` - Get all lists with card counts
- `GET /1/boards/{id}/cards` - Retrieve recent cards with filters
- `GET /1/boards/{id}/labels` - Fetch existing labels  
- `POST /1/labels` - Create new labels automatically
- `POST /1/webhooks` - Register webhooks for real-time notifications
- `GET /1/tokens/{token}/webhooks` - List existing webhooks
- `DELETE /1/webhooks/{id}` - Remove webhooks
- Authentication via API key and token

### Google Gemini AI Integration
- `generateContent()` - Natural language task analysis
- Structured JSON output parsing
- Error handling and fallback support

### Discord.js Events Handled
- `ready` - Bot startup with AI and webhook status indication
- `messageCreate` - Command parsing and processing with AI analysis
- `error` - Error handling and logging

### Express.js Webhook Endpoints
- `POST /webhook/trello` - Receive and process Trello webhooks
- `GET /health` - Health check endpoint for monitoring
- HMAC-SHA1 signature verification middleware
- JSON payload parsing and validation

## 🔍 Troubleshooting

### Common Issues

#### Bot doesn't respond to commands
1. **Check bot permissions**: Ensure bot has "Read Messages" and "Send Messages" permissions
2. **Verify bot token**: Check `DISCORD_BOT_TOKEN` in `.env`
3. **Check command prefix**: Default is `!t`, verify `COMMAND_PREFIX` setting

#### "Failed to create Trello card" error
1. **Verify Trello credentials**: Check `TRELLO_API_KEY` and `TRELLO_API_TOKEN`
2. **Validate board/list IDs**: Ensure `TRELLO_BOARD_ID` and `TRELLO_LIST_ID` are correct
3. **Check Trello permissions**: Ensure your token has write access to the board

#### "Smart features not working" (AI-related issues)
1. **Verify Gemini API key**: Check `GEMINI_API_KEY` in `.env`
2. **Check API quota**: Ensure you haven't exceeded Gemini API limits
3. **Review model settings**: Verify `GEMINI_MODEL` is set correctly (default: `gemini-2.0-flash-001`)
4. **Check logs**: Look for Gemini-specific error messages
5. **Note**: Bot still works without AI, just creates basic cards

#### "Webhook notifications not working" (Real-time sync issues)
1. **Verify webhook URL**: Check `WEBHOOK_URL` is publicly accessible
2. **Check webhook secret**: Ensure `WEBHOOK_SECRET` matches if configured
3. **Validate port access**: Confirm port 3000 is accessible from internet
4. **Review webhook logs**: Look for webhook registration and processing errors
5. **Test health endpoint**: Visit `http://your-url:3000/health` to verify server
6. **Check Trello webhook**: Verify webhook exists in your Trello token's webhooks

#### Docker container won't start
1. **Check environment file**: Ensure `.env` exists and has all required variables
2. **Review logs**: Run `docker-compose logs` to see error details
3. **Verify port availability**: Ensure no port conflicts

### Debug Mode
Enable verbose logging by adding to your `.env`:
```bash
NODE_ENV=development
```

### Health Checks
Monitor bot health:
```bash
# Check container health
docker-compose ps

# Test webhook server health
curl http://localhost:3000/health

# View detailed logs
docker-compose logs -f discord-trello-bot

# Monitor resource usage
docker stats discord-trello-bot

# Check webhook registration
# Look for "Webhook registered" or "Webhook already exists" in logs
```

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style
- Use ES6+ features
- Follow Node.js best practices
- Include error handling
- Add comments for complex logic
- Update documentation for new features

### Suggested Enhancements
- **Multiple boards support**: Allow different Discord channels to map to different Trello boards
- **Advanced AI features**: Custom field population, member assignment, task breakdown
- **Enhanced webhook features**: Card archiving, list movement notifications, custom field updates
- **Slash commands**: Modern Discord slash command support
- **Advanced card management**: Delete, move cards between lists, bulk operations
- **Team collaboration**: Multi-user board mappings and permissions
- **Batch operations**: Create multiple cards from a single message
- **Analytics**: AI-powered project insights and reporting
- **Custom AI prompts**: User-defined task analysis templates
- **Voice commands**: Speech-to-text task creation
- **Persistent storage**: Database for user preferences and channel mappings
- **Role-based permissions**: Restrict bot commands based on Discord roles

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review the logs: `docker-compose logs -f`
3. Verify your configuration against [Configuration](#configuration)
4. Create an issue in the repository with:
   - Error messages
   - Your configuration (without sensitive data)
   - Steps to reproduce

## 📊 Monitoring and Maintenance

### Log Management
Logs are automatically rotated and stored in:
- **Local**: Console output
- **Docker**: JSON log driver with rotation
- **Production**: `/opt/discord-trello-bot/logs/`

### Updates
Keep your bot updated:
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up -d --build
```

### Backup
Important files to backup:
- `.env` file (your credentials)
- Any custom configurations
- Log files (if needed for debugging)

---

**Made with ❤️ for Discord and Trello integration**