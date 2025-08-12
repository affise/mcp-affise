# 🧠 Natural Language Offer Search - Examples & Usage

The **Natural Language Offer Search** (`affise_search_offers`) tool provides intelligent offer discovery using plain English queries. This system understands intent and automatically converts your questions into optimized API calls.

## 🌟 What Makes It Different

Instead of manually specifying search parameters, you can use natural language that the system intelligently parses:

- **🎯 Extracts targeting criteria** from natural language
- **🔍 Maps keywords to categories** automatically
- **🌍 Recognizes geographic intent** and expands targeting
- **📱 Understands device/platform mentions**
- **🔄 Optimizes search parameters** for better results
- **⚡ Provides fast, relevant results**

## 🎯 Natural Language Query Examples

### Example 1: Gaming Offers for Mobile
```
Find gaming offers for US mobile traffic
```

**What the system extracts:**
- **Categories**: Gaming, Casino
- **Countries**: US
- **Platforms**: Mobile devices
- **Status**: Active offers only (default)

### Example 2: High-Paying Finance Offers
```
Show me high-paying finance offers for tier 1 countries
```

**What the system extracts:**
- **Categories**: Finance, Trading
- **Countries**: US, GB, CA, AU, DE, FR (Tier 1)
- **Performance**: High payout focus
- **Optimization**: Sorted by earnings potential

### Example 3: Recent Dating Offers
```
Find recently added dating offers for European markets
```

**What the system extracts:**
- **Categories**: Dating, Social
- **Countries**: European country codes
- **Time Filter**: Recently added offers
- **Geographic**: EU region targeting

## 🚀 Advanced Query Features

### Smart Category Recognition
The system understands various ways to express categories:

```bash
# Gaming & Entertainment
"casino offers" → gaming, casino
"slot machine apps" → gaming, casino  
"mobile games" → gaming, mobile
"poker sites" → gaming, casino

# Finance & Trading
"crypto trading" → crypto, trading, finance
"loan applications" → loans, finance
"investment apps" → trading, finance
"forex platforms" → trading, finance

# E-commerce & Shopping
"online shopping" → shopping, ecommerce
"fashion stores" → fashion, shopping
"electronics deals" → electronics, tech

# Health & Wellness
"supplement offers" → health, wellness
"fitness apps" → health, fitness
"diet programs" → health, nutrition

# Dating & Social
"dating apps" → dating, social
"relationship sites" → dating, social
"social networks" → social, communication
```

### Geographic Intelligence
```bash
# Tier-based targeting
"tier 1 countries" → US, UK, CA, AU, DE, FR
"tier 2 markets" → BR, MX, IN, TH, PH
"English-speaking markets" → US, UK, CA, AU, NZ

# Regional targeting
"European markets" → UK, DE, FR, IT, ES, NL
"Asian markets" → JP, KR, SG, MY, TH
"Latin America" → BR, MX, AR, CL, CO

# Specific countries
"United States" → US
"United Kingdom" → GB
"Germany" → DE
```

### Device & Platform Recognition
```bash
# Mobile targeting
"mobile traffic" → mobile devices
"smartphone users" → mobile
"iOS users" → iOS, mobile
"Android traffic" → Android, mobile

# Desktop targeting
"desktop users" → desktop
"PC traffic" → desktop
"computer users" → desktop

# Cross-platform
"all devices" → mobile, desktop, tablet
"mobile and desktop" → mobile, desktop
```

## 📊 Sample Response Structure

Here's what you get back from natural language offer search:

```json
{
  "status": "ok",
  "message": "Found 23 offers",
  "offers": [
    {
      "id": 12345,
      "title": "Mobile Casino Pro",
      "category": "Gaming",
      "countries": ["US", "CA"],
      "payout": "$45",
      "description": "High-converting mobile casino offers...",
      "status": "active"
    }
  ],
  "total_found": 23,
  "timestamp": "2024-06-25T18:30:00.000Z"
}
```

## 🎯 Flexible Category Intelligence

The system uses **intelligent pattern matching** that adapts to different naming conventions:

### 🧠 How It Works

The AI analyzes your natural language for **semantic patterns** rather than exact matches:

- **"gaming"** matches: casino, gambling, games, slots, poker, betting
- **"finance"** matches: financial, bank, loan, credit, trading, crypto, insurance
- **"shopping"** matches: retail, ecommerce, e-commerce, marketplace, store
- **"health"** matches: medical, wellness, fitness, diet, supplement, nutrition
- **"mobile"** matches: mobile app, app install, smartphone, cellular

### 🔄 Universal Category Patterns

#### 🎮 Gaming & Entertainment
```bash
# Flexible gaming detection:
"casino offers" → gaming, casino
"slot games" → gaming, casino  
"mobile gaming" → gaming, mobile
"poker platforms" → gaming, casino
"betting sites" → gaming, betting
```

#### 💰 Finance & Trading
```bash
# Broad financial intent:
"crypto trading" → crypto, trading, finance
"loan apps" → loans, finance
"investment platforms" → trading, finance
"forex brokers" → trading, finance
"insurance quotes" → insurance, finance
```

#### 🛒 E-commerce & Shopping
```bash
# Commerce variations:
"online shopping" → shopping, ecommerce
"fashion brands" → fashion, shopping
"electronics stores" → electronics, tech
"marketplace deals" → shopping, marketplace
```

#### 📱 Mobile & Technology
```bash
# Tech and mobile patterns:
"app downloads" → mobile, app
"software tools" → software, tech
"mobile apps" → mobile, app
"tech products" → technology, software
```

