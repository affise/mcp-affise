# Affise MCP Server

[![Docker Build](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)
[![Node.js](https://img.shields.io/badge/node.js-24.2-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.8-blue.svg)](https://www.typescriptlang.org)

A Model Context Protocol (MCP) server that provides access to Affise affiliate marketing platform data and analytics. This server enables AI assistants like Claude to interact with Affise APIs for comprehensive affiliate marketing analysis and monitoring using natural language queries.

## Features

### 🔧 Core Tools
- **`affise_status`** - Check Affise API availability and health
- **`affise_stats`** - Get statistics with natural language queries (e.g., "Show me revenue by country last month")
- **`affise_stats_raw`** - Get raw statistics with specific API parameters
- **`affise_search_offers`** - Search offers with natural language (e.g., "Find gaming offers for US mobile traffic")
- **`affise_offer_categories`** - Get offer categories with filtering and sorting options
- **`affise_smart_offer_search`** 🧠 - Intelligent offer search with automatic category resolution
- **`affise_smart_stats_search`** 🧠 - Smart stats search with category auto-correction

### 📊 Smart Prompts
- **`analyze_offers`** - Expert analysis of offer performance with recommendations
- **`analyze_trafficback`** - Comprehensive trafficback analysis and optimization insights
- **`analyze_stats`** - Performance analytics with KPI tracking and comparisons
- **`workflow_analysis`** - Complete workflow automation for offer discovery and analysis
- **`auto_analysis`** - Enhanced multi-data-type analysis with intelligent insights

### 🚀 Advanced Capabilities
- **Natural language processing** - Ask questions in plain English
- **Multi-dimensional data slicing** - Analyze by country, device, OS, browser, time periods
- **Smart date handling** - Support for relative periods (last7days, thismonth, etc.)
- **Direct API integration** - Efficient API usage with simplified architecture
- **Comprehensive error handling** - Robust error reporting and debugging

## Installation

### Prerequisites
- Node.js 24.2+ (Alpine Linux compatible)
- Docker (recommended)
- Affise API credentials

### Method 1: Docker

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd affise-mcp-server
   ```

2. **Build the Docker image:**
   ```bash
   docker build -t affise-mcp-server:latest .
   ```

3. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   AFFISE_BASE_URL=https://api-demo.affise.com
   AFFISE_API_KEY=your_affise_api_key_here
   NODE_ENV=production
   ```

### Method 2: Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start the MCP server:**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AFFISE_BASE_URL` | ✅ | Base URL for your Affise instance | `https://api-demo.affise.com` |
| `AFFISE_API_KEY` | ✅ | Your Affise API key | - |
| `NODE_ENV` | ❌ | Environment mode | `development` |

### Getting Affise API Credentials

1. Log into your Affise dashboard
2. Navigate to **Settings** → **API**
3. Generate a new API key
4. Copy the API key and your instance URL

## Usage with Claude Desktop

### Method 1: Desktop Extension (Recommended) 🚀

The easiest way to install is using the Desktop Extension (.dxt) - a one-click installation package.

#### Step 1: Install DXT Toolchain
```bash
npm install -g @anthropic-ai/dxt
```

#### Step 2: Build and Package
```bash
# Build TypeScript and create .dxt package
npm run build-dxt

# Or step by step:
npm run build          # Compile TypeScript
npm run package-dxt     # Create .dxt file
npm run validate-dxt    # Validate package
```

#### Step 3: Install in Claude Desktop
1. **Build the extension**: Run `npm run build-dxt` in your project directory
2. **Find the .dxt file**: Look for `affise-mcp-extension-1.0.0.dxt` in your project root
3. **Install in Claude Desktop**:
   - Open Claude Desktop Settings
   - Go to Extensions section
   - Drag your `.dxt` file into the window
   - Click "Install"
4. **Configure credentials**:
   - Find "Affise Analytics Extension" in your extensions
   - Set your Affise Base URL (e.g., `https://api-yourcompany.affise.com`)
   - Set your Affise API Key
5. **Test**: Try using the `affise_status` tool in Claude Desktop

**Benefits of Desktop Extension:**
- ✅ **One-click install** - No JSON editing required
- ✅ **Secure credentials** - API keys stored in OS keychain  
- ✅ **Automatic updates** - Extensions update automatically
- ✅ **No crashes** - Graceful handling of missing configuration
- ✅ **Better UX** - Configuration through Claude Desktop UI

### Method 2: Manual MCP Server Configuration

#### Docker Installation

Add this configuration to your Claude Desktop settings file:

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "affise-mcp-server": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "AFFISE_API_KEY",
        "-e",
        "AFFISE_BASE_URL",
        "-e",
        "NODE_ENV=production",
        "affise-mcp-server:latest"
      ],
      "env": {
        "AFFISE_API_KEY": "your_affise_api_key_here",
        "AFFISE_BASE_URL": "https://your-affise-instance.com"
      }
    }
  }
}
```

#### Local Installation

If you prefer running locally without Docker:

```json
{
  "mcpServers": {
    "affise-mcp-server": {
      "command": "node",
      "args": ["/path/to/affise-mcp-server/build/index.js"],
      "env": {
        "AFFISE_API_KEY": "your_affise_api_key_here",
        "AFFISE_BASE_URL": "https://your-affise-instance.com"
      }
    }
  }
}
```

## Example Interactions

### Basic API Health Check
```
Human: Check if Affise API is available

