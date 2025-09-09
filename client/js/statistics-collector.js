/**
 * E-Commerce Statistics Collector - Tracks recommendation performance and user interactions
 * Collects click-through rates, conversion metrics, and personalization effectiveness
 */

class EcommerceStatisticsCollector {
    constructor(config = {}) {
        this.config = {
            batchSize: config.batchSize || 100,
            flushInterval: config.flushInterval || 60000, // 1 minute
            maxRetries: config.maxRetries || 3,
            serverEndpoint: config.serverEndpoint || 'http://localhost:3000/api/metrics',
            storageKey: 'ecommerce_personalization_stats',
            enableLocalStorage: config.enableLocalStorage !== false
        };

        // Core metrics
        this.interactions = [];
        this.recommendations = [];
        this.conversions = [];
        
        // Session info
        this.sessionId = this.generateSessionId();
        this.userId = null;
        this.deviceInfo = this.collectDeviceInfo();
        
        // Real-time metrics
        this.realtimeMetrics = {
            impressions: 0,
            clicks: 0,
            cartAdds: 0,
            purchases: 0,
            revenue: 0,
            sessionDuration: 0,
            sessionStart: Date.now()
        };
        
        // Network state
        this.isOnline = navigator.onLine;
        this.flushTimer = null;
        
        this.initializeEventListeners();
        this.loadPendingMetrics();
        this.startAutoFlush();
    }

    /**
     * Track recommendation impression
     */
    trackImpression(recommendations, context = {}) {
        const impression = {
            id: this.generateEventId(),
            type: 'impression',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            recommendations: recommendations.map(rec => ({
                productId: rec.id,
                position: rec.position || 0,
                score: rec.score,
                strategy: rec.strategy || 'unknown'
            })),
            context: {
                pageType: context.pageType || 'unknown',
                searchQuery: context.searchQuery || null,
                categoryFilter: context.categoryFilter || null,
                sortOrder: context.sortOrder || 'relevance',
                ...context
            }
        };
        
        this.recommendations.push(impression);
        this.realtimeMetrics.impressions += recommendations.length;
        
        return impression.id;
    }

    /**
     * Track product click/interaction
     */
    trackClick(productId, recommendationId, position, context = {}) {
        const click = {
            id: this.generateEventId(),
            type: 'click',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            productId,
            recommendationId,
            position,
            dwellTime: 0, // Will be updated on page leave
            context
        };
        
        this.interactions.push(click);
        this.realtimeMetrics.clicks++;
        
        // Calculate CTR
        this.updateClickThroughRate(recommendationId);
        
        return click.id;
    }

    /**
     * Track add to cart event
     */
    trackCartAdd(productId, quantity, price, recommendationId = null) {
        const cartAdd = {
            id: this.generateEventId(),
            type: 'cart_add',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            productId,
            quantity,
            price,
            value: quantity * price,
            fromRecommendation: !!recommendationId,
            recommendationId
        };
        
        this.interactions.push(cartAdd);
        this.realtimeMetrics.cartAdds++;
        
        return cartAdd.id;
    }

    /**
     * Track purchase/conversion
     */
    trackPurchase(orderData) {
        const purchase = {
            id: this.generateEventId(),
            type: 'purchase',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            orderId: orderData.orderId,
            products: orderData.products.map(p => ({
                productId: p.productId,
                quantity: p.quantity,
                price: p.price,
                fromRecommendation: p.fromRecommendation || false,
                recommendationId: p.recommendationId || null
            })),
            totalValue: orderData.totalValue,
            currency: orderData.currency || 'USD',
            paymentMethod: orderData.paymentMethod,
            shippingMethod: orderData.shippingMethod
        };
        
        this.conversions.push(purchase);
        this.realtimeMetrics.purchases++;
        this.realtimeMetrics.revenue += purchase.totalValue;
        
        // Calculate conversion metrics
        this.updateConversionMetrics(purchase);
        
        // Immediate flush for purchase data
        this.flushMetrics();
        
        return purchase.id;
    }

    /**
     * Track search event
     */
    trackSearch(query, resultsCount, filters = {}) {
        const search = {
            id: this.generateEventId(),
            type: 'search',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            query,
            resultsCount,
            filters,
            clickedResults: []
        };
        
        this.interactions.push(search);
        return search.id;
    }

