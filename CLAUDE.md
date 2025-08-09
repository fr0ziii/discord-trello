# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord-Trello Bot is a Node.js Discord bot that provides full bidirectional integration between Discord and Trello with real-time synchronization. Users can create Trello cards from Discord messages, receive live notifications of Trello updates, and manage boards with advanced commands.

**Key Technologies:**
- Node.js with discord.js v14
- Express.js webhook server for real-time sync
- Trello REST API integration via axios
- Google Gemini AI for intelligent task analysis
- HMAC-SHA1 webhook signature verification
- Docker containerization with webhook port mapping
- Environment-based configuration

**Core Architecture:**
- Single-file application (`index.js`) with event-driven Discord bot and Express.js webhook server
- Bidirectional Discord ↔ Trello integration with real-time webhooks
- Multi-command system with help, status, list, and update capabilities
- Async Trello API integration with comprehensive error handling
- Gemini AI integration for intelligent task parsing and metadata extraction
- Automatic webhook registration and management
- HMAC-SHA1 signature verification for webhook security
- Automatic label management and card enrichment
- Environment variable validation and graceful shutdown handling
- Docker deployment with webhook server, health checks and resource limits

## Commands

**Development:**
```bash
npm start          # Start the bot
npm run dev        # Start in development mode (same as start)
```

**Docker Operations:**
```bash
npm run docker:build   # Build Docker image
npm run docker:run     # Run with Docker Compose
npm run docker:stop    # Stop Docker containers  
npm run docker:logs    # View Docker logs

# Direct docker-compose commands:
docker-compose up -d          # Start in background
docker-compose logs -f        # Follow logs
docker-compose restart        # Restart service
docker-compose down           # Stop and remove containers
```

**Production Deployment:**
```bash
# VPS deployment script
sudo ./deploy.sh deploy      # Full deployment
sudo ./deploy.sh update      # Update application
sudo ./deploy.sh logs        # View logs
sudo ./deploy.sh restart     # Restart application
sudo ./deploy.sh status      # Check status
```

## Environment Configuration

Required environment variables in `.env`:
- `DISCORD_BOT_TOKEN` - Discord bot token from Developer Portal
- `TRELLO_API_KEY` - Trello API key from trello.com/app-key
- `TRELLO_API_TOKEN` - Trello API token (OAuth)
- `TRELLO_BOARD_ID` - Target Trello board ID
- `TRELLO_LIST_ID` - Target Trello list ID for new cards

Optional:
- `COMMAND_PREFIX` - Bot command prefix (default: `!t`)
- `GEMINI_API_KEY` - Google AI Studio API key for intelligent task analysis
- `GEMINI_MODEL` - Gemini model to use (default: `gemini-2.0-flash-001`)
- `WEBHOOK_PORT` - Port for webhook server (default: `3000`)
- `WEBHOOK_SECRET` - Secret for webhook signature verification (recommended)
- `WEBHOOK_URL` - Public URL for Trello webhooks (enables real-time notifications)

The bot validates all required environment variables on startup and exits with descriptive errors if any are missing. Gemini AI features are optional - the bot gracefully falls back to basic card creation if not configured.

## Key Implementation Details

**Bot Functionality:**
- **Command System**: Multi-command interface supporting `help`, `status`, `list`, `update`, and default task creation
- **Task Creation**: Uses Gemini AI to analyze natural language task descriptions and extract metadata
- **Real-time Webhooks**: Express.js server receives and processes Trello webhook notifications
- **Discord Notifications**: Sends rich embeds to Discord for all Trello board activities
- **Board Management**: View board statistics, recent cards, and update existing cards
- Creates rich Trello cards with:
  - Intelligent titles and detailed descriptions
  - Priority-based positioning (High priority cards go to top)
  - Automatic due date parsing from natural language ("by Friday", "next week")
  - Smart label creation and assignment based on task content
  - Effort estimation and categorization
- Provides enhanced embed responses showing analysis results and metadata
- Graceful fallback to basic card creation when Gemini AI is unavailable
- Uses reaction feedback (⏳ during processing, ✅/❌ for results)

**Error Handling:**
- Comprehensive Trello API error handling with user-friendly messages
- Webhook security validation and signature verification
- Express server error handling and health monitoring
- Gemini AI error handling with graceful fallback to basic functionality
- Discord client error handling and graceful shutdown
- Process signal handling (SIGINT, SIGTERM) for clean shutdown of both Discord client and webhook server
- Unhandled promise rejection logging