Claude: I'll check the Affise API status for you.
> Uses affise_status tool
✅ API is healthy and responding in 234ms
```

### Performance Analytics
```
Human: Show me conversion performance by country for the last 7 days

Claude: I'll analyze your conversion performance by country.
> Uses affise_stats tool with natural language parsing
📊 Top performing countries:
- US: 2,847 conversions (4.2% CR)
- UK: 1,238 conversions (3.8% CR)
- DE: 892 conversions (3.1% CR)
```

### Offer Analysis
```
Human: Find high-performing offers in the gaming category

Claude: I'll search for gaming offers using natural language processing.
> Uses affise_search_offers tool
🎮 Top Gaming Offers:
1. Mobile Casino Pro - $45 EPC, 85% approval rate
2. Fantasy Sports App - $32 EPC, 92% approval rate
```

### Intelligent Category Resolution
```
Human: Find gaming offers for US mobile traffic

Claude: I'll search for gaming offers with smart category resolution.
> Uses affise_smart_offer_search
🧠 **Smart Resolution Applied**
- Searched for: "gaming"
- Auto-corrected to: "Games & Entertainment" (92% confidence)
- Found 23 active offers for US mobile traffic

🎯 Top Results:
1. Mobile Casino Pro - $45 EPC, 4.2% CR
2. Puzzle Games Hub - $32 EPC, 5.1% CR
3. Sports Betting App - $38 EPC, 3.8% CR

💡 Note: Automatically corrected "gaming" to the actual category name
```

### Offer Category Management
```
Human: What offer categories are available in our Affise account?

Claude: I'll get all the available offer categories for you.
> Uses affise_offer_categories tool
📂 Available Categories (18 total):
- Gaming (ID: 1) - 45 active offers
- Finance (ID: 2) - 23 active offers  
- Dating (ID: 3) - 31 active offers
- Health & Beauty (ID: 4) - 12 active offers
- E-commerce (ID: 5) - 67 active offers
```

### Intelligent Workflow
```
Human: Give me a complete analysis of our best offers with revenue trends

