/**
 * Cache Service - Intelligent caching for API responses
 */

export interface CacheOptions {
  defaultTTL: number;
  maxSize: number;
  cleanupInterval?: number;
}

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0
  };

  constructor(private options: CacheOptions) {
    if (options.cleanupInterval) {
      this.cleanupInterval = setInterval(
        () => this.cleanup(),
        options.cleanupInterval
      );
    }
  }

  async get<T>(key: string): Promise<T | null> {
    this.stats.totalRequests++;
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    return entry.data as T;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const effectiveTTL = ttl || this.options.defaultTTL;
    
    // Enforce size limit
    if (this.cache.size >= this.options.maxSize) {
      await this.evictLeastUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: effectiveTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async evictLeastUsed(): Promise<void> {
    const entries = Array.from(this.cache.entries());
    
    // Sort by access count (ascending) and last accessed (ascending)
    entries.sort((a, b) => {
      const [, entryA] = a;
      const [, entryB] = b;
      
      if (entryA.accessCount !== entryB.accessCount) {
        return entryA.accessCount - entryB.accessCount;
      }
      
      return entryA.lastAccessed - entryB.lastAccessed;
    });

    // Remove 25% of entries
    const evictCount = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < evictCount; i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
  }

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    totalRequests: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      totalRequests: this.stats.totalRequests,
      hitRate: this.stats.totalRequests > 0 
        ? this.stats.hits / this.stats.totalRequests 
        : 0
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.cache.clear();
  }
}