    /**
     * Track personalization model performance
     */
    trackModelPerformance(modelMetrics) {
        const performance = {
            id: this.generateEventId(),
            type: 'model_performance',
            sessionId: this.sessionId,
            timestamp: Date.now(),
            inferenceTime: modelMetrics.inferenceTime,
            modelType: modelMetrics.strategy,
            confidence: modelMetrics.confidence,
            candidateCount: modelMetrics.candidateCount || 0,
            memoryUsage: modelMetrics.memoryUsage,
            cacheHit: modelMetrics.cacheHit || false
        };
        
        this.interactions.push(performance);
        return performance.id;
    }

    /**
     * Track A/B test exposure
     */
    trackExperiment(experimentId, variant, context = {}) {
        const experiment = {
            id: this.generateEventId(),
            type: 'experiment',
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: Date.now(),
            experimentId,
            variant,
            context
        };
        
        this.interactions.push(experiment);
        return experiment.id;
    }

    /**
     * Update click-through rate for recommendations
     */
    updateClickThroughRate(recommendationId) {
        const recommendation = this.recommendations.find(r => r.id === recommendationId);
        if (recommendation) {
            const clicks = this.interactions.filter(i => 
                i.type === 'click' && i.recommendationId === recommendationId
            ).length;
            
            recommendation.ctr = clicks / recommendation.recommendations.length;
        }
    }

    /**
     * Update conversion metrics
     */
    updateConversionMetrics(purchase) {
        // Calculate attribution
        const recommendedProducts = purchase.products.filter(p => p.fromRecommendation);
        const recommendedRevenue = recommendedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        
        return {
            conversionRate: this.realtimeMetrics.purchases / this.realtimeMetrics.impressions,
            averageOrderValue: this.realtimeMetrics.revenue / this.realtimeMetrics.purchases,
            recommendationContribution: recommendedRevenue / purchase.totalValue,
            productsPerOrder: purchase.products.length
        };
    }