Claude: I'll perform a comprehensive analysis of your top offers.
> Uses auto_analysis prompt with combined data types
📈 Complete Performance Report:
- Revenue Analysis: $847K total (↑23% vs last month)
- Top Performers: 12 offers exceeding targets
- Optimization Opportunities: 5 offers need attention
- Traffic Quality: 94% legitimate traffic
```

## 📚 Detailed Examples & Guides

For comprehensive examples and real-world usage scenarios, check out these detailed guides:

### 🚀 **[Smart Features Guide](guides/SMART_FEATURES_GUIDE.md)**
Your key differentiator vs competitors - AI-powered capabilities:
- Natural language understanding with typo correction
- Intelligent category resolution and auto-correction
- Context-aware search with geographic intelligence
- Smart pagination for large datasets
- Predictive insights and recommendations

### 🔬 **[Advanced Analysis Guide](guides/ADVANCED_ANALYSIS_GUIDE.md)**
Unlock the full power of enterprise-grade analysis:
- Strategic business intelligence workflows
- Multi-dimensional performance analysis
- Predictive modeling and forecasting
- Crisis management and recovery protocols
- Complete workflow orchestration

### 👥 **Role-Specific User Journey Guides**

#### 👨‍💼 **[Affiliate Manager Guide](guides/AFFILIATE_MANAGER_GUIDE.md)**
Daily operations and partner optimization:
- Morning routine workflows (15 min)
- Partner performance management
- Issue resolution protocols
- Weekly reporting templates
- Crisis management procedures

#### 📊 **[Advertiser Manager Guide](guides/ADVERTISER_MANAGER_GUIDE.md)**
Campaign management and revenue optimization:
- Advertiser health monitoring
- Campaign performance optimization
- Cross-advertiser collaboration strategies
- Revenue forecasting and analysis
- Quality assurance workflows

#### 🏢 **[General Manager Guide](guides/GENERAL_MANAGER_GUIDE.md)**
Strategic leadership and business intelligence:
- Executive morning briefing (10 min)
- Strategic decision frameworks
- Competitive analysis and positioning
- Financial performance and forecasting
- M&A evaluation and strategic planning

### 🔧 **[Tool Selection Guide](guides/TOOL_SELECTION_GUIDE.md)**
Master the art of choosing the right tool for your analysis:
- Tool comparison matrix
- Use case scenarios
- Performance optimization tips
- Best practices for different user roles
- Advanced workflow combinations

### 🤖 **[AI Search Examples](guides/AI_SEARCH_EXAMPLES.md)**
Harness the power of AI-driven search capabilities:
- Natural language query processing
- Smart category resolution
- Intelligent typo correction
- Context-aware search suggestions
- Advanced filtering techniques

### 🔍 **[Enhanced Search Offers Guide](guides/ENHANCED_SEARCH_OFFERS_GUIDE.md)**
Advanced offer discovery and search optimization:
- Complex search query construction
- Multi-criteria filtering strategies
- Performance-based offer ranking
- Geographic and vertical targeting
- Real-time availability checking

### 📂 **[Offer Categories Examples](guides/OFFER_CATEGORIES_EXAMPLES.md)**
Master offer categorization and vertical analysis:
- Complete category taxonomy
- Vertical performance comparison
- Category-specific optimization tips
- Cross-category opportunity identification
- Industry benchmarking data

### 🔍 **[Trafficback Analysis Examples](guides/TRAFFICBACK_EXAMPLES.md)**
Learn how to analyze traffic quality and identify redirection issues:
- Geographic trafficback patterns
- Device-specific analysis
- Partner quality assessment
- Real-time issue detection
- All 7 preset configurations

### 📊 **[Performance Stats Examples](guides/STATS_EXAMPLES.md)**
Master performance analytics and conversion optimization:
- Revenue and earnings analysis
- Conversion rate breakdowns
- Geographic performance comparison
- Partner and affiliate metrics
- Time-based trend analysis

### 🎯 **[Offer Search Examples](guides/OFFERS_EXAMPLES.md)**
Discover and research affiliate offers effectively:
- Category-based searches (gaming, finance, dating)
- Geographic targeting and compliance
- Performance-based filtering
- Competitive research techniques
- Natural language search queries

### 🚀 **[Client Prompts Guide](guides/CLIENT_PROMPTS_GUIDE.md)**
Ready-to-use prompts for common affiliate marketing tasks:
- Daily operations and monitoring
- Revenue and performance analysis
- Geographic and device targeting
- Optimization and troubleshooting

### 🗺️ **Quick Guide Reference**

| Guide | Purpose | Target User |
|-------|---------|-------------|
| [Smart Features Guide](guides/SMART_FEATURES_GUIDE.md) | AI-powered capabilities overview | All users |
| [Advanced Analysis Guide](guides/ADVANCED_ANALYSIS_GUIDE.md) | Enterprise-grade analysis workflows | Analysts, Managers |
| [Tool Selection Guide](guides/TOOL_SELECTION_GUIDE.md) | Choose the right tool for your task | All users |
| [Affiliate Manager Guide](guides/AFFILIATE_MANAGER_GUIDE.md) | Daily operations for affiliate managers | Affiliate Managers |
| [Advertiser Manager Guide](guides/ADVERTISER_MANAGER_GUIDE.md) | Campaign management workflows | Advertiser Managers |
| [General Manager Guide](guides/GENERAL_MANAGER_GUIDE.md) | Strategic leadership insights | Executives |
| [AI Search Examples](guides/AI_SEARCH_EXAMPLES.md) | Natural language search techniques | All users |
| [Enhanced Search Offers Guide](guides/ENHANCED_SEARCH_OFFERS_GUIDE.md) | Advanced offer discovery | Researchers |
| [Offer Categories Examples](guides/OFFER_CATEGORIES_EXAMPLES.md) | Category analysis and optimization | Analysts |
| [Trafficback Analysis Examples](guides/TRAFFICBACK_EXAMPLES.md) | Traffic quality assessment | Traffic Managers |
| [Performance Stats Examples](guides/STATS_EXAMPLES.md) | Analytics and KPI tracking | Analysts |
| [Offer Search Examples](guides/OFFERS_EXAMPLES.md) | Basic offer discovery | All users |
| [Client Prompts Guide](guides/CLIENT_PROMPTS_GUIDE.md) | Ready-to-use prompt templates | All users |

> 💡 **Pro Tip**: These guides show you exactly how to talk to Claude naturally - no need to learn complex JSON syntax!

## Available Tools

### Core API Tools

#### `affise_status`
Check Affise API health and connectivity.
```json
{
  "name": "affise_status",
  "arguments": {}
}
```

#### `affise_stats`
Get statistics using natural language queries.
```json
{
  "name": "affise_stats",
  "arguments": {
    "query": "Show me revenue by country for the last 30 days"
  }
}
```

#### `affise_stats_raw`
Get raw statistics with specific API parameters.
```json
{
  "name": "affise_stats_raw",
  "arguments": {
    "slice": ["country", "day"],
    "date_from": "2024-01-01",
    "date_to": "2024-01-07",
    "fields": ["clicks", "conversions", "income"],
    "country": ["US", "UK", "DE"]
  }
}
```

#### `affise_search_offers`
Search offers using natural language queries.
```json
{
  "name": "affise_search_offers",
  "arguments": {
    "query": "Find gaming offers for US mobile traffic"
  }
}
```

### Analysis Prompts

#### `analyze_offers`
Expert offer analysis with recommendations.
```json
{
  "name": "analyze_offers",
  "arguments": {
    "offers_data": "...",
    "analysis_type": "performance",
    "format": "actionable"
  }
}
```

#### `auto_analysis`
Comprehensive multi-data analysis.
```json
{
  "name": "auto_analysis",
  "arguments": {
    "data_type": "combined",
    "period": "last30days",
    "analysis_type": "comprehensive",
    "format": "executive"
  }
}
```

## Development

### Project Structure
```
affise-mcp-server/
├── src/
│   ├── handlers/           # MCP request handlers
│   ├── tools/             # API integration tools
│   ├── types/             # Unified type definitions
│   ├── prompts/           # Analysis prompt templates
│   ├── services/          # Core services (cache, error handling, etc.)
│   ├── shared/            # Shared utilities
│   └── index.ts           # Main MCP server entry point
├── build/                 # Compiled JavaScript
├── logs/                  # Application logs
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Development environment
└── package.json           # Node.js dependencies
```

### Available Scripts

```bash
# Development
npm run dev                # Start with hot reload