#### 💕 Dating & Social
```bash
# Social connections:
"dating apps" → dating, social
"relationship platforms" → dating, social
"social networks" → social, communication
"chat apps" → communication, social
```

## 🖥️ Device & Platform Support

The system recognizes all major device types and platforms:

### Device Types
- **mobile** - Smartphones, mobile phones
- **tablet** - Tablets, iPads, Android tablets
- **desktop** - Desktop computers, PCs, Macs
- **all** - Cross-platform offers

### Operating Systems
- **iOS** - iPhones, iPad devices
- **Android** - Android devices
- **Windows** - Windows PCs
- **macOS** - Mac computers
- **cross-platform** - Works on multiple OS

### Natural Language Device Examples
```bash
# Mobile targeting
"iPhone users" → device: mobile, os: iOS
"Android phones" → device: mobile, os: Android
"mobile apps" → device: mobile
"smartphone offers" → device: mobile

# Desktop targeting
"PC users" → device: desktop, os: Windows
"Mac users" → device: desktop, os: macOS
"desktop software" → device: desktop
"computer programs" → device: desktop

# Cross-platform
"mobile and desktop" → device: mobile, desktop
"all devices" → device: mobile, desktop, tablet
"cross-platform apps" → device: multiple
```

## 💡 Smart Query Examples

### Vertical-Specific Searches
```bash
# Health & Wellness
"Find supplement offers for US women"
→ Categories: health, wellness, supplement
→ Geographic: US targeting
→ Demographic: women-focused

# Finance & Crypto
"Show me crypto trading offers for tier 1"
→ Categories: crypto, trading, finance
→ Geographic: tier 1 countries (US, UK, CA, AU, DE, FR)

# Dating & Social
"Dating offers for mobile users in Europe"
→ Categories: dating, social
→ Platform: mobile devices
→ Geographic: European markets

# Gaming & Entertainment
"Find casino offers for desktop users"
→ Categories: gaming, casino
→ Platform: desktop computers
```

### Performance-Focused Searches
```bash
# High Performers
"Top converting offers this month"
→ Performance: high conversion rates
→ Time: current month focus

# Profitability
"Most profitable offers with high payouts"
→ Performance: high profitability, high payouts

# Quality Traffic
"Offers with good approval rates"
→ Quality: high approval rates

# New Opportunities
"Recently launched offers from top advertisers"
→ Time: recently launched
→ Quality: premium advertisers
```

### Geographic Targeting
```bash
# Regional Expansion
"Expand my US campaign to similar markets"
→ Auto-suggests: US, CA, AU, UK (similar markets)

# Local Compliance
"Offers that work in Germany"
→ Geographic: DE, compliance considerations

# Global Opportunities
"International offers for worldwide traffic"
→ Geographic: global, multi-country targeting

# Tier-Based Targeting
"High-value offers for tier 1 countries"
→ Geographic: US, UK, CA, AU, DE, FR (tier 1)
```

## 🔧 Usage Examples

### Basic Searches
```bash
"Find gaming offers"
"Show me finance offers"
"What dating offers are available?"
"Find health and wellness offers"
```

### Geographic Searches
```bash
"Offers for US traffic"
"European market offers"
"Worldwide offers"
"Tier 1 country offers"
```

### Device-Specific Searches
```bash
"Mobile-friendly offers"
"Desktop offers"
"iOS app offers"
"Android game offers"
```

### Performance Searches
```bash
"High-converting offers"
"Best paying offers"
"Top performing offers"
"Quality offers with good approval rates"
```

## 🎉 Migration from Manual Parameters

### Before (Manual Parameters)
```json
{
  "q": "gaming",
  "countries": ["US"],
  "categories": ["Gaming"],
  "status": ["active"],
  "limit": 20
}
```

### After (Natural Language)
```
Find active gaming offers for US traffic
```

**Benefits of Natural Language:**
- ✅ Easy to use - no JSON syntax needed
- ✅ Intelligent parsing - system understands intent
- ✅ Automatic optimization - best parameters chosen
- ✅ Flexible queries - many ways to express the same thing
- ✅ Error prevention - system validates and corrects

## 🚀 Pro Tips

1. **Be Specific**: "Gaming offers for US mobile users" works better than just "games"

2. **Mention Performance**: Include "high-converting", "profitable", "top-performing" for better results

3. **Specify Platforms**: Mention "mobile", "desktop", "iOS", "Android" for device targeting

4. **Include Geography**: Add country/region for automatic geo-targeting

5. **Use Intent Words**: "Find", "Show me", "Search for" help the system understand your goal

6. **Mention Time**: "Recent", "new", "latest" for time-based filtering

7. **Quality Indicators**: "High-quality", "premium", "top-tier" for quality focus

## 📈 Advanced Use Cases

### Competitive Research
```bash
"What gaming offers are popular in UK?"
→ Research competitors in specific verticals

"Show me new finance offers this month"
→ Discover fresh opportunities
```

### Campaign Planning
```bash
"Find iOS gaming offers with good payouts"
→ Platform-specific campaign planning

"Dating offers with creative materials available"
→ Campaign launch optimization
```

### Market Expansion
```bash
"Expand successful US offers to similar markets"
→ Scale winning campaigns geographically

"Find international versions of top offers"
→ Global expansion planning
```

---

The Natural Language Offer Search transforms how you discover affiliate offers, making complex searches as simple as asking a question in plain English! 🎯✨

**Ready to try it?** Just describe what you're looking for in natural language, and let the system handle the technical details.
