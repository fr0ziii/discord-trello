const NodeCache = require('node-cache');

class ConfigCache {
    constructor(options = {}) {
        this.ttl = parseInt(process.env.CONFIG_CACHE_TTL) || 300; // 5 minutes default
        this.maxKeys = options.maxKeys || 1000;
        this.checkPeriod = options.checkPeriod || 120; // Check for expired keys every 2 minutes
        
        this.cache = new NodeCache({
            stdTTL: this.ttl,
            maxKeys: this.maxKeys,
            checkperiod: this.checkPeriod,
            useClones: false, // For better performance
            deleteOnExpire: true
        });

        // Statistics tracking
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0
        };

        // Bind event listeners
        this.cache.on('set', (key, value) => {
            this.stats.sets++;
            console.log(`📦 Cache SET: ${this.maskKey(key)}`);
        });

        this.cache.on('del', (key, value) => {
            this.stats.deletes++;
            console.log(`🗑️ Cache DEL: ${this.maskKey(key)}`);
        });

        this.cache.on('expired', (key, value) => {
            console.log(`⏰ Cache EXPIRED: ${this.maskKey(key)}`);
        });

        console.log(`🔧 ConfigCache initialized: TTL=${this.ttl}s, MaxKeys=${this.maxKeys}`);
    }

    // Generate cache keys
    generateChannelKey(guildId, channelId) {
        return `channel:${guildId}:${channelId}`;
    }

    generateDefaultKey(guildId) {
        return `default:${guildId}`;
    }

    generateBoardKey(boardId) {
        return `board:${boardId}`;
    }

    generateListKey(listId) {
        return `list:${listId}`;
    }

    // Channel mapping cache methods
    async getChannelMapping(guildId, channelId) {
        const key = this.generateChannelKey(guildId, channelId);
        
        try {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                this.stats.hits++;
                console.log(`💨 Cache HIT: ${this.maskKey(key)}`);
                return cached;
            }
            
            this.stats.misses++;
            console.log(`❌ Cache MISS: ${this.maskKey(key)}`);
            return null;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache GET error for ${this.maskKey(key)}:`, error.message);
            return null;
        }
    }

    async setChannelMapping(guildId, channelId, mapping) {
        const key = this.generateChannelKey(guildId, channelId);
        
        try {
            // Add cache metadata
            const cachedMapping = {
                ...mapping,
                cached_at: new Date().toISOString(),
                cache_ttl: this.ttl
            };
            
            this.cache.set(key, cachedMapping);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache SET error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    async invalidateChannelMapping(guildId, channelId) {
        const key = this.generateChannelKey(guildId, channelId);
        
        try {
            this.cache.del(key);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache DEL error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    // Default config cache methods
    async getDefaultConfig(guildId) {
        const key = this.generateDefaultKey(guildId);
        
        try {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                this.stats.hits++;
                console.log(`💨 Cache HIT: ${this.maskKey(key)}`);
                return cached;
            }
            
            this.stats.misses++;
            return null;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache GET error for ${this.maskKey(key)}:`, error.message);
            return null;
        }
    }

    async setDefaultConfig(guildId, config) {
        const key = this.generateDefaultKey(guildId);
        
        try {
            const cachedConfig = {
                ...config,
                cached_at: new Date().toISOString(),
                cache_ttl: this.ttl
            };
            
            this.cache.set(key, cachedConfig);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache SET error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    async invalidateDefaultConfig(guildId) {
        const key = this.generateDefaultKey(guildId);
        
        try {
            this.cache.del(key);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache DEL error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    // Board validation cache methods
    async getBoardValidation(boardId) {
        const key = this.generateBoardKey(boardId);
        
        try {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                this.stats.hits++;
                return cached;
            }
            
            this.stats.misses++;
            return null;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache GET error for ${this.maskKey(key)}:`, error.message);
            return null;
        }
    }

    async setBoardValidation(boardId, validation) {
        const key = this.generateBoardKey(boardId);
        
        try {
            // Cache board validation for longer (1 hour) as boards don't change often
            this.cache.set(key, validation, 3600);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache SET error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    // List validation cache methods
    async getListValidation(listId) {
        const key = this.generateListKey(listId);
        
        try {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                this.stats.hits++;
                return cached;
            }
            
            this.stats.misses++;
            return null;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache GET error for ${this.maskKey(key)}:`, error.message);
            return null;
        }
    }

    async setListValidation(listId, validation) {
        const key = this.generateListKey(listId);
        
        try {
            // Cache list validation for longer (1 hour) as lists don't change often
            this.cache.set(key, validation, 3600);
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache SET error for ${this.maskKey(key)}:`, error.message);
            return false;
        }
    }

    // Guild-wide invalidation methods
    async invalidateGuild(guildId) {
        try {
            // Get all keys and filter for this guild
            const allKeys = this.cache.keys();
            const guildKeys = allKeys.filter(key => 
                key.startsWith(`channel:${guildId}:`) || 
                key.startsWith(`default:${guildId}`)
            );
            
            // Delete all guild-related keys
            for (const key of guildKeys) {
                this.cache.del(key);
            }
            
            console.log(`🧹 Cache invalidated for guild ${guildId}: ${guildKeys.length} keys removed`);
            return guildKeys.length;
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Cache guild invalidation error for ${guildId}:`, error.message);
            return 0;
        }
    }

    // Cache management methods
    getStats() {
        const cacheStats = this.cache.getStats();
        
        return {
            // Our custom stats
            ...this.stats,
            
            // NodeCache built-in stats
            keys: cacheStats.keys,
            ksize: cacheStats.ksize,
            vsize: cacheStats.vsize,
            
            // Calculated metrics
            hitRate: this.stats.hits > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%' : '0%',
            totalOperations: this.stats.hits + this.stats.misses + this.stats.sets + this.stats.deletes,
            
            // Configuration
            ttl: this.ttl,
            maxKeys: this.maxKeys,
            checkPeriod: this.checkPeriod
        };
    }

    async clear() {
        try {
            this.cache.flushAll();
            console.log('🧹 Cache cleared completely');
            
            // Reset stats
            this.stats = {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                errors: 0
            };
            
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error('❌ Cache clear error:', error.message);
            return false;
        }
    }

    async healthCheck() {
        try {
            const testKey = 'health:check';
            const testValue = { timestamp: new Date().toISOString() };
            
            // Test set operation
            this.cache.set(testKey, testValue, 5);
            
            // Test get operation
            const retrieved = this.cache.get(testKey);
            
            // Test delete operation
            this.cache.del(testKey);
            
            return {
                healthy: true,
                stats: this.getStats()
            };
        } catch (error) {
            console.error('❌ Cache health check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                stats: this.getStats()
            };
        }
    }

    // Utility methods
    maskKey(key) {
        // Mask sensitive parts of keys for logging
        return key.replace(/:\d{17,19}/g, ':***');
    }

    close() {
        try {
            this.cache.close();
            console.log('📦 Cache connection closed');
        } catch (error) {
            console.error('❌ Error closing cache:', error.message);
        }
    }
}

// Singleton instance
let cacheInstance = null;

function getCache() {
    if (!cacheInstance) {
        cacheInstance = new ConfigCache();
    }
    return cacheInstance;
}

module.exports = {
    ConfigCache,
    getCache
};