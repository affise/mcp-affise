# Affise Offer Categories Tool

## Overview

The `affise_offer_categories` tool provides access to Affise offer categories through the `/3.0/offer/categories` API endpoint. This tool allows you to retrieve, filter, and analyze offer categories available in your Affise instance.

## Tool Configuration

**Tool Name:** `affise_offer_categories`

**Description:** Get offer categories from Affise with filtering and sorting options. Use this to retrieve available offer categories for filtering offers or understanding the category structure.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `ids` | Array[string] | No | - | Search by specific category IDs |
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 99999 | Maximum number of categories to return (max: 99999) |
| `orderType` | string | No | "asc" | Sort direction ("asc" or "desc") |
| `order` | string | No | "id" | Sort field ("id" or "title") |

## Usage Examples

### Basic Usage

```json
{
  "tool": "affise_offer_categories",
  "arguments": {}
}
```

**Natural Language:** "Show me all offer categories"

**Response:**
```json
{
  "status": "ok",
  "message": "Found 25 offer categories",
  "data": {
    "categories": [
      {
        "id": "1",
        "title": "Gaming",
        "status": "active",
        "created_at": "2023-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      },
      {
        "id": "2", 
        "title": "Finance",
        "status": "active",
        "created_at": "2023-01-16T11:00:00Z",
        "updated_at": "2024-01-16T11:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 99999,
      "total": 25,
      "pages": 1
    }
  },
  "timestamp": "2024-06-30T12:00:00Z"
}
```

### Sorted by Title

```json
{
  "tool": "affise_offer_categories",
  "arguments": {
    "order": "title",
    "orderType": "asc"
  }
}
```

**Natural Language:** "Show me offer categories sorted by title"

### Get Specific Categories

```json
{
  "tool": "affise_offer_categories", 
  "arguments": {
    "ids": ["1", "5", "10"]
  }
}
```

**Natural Language:** "Get categories with IDs 1, 5, and 10"

### Paginated Results

```json
{
  "tool": "affise_offer_categories",
  "arguments": {
    "page": 1,
    "limit": 10,
    "order": "title",
    "orderType": "desc"
  }
}
```

**Natural Language:** "Show me the first 10 categories sorted by title in descending order"

## Real-World Use Cases

### 1. Category Discovery for Offer Filtering

**Scenario:** You want to understand what categories are available before searching for offers.

**Claude Conversation:**
```
Human: What offer categories are available in Affise?

Claude: I'll get all the available offer categories for you.

[Uses affise_offer_categories tool]

📂 Available Offer Categories (25 total):

**Popular Categories:**
- Gaming (ID: 1)
- Finance (ID: 2) 
- Dating (ID: 3)
- Health & Beauty (ID: 4)
- E-commerce (ID: 5)

**Specialized Categories:**
- Crypto/Blockchain (ID: 15)
- Travel (ID: 8)
- Education (ID: 12)
- Software/Apps (ID: 18)

You can use these category IDs when searching for offers. For example, to find gaming offers, you'd use category ID "1".
```

### 2. Category Validation for Offer Management

**Scenario:** Before creating or updating offers, verify that category IDs exist.

**Claude Conversation:**
```
Human: I want to check if category IDs 1, 15, and 25 exist before I assign them to new offers.

Claude: I'll check those specific category IDs for you.

[Uses affise_offer_categories with ids: ["1", "15", "25"]]

✅ Category Validation Results:

**Found Categories:**
- ID 1: Gaming ✓
- ID 15: Crypto/Blockchain ✓  
- ID 25: Utilities ✓

All three category IDs exist and are available for use with your offers.
```

### 3. Category Analysis for Business Intelligence

**Scenario:** Analyze the category structure to understand business focus areas.

**Claude Conversation:**
```
Human: Give me an analysis of our offer categories to understand our business focus

Claude: I'll analyze all your offer categories to provide business insights.

[Uses affise_offer_categories]

📊 **Category Analysis Report**

**Total Categories:** 25 active categories

**Category Distribution:**
- Performance Marketing: 8 categories (32%)
- E-commerce Related: 6 categories (24%) 
- Financial Services: 4 categories (16%)
- Entertainment: 4 categories (16%)
- Technology: 3 categories (12%)

**Recent Activity:**
- Most recently updated: "Crypto/Blockchain" (updated last week)
- Oldest category: "Dating" (created 2+ years ago)

**Strategic Insights:**
- Heavy focus on performance marketing and e-commerce
- Growing crypto/blockchain presence 
- Mature dating and gaming categories
- Opportunity to expand in emerging tech categories
```

