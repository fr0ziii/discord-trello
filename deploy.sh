#!/bin/bash

# Discord-Trello Bot Deployment Script
# Compatible with Ubuntu/Debian VPS (Hetzner, DigitalOcean, Lightsail, etc.)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="discord-trello-bot"
PROJECT_DIR="/opt/$PROJECT_NAME"
SERVICE_NAME="discord-trello-bot"

echo -e "${BLUE}🚀 Discord-Trello Bot Deployment Script${NC}"
echo "======================================"

# Function to print status messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run this script as root (use sudo)"
        exit 1
    fi
}

# Update system packages
update_system() {
    print_status "Updating system packages..."
    apt update && apt upgrade -y
    print_success "System packages updated"
}

# Install Docker and Docker Compose
install_docker() {
    print_status "Installing Docker and Docker Compose..."
    
    # Install prerequisites
    apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Set up the stable repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    print_success "Docker installed and started"
}

# Create project directory and user
setup_project() {
    print_status "Setting up project directory..."
    
    # Create project directory
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    # Create logs directory
    mkdir -p logs
    
    print_success "Project directory created at $PROJECT_DIR"
}

# Clone or update repository
setup_repository() {
    print_status "Setting up repository..."
    
    if [ ! -d ".git" ]; then
        print_status "Cloning repository..."
        # If you have a git repository, uncomment and modify the next line:
        # git clone https://github.com/yourusername/discord-trello-bot.git .
        
        # For now, we'll create the files directly
        print_warning "No git repository configured. Please manually copy your project files to $PROJECT_DIR"
        print_warning "Or update this script with your repository URL"
    else
        print_status "Updating repository..."
        git pull origin main
    fi
    
    print_success "Repository setup complete"
}

# Setup environment variables
setup_environment() {
    print_status "Setting up environment variables..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_warning "Copied .env.example to .env"
            print_warning "Please edit .env file with your actual API keys and tokens:"
            print_warning "  - DISCORD_BOT_TOKEN"
            print_warning "  - TRELLO_API_KEY"
            print_warning "  - TRELLO_API_TOKEN"
            print_warning "  - TRELLO_BOARD_ID"
            print_warning "  - TRELLO_LIST_ID"
            print_warning ""
            print_warning "Edit the file with: nano .env"
            read -p "Press Enter after you've updated the .env file..."
        else
            print_error ".env.example file not found. Please create .env file manually."
            exit 1
        fi
    else
        print_success "Environment file already exists"
    fi
}

# Build and start the application
deploy_application() {
    print_status "Building and deploying application..."
    
    # Stop existing containers
    docker-compose down 2>/dev/null || true
    
    # Build and start the application
    docker-compose up -d --build
    
    print_success "Application deployed and started"
}

# Setup systemd service for auto-restart
setup_systemd_service() {
    print_status "Setting up systemd service..."
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Discord Trello Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}.service
    systemctl start ${SERVICE_NAME}.service
    
    print_success "Systemd service created and enabled"
}

# Setup firewall (optional)
setup_firewall() {
    print_status "Configuring firewall..."
    
    # Install ufw if not present
    apt install -y ufw
    
    # Configure basic firewall rules
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 22/tcp
    
    print_success "Firewall configured"
}

# Show deployment status
show_status() {
    print_status "Checking deployment status..."
    echo ""
    
    # Show running containers
    echo -e "${BLUE}Running containers:${NC}"
    docker-compose ps
    echo ""
    
    # Show logs
    echo -e "${BLUE}Recent logs:${NC}"
    docker-compose logs --tail=20
    echo ""
    
    print_success "Deployment completed successfully!"
    echo ""
    echo -e "${GREEN}🎉 Your Discord-Trello Bot is now running!${NC}"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  View logs:           docker-compose logs -f"
    echo "  Restart bot:         docker-compose restart"
    echo "  Stop bot:            docker-compose down"
    echo "  Update and restart:  git pull && docker-compose up -d --build"
    echo "  Check status:        docker-compose ps"
    echo ""
}

# Main deployment function
main() {
    echo -e "${BLUE}Starting deployment process...${NC}"
    echo ""
    
    check_root
    update_system
    install_docker
    setup_project
    setup_repository
    setup_environment
    deploy_application
    setup_systemd_service
    setup_firewall
    show_status
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "update")
        cd "$PROJECT_DIR"
        print_status "Updating application..."
        git pull origin main 2>/dev/null || print_warning "No git repository found"
        docker-compose up -d --build
        print_success "Application updated"
        ;;
    "logs")
        cd "$PROJECT_DIR"
        docker-compose logs -f
        ;;
    "stop")
        cd "$PROJECT_DIR"
        docker-compose down
        print_success "Application stopped"
        ;;
    "restart")
        cd "$PROJECT_DIR"
        docker-compose restart
        print_success "Application restarted"
        ;;
    "status")
        cd "$PROJECT_DIR"
        docker-compose ps
        ;;
    *)
        echo "Usage: $0 {deploy|update|logs|stop|restart|status}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  update   - Update and restart the application"
        echo "  logs     - Show application logs"
        echo "  stop     - Stop the application"
        echo "  restart  - Restart the application"
        echo "  status   - Show application status"
        exit 1
        ;;
esac