    /**
     * Get real-time dashboard metrics
     */
    getRealtimeMetrics() {
        const sessionDuration = Date.now() - this.realtimeMetrics.sessionStart;
        
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            metrics: {
                ...this.realtimeMetrics,
                sessionDuration: Math.floor(sessionDuration / 1000), // in seconds
                ctr: this.realtimeMetrics.impressions > 0 
                    ? this.realtimeMetrics.clicks / this.realtimeMetrics.impressions 
                    : 0,
                conversionRate: this.realtimeMetrics.impressions > 0
                    ? this.realtimeMetrics.purchases / this.realtimeMetrics.impressions
                    : 0,
                cartRate: this.realtimeMetrics.clicks > 0
                    ? this.realtimeMetrics.cartAdds / this.realtimeMetrics.clicks
                    : 0,
                aov: this.realtimeMetrics.purchases > 0
                    ? this.realtimeMetrics.revenue / this.realtimeMetrics.purchases
                    : 0
            },
            timestamp: Date.now()
        };
    }

    /**
     * Get recommendation effectiveness metrics
     */
    getRecommendationMetrics() {
        const totalImpressions = this.recommendations.reduce(
            (sum, r) => sum + r.recommendations.length, 0
        );
        
        const clickedRecommendations = this.interactions.filter(i => 
            i.type === 'click' && i.recommendationId
        );
        
        const purchasedRecommendations = this.conversions.flatMap(c => 
            c.products.filter(p => p.fromRecommendation)
        );
        
        return {
            totalImpressions,
            totalClicks: clickedRecommendations.length,
            totalPurchases: purchasedRecommendations.length,
            ctr: totalImpressions > 0 ? clickedRecommendations.length / totalImpressions : 0,
            conversionRate: totalImpressions > 0 ? purchasedRecommendations.length / totalImpressions : 0,
            revenueAttribution: purchasedRecommendations.reduce((sum, p) => sum + (p.price * p.quantity), 0)
        };
    }

    /**
     * Collect device information
     */
    collectDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${screen.width}x${screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            deviceMemory: navigator.deviceMemory || 'unknown',
            connectionType: this.getConnectionType(),
            timestamp: Date.now()
        };
    }

    /**
     * Get connection type
     */
    getConnectionType() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            return {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            };
        }
        return null;
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.flushMetrics();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });

        // Flush metrics before page unload
        window.addEventListener('beforeunload', () => {
            this.flushMetrics(true);
        });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.flushMetrics();
            }
        });
    }

    /**
     * Start automatic flush timer
     */
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            if (this.hasMetrics()) {
                this.flushMetrics();
            }
        }, this.config.flushInterval);
    }

    /**
     * Check if there are metrics to flush
     */
    hasMetrics() {
        return this.interactions.length > 0 || 
               this.recommendations.length > 0 || 
               this.conversions.length > 0;
    }

    /**
     * Flush metrics to server
     */
    async flushMetrics(forceSynchronous = false) {
        if (!this.hasMetrics()) return;

        const payload = {
            sessionId: this.sessionId,
            userId: this.userId,
            deviceInfo: this.deviceInfo,
            interactions: [...this.interactions],
            recommendations: [...this.recommendations],
            conversions: [...this.conversions],
            realtimeMetrics: this.getRealtimeMetrics(),
            recommendationMetrics: this.getRecommendationMetrics(),
            timestamp: Date.now()
        };

        // Clear current metrics
        this.interactions = [];
        this.recommendations = [];
        this.conversions = [];

        if (!this.isOnline) {
            this.saveToLocalStorage(payload);
            return;
        }

        try {
            if (forceSynchronous) {
                this.sendBeacon(payload);
            } else {
                await this.sendToServer(payload);
            }
        } catch (error) {
            console.error('Failed to send metrics:', error);
            this.saveToLocalStorage(payload);
        }
    }

    /**
     * Send metrics to server
     */
    async sendToServer(payload, retryCount = 0) {
        try {
            const response = await fetch(this.config.serverEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const result = await response.json();
            console.log('Metrics sent successfully:', result);
            
            // Try to send pending metrics
            this.sendPendingMetrics();
            
            return result;
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                await this.delay(1000 * Math.pow(2, retryCount));
                return this.sendToServer(payload, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Send metrics using sendBeacon
     */
    sendBeacon(payload) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const success = navigator.sendBeacon(this.config.serverEndpoint, blob);
        
        if (!success) {
            this.saveToLocalStorage(payload);
        }
    }

    /**
     * Save metrics to local storage
     */
    saveToLocalStorage(payload) {
        if (!this.config.enableLocalStorage) return;

        try {
            const existing = this.getPendingMetrics();
            existing.push(payload);
            
            // Limit storage size
            if (existing.length > 50) {
                existing = existing.slice(-50);
            }
            
            localStorage.setItem(this.config.storageKey, JSON.stringify(existing));
        } catch (error) {
            console.error('Failed to save to local storage:', error);
        }
    }

    /**
     * Load pending metrics from local storage
     */
    loadPendingMetrics() {
        if (!this.config.enableLocalStorage) return;

        try {
            const pending = this.getPendingMetrics();
            if (pending.length > 0 && this.isOnline) {
                this.sendPendingMetrics();
            }
        } catch (error) {
            console.error('Failed to load pending metrics:', error);
        }
    }

    /**
     * Get pending metrics from local storage
     */
    getPendingMetrics() {
        try {
            const data = localStorage.getItem(this.config.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Send pending metrics
     */
    async sendPendingMetrics() {
        const pending = this.getPendingMetrics();
        if (pending.length === 0) return;

        const successful = [];
        
        for (const batch of pending) {
            try {
                await this.sendToServer(batch);
                successful.push(batch);
            } catch (error) {
                break;
            }
        }

        if (successful.length > 0) {
            const remaining = pending.slice(successful.length);
            if (remaining.length > 0) {
                localStorage.setItem(this.config.storageKey, JSON.stringify(remaining));
            } else {
                localStorage.removeItem(this.config.storageKey);
            }
        }
    }

    /**
     * Set user ID
     */
    setUserId(userId) {
        this.userId = userId;
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate event ID
     */
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Export metrics for analysis
     */
    exportMetrics() {
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            realtimeMetrics: this.getRealtimeMetrics(),
            recommendationMetrics: this.getRecommendationMetrics(),
            pendingMetrics: this.getPendingMetrics(),
            deviceInfo: this.deviceInfo
        };
    }

    /**
     * Cleanup and dispose
     */
    dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushMetrics(true);
    }
}

export default EcommerceStatisticsCollector;