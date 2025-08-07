# Discord-Trello Bot

A simple Discord bot that creates Trello cards from Discord messages. Type `!t <task description>` in Discord and automatically create tasks in your Trello board.

## 🚀 Features

- **Simple Command Interface**: Use `!t <task description>` to create Trello cards
- **Discord Integration**: Built with discord.js for robust Discord API integration
- **Trello API Integration**: Uses Trello REST API to create cards automatically
- **Docker Support**: Containerized application for easy deployment
- **VPS Ready**: Includes deployment scripts for Hetzner, DigitalOcean, Lightsail, etc.
- **Environment Configuration**: Secure API key management with environment variables
- **Rich Embeds**: Beautiful Discord responses with task confirmation and Trello links
- **Error Handling**: Comprehensive error handling and user feedback
- **Health Monitoring**: Built-in health checks for container monitoring

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
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TRELLO_API_KEY=your_trello_api_key_here
TRELLO_API_TOKEN=your_trello_api_token_here
TRELLO_BOARD_ID=your_trello_board_id_here
TRELLO_LIST_ID=your_trello_list_id_here
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

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token from Developer Portal |
| `TRELLO_API_KEY` | ✅ | Trello API key |
| `TRELLO_API_TOKEN` | ✅ | Trello API token |
| `TRELLO_BOARD_ID` | ✅ | ID of your Trello board | 
| `TRELLO_LIST_ID` | ✅ | ID of the Trello list to create cards in |
| `COMMAND_PREFIX` | ❌ | Command prefix (default: `!t`) | `!task` or `!todo` |

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
├── index.js              # Main bot application
├── package.json           # Dependencies and scripts
├── .env.example          # Environment template
├── .env                  # Your environment variables (not committed)
├── .gitignore            # Git ignore rules
├── Dockerfile            # Docker container configuration
├── docker-compose.yml    # Docker Compose setup
├── deploy.sh             # VPS deployment script
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
!t Review pull request #123
!t Schedule team meeting for next week
!t Fix bug in authentication system
```

### Bot Responses
The bot provides rich embed responses with:
- ✅ Success confirmation with task name
- 🔗 Direct link to the created Trello card
- 👤 User who created the task
- 📅 Timestamp of creation

### Error Handling
The bot handles various error scenarios:
- Invalid Trello API credentials
- Network connectivity issues
- Trello API rate limits
- Malformed commands

## 🔧 API Reference

### Trello API Endpoints Used
- `POST /1/cards` - Create new cards
- Authentication via API key and token

### Discord.js Events Handled
- `ready` - Bot startup
- `messageCreate` - Message processing
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
- **Card templates**: Predefined card templates with custom fields
- **User management**: Per-user board mappings
- **Webhook integration**: Real-time updates from Trello to Discord
- **Slash commands**: Modern Discord slash command support
- **Card management**: Update, delete, or move cards from Discord
- **Due dates**: Add due date support to created cards
- **Labels and members**: Automatically assign labels or team members
- **Batch operations**: Create multiple cards at once
- **Analytics**: Usage statistics and reporting

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