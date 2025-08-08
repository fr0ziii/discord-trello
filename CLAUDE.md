# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord-Trello Bot is a Node.js Discord bot that creates Trello cards from Discord messages. Users type `!t <task description>` in Discord to automatically create tasks in their Trello board.

**Key Technologies:**
- Node.js with discord.js v14
- Trello REST API integration via axios
- Google Gemini AI for intelligent task analysis
- Docker containerization
- Environment-based configuration

**Core Architecture:**
- Single-file application (`index.js`) with event-driven Discord bot
- Async Trello API integration with error handling
- Gemini AI integration for intelligent task parsing and metadata extraction
- Automatic label management and card enrichment
- Environment variable validation and graceful shutdown handling
- Docker deployment with health checks and resource limits

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
- `GEMINI_MODEL` - Gemini model to use (default: `gemini-pro`)

The bot validates all required environment variables on startup and exits with descriptive errors if any are missing. Gemini AI features are optional - the bot gracefully falls back to basic card creation if not configured.

## Key Implementation Details

**Bot Functionality:**
- Listens for messages starting with command prefix (default `!t`)
- Uses Gemini AI to analyze natural language task descriptions and extract metadata
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
- Gemini AI error handling with graceful fallback to basic functionality
- Discord client error handling and graceful shutdown
- Process signal handling (SIGINT, SIGTERM) for clean shutdown
- Unhandled promise rejection logging

**Docker Configuration:**
- Multi-stage build with Node.js 22 Alpine
- Non-root user execution for security
- Resource limits (512M memory, 0.5 CPU)
- Health checks and log rotation
- Auto-restart policies

## Development Notes

The application is designed as a single-purpose bot with intelligent task processing capabilities. When modifying:

- All Discord interactions happen in the `messageCreate` event handler
- Gemini AI analysis occurs via `analyzeTaskWithGemini()` function with structured JSON output
- Trello API calls use axios with proper error handling and support rich card parameters
- Automatic label management with `getOrCreateTrelloLabels()` function
- Environment validation occurs before Discord login
- Rich embeds follow Discord's embed structure format with priority-based color coding
- Bot activity status shows current command prefix and Gemini AI status

No testing framework is currently configured. The application relies on runtime validation, comprehensive error handling, and graceful fallbacks when AI services are unavailable.