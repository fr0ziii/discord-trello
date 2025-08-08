# Discord-Trello Bot

An intelligent Discord bot that creates rich Trello cards from Discord messages using AI-powered task analysis. Type `!t <task description>` in Discord and automatically create detailed tasks in your Trello board with smart categorization, priority detection, and due date parsing.

## 🚀 Features

- **🧠 AI-Powered Task Analysis**: Uses Google Gemini AI to intelligently parse natural language task descriptions
- **📝 Smart Card Creation**: Automatically extracts priority, due dates, labels, and effort estimates from conversational input
- **🎯 Priority Detection**: High priority tasks automatically go to the top of your Trello list
- **📅 Natural Language Dates**: Parse due dates from phrases like "by Friday", "next week", or "in 2 days"
- **🏷️ Automatic Labeling**: Smart label creation and assignment based on task content (bug, feature, urgent, etc.)
- **📊 Rich Context**: Creates detailed card descriptions with effort estimates and categorization
- **🔄 Graceful Fallback**: Works with or without AI - falls back to basic card creation if needed
- **🎨 Enhanced Discord UI**: Color-coded priority indicators and comprehensive task analysis display
- **🐳 Docker Support**: Containerized application for easy deployment
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
| `GEMINI_MODEL` | ❌ | Gemini model name (default: `gemini-pro`) | `gemini-pro` |

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
├── index.js              # Main bot application with AI integration
├── package.json          # Dependencies and scripts
├── .env.example          # Environment template with Gemini config
├── .env                  # Your environment variables (not committed)
├── .gitignore            # Git ignore rules
├── Dockerfile            # Docker container configuration
├── docker-compose.yml    # Docker Compose setup
├── deploy.sh             # VPS deployment script
├── CLAUDE.md             # Project development documentation
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
- **Auto-restart**: Container restarts automatically on failure
- **Resource limits**: Memory and CPU limits configured
- **Health checks**: Built-in container health monitoring
- **Log management**: Automatic log rotation
- **Volume mounting**: Persistent logs directory

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

### Basic Commands
Once the bot is running in your Discord server:

```
!t Buy groceries
!t Review pull request #123 by Friday
!t Schedule team meeting for next week - high priority
!t Fix urgent bug in authentication system
!t Research new framework, should take 2-3 days
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

#### Basic Response (without AI)
- ✅ Success confirmation with task name
- 🔗 Direct link to the created Trello card
- 👤 User who created the task
- 📅 Timestamp of creation

#### AI-Enhanced Response (with Gemini)
- 🧠 Smart task analysis indicator
- 🎯 Detected priority level with color coding
- 📅 Parsed due date (if found)
- 🏷️ Auto-assigned labels
- ⏱️ Estimated effort level
- 📂 Task category
- 🔗 Direct link to the rich Trello card
- 📊 All standard information plus AI insights

### Error Handling
The bot handles various error scenarios:
- **Trello API Issues**: Invalid credentials, rate limits, network problems
- **Gemini AI Failures**: Graceful fallback to basic card creation
- **Discord Permissions**: Missing bot permissions with helpful error messages
- **Malformed Commands**: Clear usage instructions
- **Network Issues**: Retry logic and user feedback

## 🔧 API Reference

### Trello API Endpoints Used
- `POST /1/cards` - Create new cards with rich parameters
- `GET /1/boards/{id}/labels` - Fetch existing labels  
- `POST /1/labels` - Create new labels automatically
- Authentication via API key and token

### Google Gemini AI Integration
- `generateContent()` - Natural language task analysis
- Structured JSON output parsing
- Error handling and fallback support

### Discord.js Events Handled
- `ready` - Bot startup with AI status indication
- `messageCreate` - Message processing with AI analysis
- `error` - Error handling

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
3. **Review model settings**: Verify `GEMINI_MODEL` is set correctly
4. **Check logs**: Look for Gemini-specific error messages
5. **Note**: Bot still works without AI, just creates basic cards

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

# View detailed logs
docker-compose logs -f discord-trello-bot

# Monitor resource usage
docker stats discord-trello-bot
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
- **Webhook integration**: Real-time updates from Trello to Discord  
- **Slash commands**: Modern Discord slash command support
- **Card management**: Update, delete, or move cards from Discord
- **Team collaboration**: Multi-user board mappings and permissions
- **Batch operations**: Create multiple cards from a single message
- **Analytics**: AI-powered project insights and reporting
- **Custom AI prompts**: User-defined task analysis templates
- **Voice commands**: Speech-to-text task creation

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