# Building
npm run build             # Compile TypeScript
npm run clean             # Clean build directory
npm run rebuild           # Clean and build

# Production
npm start                 # Start MCP server
```

### Docker Commands

```bash
# Build image
docker build -t affise-mcp-server:latest .

# Run with docker-compose
docker-compose up -d

# Test with Docker
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | docker run --rm -i \
  -e AFFISE_API_KEY=your_key \
  -e AFFISE_BASE_URL=https://api-demo.affise.com \
  -e NODE_ENV=production \
  affise-mcp-server:latest

# Check logs
docker-compose logs -f affise-mcp-server
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: 401 Unauthorized
```
**Solution:** Verify your `AFFISE_API_KEY` is correct and has proper permissions.

#### 2. Connection Timeouts
```
Error: Request timeout
```
**Solution:** Check your `AFFISE_BASE_URL` and network connectivity.

#### 3. Docker Permission Issues
```
Error: Permission denied
```
**Solution:** Ensure Docker has proper permissions and the user is in the docker group.

#### 4. Claude Desktop Not Detecting Server
**Solutions:**
- Restart Claude Desktop after configuration changes
- Verify JSON syntax in `claude_desktop_config.json`
- Check that Docker image is built and tagged correctly
- Ensure environment variables are set properly

### Debug Mode

Enable debug logging by setting:
```bash
export NODE_ENV=development
```

This will provide detailed logging including:
- API request/response details
- MCP message tracing
- Performance metrics
- Error stack traces

### MCP Protocol Testing

Test MCP server:
```bash
# Test MCP protocol with initialize
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | npm start
```

## Architecture

### Simplified Design

The server uses a **simplified architecture** focused on direct API integration:

- **Direct Tool Handlers** - No complex abstraction layers
- **Natural Language Processing** - Simple pattern matching for user queries
- **Unified Types** - Single source of truth for response types
- **Minimal Dependencies** - Clean, maintainable codebase

### Benefits

- ✅ **Easy to understand** - Direct API calls without complexity
- ✅ **Fast performance** - Minimal processing layers
- ✅ **Easy to maintain** - Simple codebase structure
- ✅ **Reliable** - Fewer points of failure
- ✅ **Extensible** - Easy to add new tools and features

## Security

### Best Practices
- ✅ **API keys in environment variables** (never hardcoded)
- ✅ **Runtime API key encryption** with AES-256-GCM
- ✅ **Comprehensive input validation** with injection protection
- ✅ **Non-root Docker user** for container security
- ✅ **Alpine Linux base** for minimal attack surface
- ✅ **No sensitive data logging** in production mode
- ✅ **HTTPS-only API communication**
- ✅ **Automated dependency security auditing**

### Data Privacy
- No API keys or sensitive data are stored locally
- All communication uses secure HTTPS connections
- Logs contain no personally identifiable information
- Containers are ephemeral and stateless

### Dependency Security
- ✅ **Automated security audits** on every build
- ✅ **Regular dependency updates** for security patches
- ✅ **Vulnerability scanning** with npm audit
- 🔧 **Security scripts**: `npm run security:check`, `npm run security:fix`

## License

This project is licensed under the ISC License.

## Support

### Getting Help
- 📖 **Documentation:** Check this README and inline code comments
- 🐛 **Bug Reports:** Open an issue with detailed reproduction steps
- 💡 **Feature Requests:** Open an issue with use case description
- 📧 **Direct Support:** Contact the maintainers

### Useful Resources
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Affise API Documentation](https://affise.com/docs/api/)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/desktop)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Made with ❤️ for the affiliate marketing community**

*This MCP server bridges the gap between AI assistants and affiliate marketing data, enabling intelligent analysis and optimization of your Affise campaigns using natural language.*
