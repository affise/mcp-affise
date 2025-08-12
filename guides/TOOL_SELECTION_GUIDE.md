# 🤖 Tool Selection Guide for Claude

## 🎯 **Current Available Tools**

The Affise MCP Server provides these tools for affiliate marketing analysis:

### ✅ **Core Tools**
1. **`affise_status`** - Check API health and connectivity
2. **`affise_stats`** - Get statistics with natural language queries  
3. **`affise_stats_raw`** - Get raw statistics with specific API parameters
4. **`affise_search_offers`** - Search offers with natural language queries

### 📊 **Analysis Prompts**
5. **`analyze_offers`** - Expert offer analysis with recommendations
6. **`analyze_trafficback`** - Comprehensive trafficback analysis
7. **`analyze_stats`** - Performance analytics with insights
8. **`workflow_analysis`** - Complete workflow automation
9. **`auto_analysis`** - Enhanced multi-data-type analysis

## 🧠 **When to Use Natural Language vs Raw Parameters**

### ✅ **Use `affise_stats` (Natural Language) for:**
- **ANY user question about statistics**
- Questions like:
  - "Show me today's performance summary"
  - "What are my top performing offers?"
  - "Revenue by country last month"
  - "Compare mobile vs desktop performance"
  - "Best affiliates by conversion rate"
  - "Gaming offers performance trends"

### ⚠️ **Use `affise_stats_raw` ONLY for:**
- **Technical API calls with exact parameters**
- When you have specific field names like `['income', 'cr', 'epc']`
- When you have exact slice parameters like `['country', 'day']`
- When building complex filtered queries programmatically
- When you need precise control over API parameters

## 🔍 **When to Use Natural Language vs Raw Parameters for Offers**

### ✅ **Use `affise_search_offers` (Natural Language) for:**
- **ANY user question about finding offers**
- Questions like:
  - "Find gaming offers for US traffic"
  - "Show me high-paying offers"
  - "What offers work in Europe?"
  - "Find mobile-friendly dating offers"
  - "Recent offers from top advertisers"

### ⚠️ **Direct API calls are handled internally** - users don't need to specify raw parameters

## 📋 **Tool Priority Order**

When users ask questions, prioritize tools in this order:

1. **`affise_stats`** - For any statistics or performance questions
2. **`affise_search_offers`** - For any offer discovery questions
3. **Analysis prompts** - For detailed analysis and insights
4. **`affise_stats_raw`** - Only when exact API parameters are needed
5. **`affise_status`** - For API health checks

## 🎯 **Usage Examples**

### ✅ **Correct Usage - Natural Language First**

**User**: "Show me revenue by country for last month"
**Claude should use**: `affise_stats`
```json
{
  "query": "Show me revenue by country for last month"
}
```

**User**: "Find gaming offers for mobile users"
**Claude should use**: `affise_search_offers`
```json
{
  "query": "Find gaming offers for mobile users"
}
```

**User**: "What are my top 5 offers by conversion rate?"
**Claude should use**: `affise_stats`
```json
{
  "query": "What are my top 5 offers by conversion rate?"
}
```

### ✅ **When to Use Raw Parameters**

**User**: "Get stats with slice=['country','day'] and fields=['income','cr'] for March 1-15"
**Claude should use**: `affise_stats_raw`
```json
{
  "slice": ["country", "day"],
  "fields": ["income", "cr"],
  "date_from": "2024-03-01",
  "date_to": "2024-03-15"
}
```

### ❌ **Incorrect Usage** 

**User**: "Show me today's performance"
**Claude should NOT use**: `affise_stats_raw` with manual parameters
**Claude should use**: `affise_stats` with natural language instead

## 🧠 **Why Natural Language is Better**

1. **User-Friendly** - Users can ask questions naturally
2. **Intelligent Parsing** - System handles complexity automatically  
3. **Error Prevention** - Proper field validation prevents API errors
4. **Comprehensive** - Provides analysis beyond raw data
5. **Scalable** - Works for simple and complex queries
6. **Consistent** - Same interaction pattern for all queries

## 🚀 **Key Benefits of This Approach**

- **Simplified User Experience** - No need to learn API parameters
- **Intelligent Query Processing** - System understands intent
- **Robust Error Handling** - Better error messages and debugging
- **Consistent Interface** - All tools work with natural language
- **Extensible Design** - Easy to add new capabilities

## 💡 **Best Practices**

### ✅ **Do This:**
- Always try natural language tools first
- Use descriptive, specific queries
- Include time periods in questions
- Mention specific countries, devices, or categories
- Ask follow-up questions for clarification

### ❌ **Avoid This:**
- Don't manually construct API parameters unless absolutely necessary
- Don't use raw tools for simple questions
- Don't assume users know field names or slice options
- Don't overcomplicate simple requests

## 🎯 **Quick Reference**

| User Intent | Recommended Tool | Example |
|-------------|------------------|---------|
| Performance data | `affise_stats` | "Show me today's revenue" |
| Find offers | `affise_search_offers` | "Find gaming offers" |
| Detailed analysis | Analysis prompts | "Analyze my top offers" |
| API health | `affise_status` | "Is the API working?" |
| Technical queries | `affise_stats_raw` | Exact API parameters needed |

## 🚀 **Summary**

The **natural language approach** should be the **default choice** for all user interactions. The system is designed to understand human language and translate it into appropriate API calls automatically.

Raw parameter tools exist for technical integrations and edge cases, but 95% of user interactions should use the natural language interface for the best experience.
