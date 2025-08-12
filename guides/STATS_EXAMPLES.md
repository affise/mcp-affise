# Affise Custom Stats Examples

Simple examples showing how to ask Claude to analyze your performance statistics.

## Basic Queries

**"Show me today's performance stats"**
```
Get today's performance statistics
```

**"What were our stats yesterday?"**
```
Analyze yesterday's performance data
```

**"Show me last 7 days performance"**
```
Get performance stats for the last 7 days
```

**"I need this month's performance report"**
```
Generate performance statistics for this month
```

## Geographic Analysis

**"Which countries are performing best?"**
```
Show me performance statistics by country for the last 30 days
```

**"Compare US vs UK performance"**
```
Analyze performance stats for US and UK markets this week
```

**"How is Europe performing?"**
```
Show performance data for Germany, France, UK, and Italy this month
```

## Device & Platform Analysis

**"Is mobile traffic converting better?"**
```
Compare mobile vs desktop performance for the last 7 days
```

**"Check iOS vs Android performance"**
```
Analyze conversion rates for iOS and Android devices this week
```

**"Show me mobile performance breakdown"**
```
Get mobile device performance statistics for the last 30 days
```

## Offer Performance

**"Which offers are making the most money?"**
```
Show revenue statistics by offer for the last 30 days
```

**"Check performance for offer 12345"**
```
Analyze detailed stats for offer 12345 in the last 7 days
```

**"Compare my top 3 offers"**
```
Compare performance for offers 12345, 67890, and 54321 this month
```

## Partner & Affiliate Analysis

**"How are my partners performing?"**
```
Show performance statistics by partner for the last 30 days
```

**"Check partner123's conversion rates"**
```
Analyze partner123 performance stats this month
```

**"Which affiliates are bringing quality traffic?"**
```
Show affiliate performance with conversion rates and earnings
```

## Time-Based Analysis

**"Show me daily trends this week"**
```
Get daily performance breakdown for the last 7 days
```

**"Compare this month vs last month"**
```
Performance comparison: May vs June 2024
```

**"What's our hourly performance today?"**
```
Show hourly performance statistics for today
```

## Revenue & Financial Analysis

**"Show me today's earnings"**
```
Get revenue and earnings data for today
```

**"Which countries generate most revenue?"**
```
Revenue analysis by country for the last 30 days
```

**"Check our profit margins by offer"**
```
Show earnings vs payouts by offer this month
```

## Conversion Analysis

**"What are our conversion rates?"**
```
Show conversion rates by country for the last 7 days
```

**"Which traffic sources convert best?"**
```
Analyze conversion rates by traffic source this month
```

**"Check mobile conversion performance"**
```
Mobile conversion rate analysis for the last 30 days
```

## Quick Presets

### Monthly Performance by Offer
**"Show me how each offer performed this month"**
- Uses: `monthlyByOffer` preset
- Shows: Monthly breakdown by individual offers

### Country Performance Analysis
**"Which countries are my best performers?"**
- Uses: `performanceByCountry` preset
- Shows: Geographic performance breakdown

### Funnel Analysis
**"Show me our conversion funnel"**
- Uses: `funnelAnalysis` preset
- Shows: Views → Clicks → Conversions flow

### Traffic Source Analysis
**"Where is our best traffic coming from?"**
- Uses: `trafficSourceAnalysis` preset
- Shows: Partner and source quality metrics

## Advanced Queries

**"Show me detailed performance with 100 results"**
```
Get comprehensive performance data, show top 100 results
```

**"Focus on confirmed conversions only"**
```
Analyze performance for confirmed conversions this week
```

**"Check performance in US timezone"**
```
Show stats for last week in America/New_York timezone
```

**"Show USD revenue only"**
```
Revenue analysis in USD currency for this month
```

## Specific Metrics

**"What's our click-through rate?"**
```
Show clicks vs views ratio for the last 7 days
```

**"Check our earnings per click"**
```
Calculate EPC (earnings per click) by offer this month
```

**"What's our approval rate?"**
```
Show conversion approval rates for the last 30 days
```

**"Check cost per acquisition"**
```
Calculate CPA for different traffic sources this week
```

## Troubleshooting Scenarios

**"My conversions dropped suddenly, what happened?"**
```
Analyze daily conversion trends for the last 7 days with country breakdown
```

**"Why is my EPC so low?"**
```
Show earnings per click analysis with device and geo breakdown
```

**"Check if our traffic quality improved"**
```
Compare conversion rates: this week vs last week
```

**"Need data for weekly team meeting"**
```
Generate comprehensive weekly performance report
```

## Combining Filters

**"Show US mobile performance for my top offer"**
```
Analyze offer 12345 performance for US mobile traffic this week
```

**"European desktop conversion rates"**
```
Check desktop conversion rates for UK, Germany, France last 30 days
```

**"Which partners send the best mobile traffic?"**
```
Partner performance analysis for mobile traffic, last 7 days
```

## Data Slicing Options

### Time-Based Slicing
- **Daily**: `Show daily performance trends`
- **Hourly**: `Hourly breakdown for today`
- **Monthly**: `Monthly performance analysis`

### Geographic Slicing
- **Country**: `Performance by country`
- **City**: `City-level performance data`

### Technology Slicing
- **Device**: `Mobile vs desktop performance`
- **OS**: `iOS vs Android vs Windows performance`
- **Browser**: `Chrome vs Safari vs Firefox performance`

### Business Slicing
- **Offer**: `Performance by individual offers`
- **Partner**: `Partner performance breakdown`
- **Landing Page**: `Which landing pages convert best`

## Quick Reference

### Time Periods You Can Use:
- `today`
- `yesterday`
- `last7days`
- `last30days`
- `thismonth`
- `lastmonth`
- Custom dates: `June 1 to June 15, 2024`

### Metrics You Can Request:
- **Traffic**: views, clicks, impressions
- **Conversions**: total, confirmed, pending, declined
- **Financial**: revenue, earnings, payouts, profit
- **Ratios**: conversion rate, click rate, EPC, ECPM

### Filters You Can Add:
- **Countries**: US, UK, DE, FR, CA, AU
- **Devices**: mobile, desktop, tablet
- **OS**: iOS, Android, Windows, macOS
- **Browsers**: Chrome, Safari, Firefox, Edge
- **Offers**: Use offer IDs (12345, 67890)
- **Partners**: Use partner names/IDs
- **Currency**: USD, EUR, GBP

### Available Presets:
- `monthlyByOffer` - Monthly offer performance
- `performanceByCountry` - Geographic analysis
- `funnelAnalysis` - Conversion funnel
- `trafficSourceAnalysis` - Source quality

## Pro Tips

1. **Start broad, then narrow**: Begin with overall stats, then drill down
2. **Use presets for quick insights**: They're optimized for common analysis
3. **Compare time periods**: "This week vs last week" gives context
4. **Focus on specific metrics**: Ask for EPC, conversion rates, or revenue
5. **Combine multiple filters**: Country + device + offer for detailed analysis
6. **Ask follow-up questions**: "Why is this metric low?" or "What's causing this trend?"

---

Just ask Claude naturally about your performance data - it will choose the right parameters and analysis!