### 4. Integration with Offer Search

**Scenario:** Use categories to find specific types of offers.

**Claude Conversation:**
```
Human: I want to find all gaming and finance offers for the US market

Claude: I'll first get the category information, then search for offers in those categories.

[Uses affise_offer_categories with ids: ["1", "2"]]
[Then uses affise_search_offers with categories: ["1", "2"], countries: ["US"]]

🎯 **Gaming & Finance Offers for US Market**

**Gaming Category (ID: 1):**
- 23 active offers
- Top performers: Casino Pro, Mobile Games Hub
- Average EPC: $45

**Finance Category (ID: 2):**  
- 18 active offers
- Top performers: Credit Score App, Investment Platform
- Average EPC: $67

**Total:** 41 offers available for US traffic in gaming and finance categories.
```

## Tool Integration Patterns

### 1. Pre-filtering for Offer Searches

```javascript
// First get categories to understand available options
const categories = await affise_offer_categories({});

// Then use specific category IDs in offer searches  
const offers = await affise_search_offers({
  categories: ["1", "2"], // Gaming and Finance
  countries: ["US"]
});
```

### 2. Category-based Performance Analysis

```javascript
// Get all categories
const categoriesResult = await affise_offer_categories({});

// For each category, get performance stats
for (const category of categoriesResult.data.categories) {
  const stats = await affise_stats_ai({
    naturalQuery: `Performance stats for ${category.title} category offers`
  });
}
```

### 3. Data Validation Workflows

```javascript
// Validate category IDs before creating offers
const categoryIds = ["1", "15", "99"];
const validation = await affise_offer_categories({ ids: categoryIds });

const validIds = validation.data.categories.map(c => c.id);
const invalidIds = categoryIds.filter(id => !validIds.includes(id));

if (invalidIds.length > 0) {
  console.log(`Invalid category IDs: ${invalidIds.join(', ')}`);
}
```

## Error Handling

The tool provides comprehensive error handling for common scenarios:

### Configuration Errors
```json
{
  "status": "error",
  "message": "baseUrl or apiKey not provided",
  "timestamp": "2024-06-30T12:00:00Z"
}
```

### Network Errors
```json
{
  "status": "error", 
  "message": "Error getting offer categories: Request timeout exceeded",
  "timestamp": "2024-06-30T12:00:00Z"
}
```

### API Errors
```json
{
  "status": "error",
  "message": "API returned error: 401 Unauthorized", 
  "timestamp": "2024-06-30T12:00:00Z"
}
```

## Performance Considerations

- **Default Limit:** 99999 (gets all categories in one request)
- **Caching:** Results are cached to improve performance
- **Pagination:** Available for large category sets, though typically not needed
- **Timeout:** 30-second timeout for reliability

## Helper Functions

The tool includes several utility functions:

### `analyzeOfferCategories(categories)`
Provides statistical analysis of category data:
- Total count
- Status distribution  
- Most recent updates
- Title listing

### `searchCategoriesByTitle(categories, searchTerm)`
Case-insensitive search through category titles.

### `getCategoriesByIds(categories, ids)`
Filter categories by specific ID list.

### `validateOfferCategoriesParams(params)`
Validate parameters before API calls.

## Best Practices

1. **Cache Results:** Categories don't change frequently, so cache the results
2. **Use Specific IDs:** When you know specific category IDs, use the `ids` parameter for faster responses
3. **Sort by Title:** For user-facing applications, sort by title for better UX
4. **Validate Before Use:** Always validate category IDs exist before using them in other operations
5. **Error Handling:** Implement proper error handling for network and API issues

## Related Tools

- `affise_search_offers`: Use category IDs from this tool to filter offers
- `affise_stats_ai`: Analyze performance by category
- `affise_status`: Check API connectivity before using this tool

This tool is essential for understanding and working with the Affise category structure, enabling more effective offer management and analysis workflows.