**Docker Configuration:**
- Multi-stage build with Node.js 22 Alpine
- Non-root user execution for security
- Webhook server port mapping (3000:3000)
- Resource limits optimized for webhook server (256M memory, 0.3 CPU)
- Health checks via webhook server endpoint (/health)
- Log rotation and management
- Auto-restart policies

## Phase Implementation Status

**Phase 1 (Completed)**: Enhanced `!t` command with AI-powered analysis
- ✅ Smart card creation with Gemini AI integration
- ✅ Priority detection and automatic positioning
- ✅ Natural language due date parsing
- ✅ Automatic label creation and assignment
- ✅ Rich Discord embed responses
- ✅ Graceful fallback when AI unavailable

**Phase 2 (Completed)**: Real-time webhook integration
- ✅ Express.js webhook server infrastructure
- ✅ HMAC-SHA1 signature verification for security
- ✅ Webhook registration and management functions
- ✅ Discord notification system for Trello events
- ✅ Enhanced bot commands (help, status, list, update)
- ✅ Updated Docker configuration for webhook support
- ✅ Environment configuration for webhook features

**Phase 3 (Future)**: Advanced automation and analytics
- 🔄 Intelligent board organization based on content analysis
- 🔄 Predictive analytics for deadline forecasting
- 🔄 Cross-platform integration (GitHub, calendar events)
- 🔄 Natural language interface for complex operations

**Current API Utilization**: ~40% of Trello API capabilities (up from ~5% initially)

## Development Notes

The application is designed as a comprehensive Discord-Trello integration platform with bidirectional synchronization. When modifying:

**Discord Integration:**
- Command parsing and routing in `messageCreate` event handler
- Multiple command handlers: `handleCreateCommand()`, `handleStatusCommand()`, `handleListCommand()`, `handleUpdateCommand()`, `handleHelpCommand()`
- Rich embeds follow Discord's embed structure format with priority-based color coding
- Bot activity status shows current command prefix and AI/webhook status

**Webhook Integration:**
- Express.js server with `/webhook/trello` endpoint for receiving Trello events
- HMAC-SHA1 signature verification via `verifyTrelloWebhook()` function
- Discord notification creation via `createTrelloEventEmbed()` function
- Webhook management functions: `createTrelloWebhook()`, `deleteTrelloWebhook()`, `listTrelloWebhooks()`
- Health check endpoint at `/health` for monitoring

**Trello API Integration:**
- Comprehensive API usage: card creation, updates, board status, recent cards
- Enhanced functions: `getBoardStatus()`, `updateTrelloCard()`, `getRecentCards()`
- Gemini AI analysis via `analyzeTaskWithGemini()` with structured JSON output
- Automatic label management with `getOrCreateTrelloLabels()` function
- Environment validation occurs before Discord login and webhook server startup

**Startup Sequence:**
1. Environment validation
2. Discord client login
3. Express webhook server startup on configured port
4. Automatic webhook registration if URL configured
5. Health monitoring and graceful shutdown handling

No testing framework is currently configured. The application relies on runtime validation, comprehensive error handling, and graceful fallbacks when AI services or webhook features are unavailable.

## Command Reference

**Available Commands:**
- `!t <task_description>` - Create a new Trello card (default behavior, backward compatible)
- `!t help` - Display comprehensive command help with examples
- `!t status` - Show board overview, list statistics, and total card counts
- `!t list [limit]` - Display recent cards (default: 5, max: 20) with IDs and metadata
- `!t update <card-id> <field>=<value>` - Update existing cards (supports name, desc, due fields)

**Webhook Events Supported:**
- `createCard` - New card creation notifications
- `updateCard` - Card modification alerts (name, description, due date changes)
- `commentCard` - New comment notifications
- `addMemberToCard` / `removeMemberFromCard` - Member assignment changes
- `updateCheckItemStateOnCard` - Checklist item completion status
- Generic fallback for all other Trello activities

## Environment Setup Notes

**Webhook Configuration:**
- Set `WEBHOOK_URL` to your bot's public URL for real-time notifications
- Configure `WEBHOOK_SECRET` for security (strongly recommended for production)
- Port 3000 must be accessible from the internet for Trello to reach webhook endpoint
- Bot automatically registers webhooks on startup if URL is configured
- Manual webhook cleanup may be needed when changing configurations