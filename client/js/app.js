/**
 * E-Commerce Personalization Application
 * Real-time product recommendations with edge ML and continuous learning
 */

import PersonalizationModelManager from './model-manager.js';
import EcommerceStatisticsCollector from './statistics-collector.js';
import PerformanceMonitor from './performance-monitor.js';

class EcommercePersonalizationApp {
    constructor() {
        this.modelManager = new PersonalizationModelManager();
        this.statsCollector = new EcommerceStatisticsCollector({
            serverEndpoint: 'http://localhost:3000/api/metrics',
            batchSize: 50,
            flushInterval: 30000
        });
        this.performanceMonitor = new PerformanceMonitor();
        
        // Application state
        this.isInitialized = false;
        this.currentUser = null;
        this.cart = [];
        this.productCatalog = [];
        
        // Demo product catalog
        this.initializeProductCatalog();
        this.initializeUI();
        this.bindEvents();
    }

    /**
     * Initialize demo product catalog
     */
    initializeProductCatalog() {
        const categories = ['Electronics', 'Fashion', 'Home', 'Sports', 'Books', 'Beauty', 'Toys', 'Food'];
        const brands = ['TechPro', 'StyleMax', 'HomeComfort', 'SportElite', 'BookWorld', 'BeautyGlow', 'FunToys', 'Gourmet'];
        
        // Generate synthetic product catalog
        for (let i = 0; i < 200; i++) {
            const category = categories[Math.floor(Math.random() * categories.length)];
            const brand = brands[Math.floor(Math.random() * brands.length)];
            
            this.productCatalog.push({
                id: `product_${i}`,
                name: `${brand} ${category} Item ${i}`,
                category: category,
                brand: brand,
                price: Math.floor(Math.random() * 500) + 10,
                rating: (Math.random() * 2 + 3).toFixed(1),
                reviews: Math.floor(Math.random() * 1000),
                image: `https://picsum.photos/200/200?random=${i}`,
                description: `High-quality ${category.toLowerCase()} product from ${brand}`,
                inStock: Math.random() > 0.1,
                discount: Math.random() > 0.7 ? Math.floor(Math.random() * 30) + 5 : 0,
                tags: this.generateTags(category),
                popularity: Math.random()
            });
        }
    }

    /**
     * Generate product tags
     */
    generateTags(category) {
        const tagSets = {
            'Electronics': ['smart', 'wireless', 'portable', 'high-tech'],
            'Fashion': ['trendy', 'comfortable', 'stylish', 'seasonal'],
            'Home': ['modern', 'eco-friendly', 'space-saving', 'decorative'],
            'Sports': ['professional', 'durable', 'lightweight', 'performance'],
            'Books': ['bestseller', 'educational', 'fiction', 'non-fiction'],
            'Beauty': ['organic', 'cruelty-free', 'anti-aging', 'natural'],
            'Toys': ['educational', 'creative', 'safe', 'interactive'],
            'Food': ['organic', 'gluten-free', 'vegan', 'gourmet']
        };
        
        const tags = tagSets[category] || [];
        return tags.filter(() => Math.random() > 0.5);
    }

    /**
     * Initialize UI
     */
    initializeUI() {
        document.body.innerHTML = `
            <div class="ecommerce-container">
                <header class="site-header">
                    <div class="header-content">
                        <h1>AI-Powered Shopping Experience</h1>
                        <p>Real-time personalization with edge ML</p>
                    </div>
                    <div class="header-actions">
                        <div class="user-info">
                            <span id="userStatus">Guest User</span>
                        </div>
                        <div class="cart-info">
                            <span class="cart-icon">🛒</span>
                            <span id="cartCount">0</span>
                        </div>
                    </div>
                </header>

                <div class="model-status-bar" id="modelStatus">
                    <div class="status-indicator">
                        <span class="status-dot" id="statusDot"></span>
                        <span id="statusText">Personalization engine not loaded</span>
                    </div>
                    <button id="loadModelBtn" class="btn btn-primary">Initialize Personalization</button>
                </div>

                <div class="main-layout">
                    <aside class="sidebar">
                        <div class="filter-section">
                            <h3>Categories</h3>
                            <div id="categoryFilters" class="filter-list"></div>
                        </div>
                        
                        <div class="filter-section">
                            <h3>Price Range</h3>
                            <div class="price-range">
                                <input type="range" id="priceRange" min="0" max="500" value="500">
                                <span id="priceValue">$0 - $500</span>
                            </div>
                        </div>

                        <div class="user-profile">
                            <h3>Your Profile</h3>
                            <div id="userPreferences">
                                <p class="preference-item">Views: <span id="viewCount">0</span></p>
                                <p class="preference-item">Cart adds: <span id="cartAddCount">0</span></p>
                                <p class="preference-item">Purchases: <span id="purchaseCount">0</span></p>
                            </div>
                        </div>
                    </aside>

                    <main class="content">
                        <div class="search-bar">
                            <input type="text" id="searchInput" placeholder="Search products...">
                            <button id="searchBtn" class="btn btn-primary">Search</button>
                        </div>

                        <div class="recommendation-section">
                            <h2>Recommended for You</h2>
                            <div class="recommendation-strategy">
                                Strategy: <span id="strategyType">Cold Start</span> | 
                                Confidence: <span id="confidenceScore">0%</span>
                            </div>
                            <div id="recommendations" class="product-grid">
                                <div class="loading-state">Loading recommendations...</div>
                            </div>
                        </div>

                        <div class="product-section">
                            <h2>All Products</h2>
                            <div class="sort-controls">
                                <select id="sortSelect">
                                    <option value="relevance">Relevance</option>
                                    <option value="price_asc">Price: Low to High</option>
                                    <option value="price_desc">Price: High to Low</option>
                                    <option value="rating">Rating</option>
                                    <option value="popularity">Popularity</option>
                                </select>
                            </div>
                            <div id="productGrid" class="product-grid"></div>
                        </div>
                    </main>

                    <aside class="metrics-panel">
                        <h3>Real-time Metrics</h3>
                        <div class="metric-card">
                            <span class="metric-label">Inference Time</span>
                            <span class="metric-value" id="inferenceTime">-</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">CTR</span>
                            <span class="metric-value" id="ctrMetric">0%</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">Conversion Rate</span>
                            <span class="metric-value" id="conversionMetric">0%</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">AOV</span>
                            <span class="metric-value" id="aovMetric">$0</span>
                        </div>
                        
                        <canvas id="performanceChart"></canvas>
                        
                        <button id="exportMetricsBtn" class="btn btn-secondary">Export Metrics</button>
                    </aside>
                </div>

                <div class="cart-modal" id="cartModal" style="display: none;">
                    <div class="modal-content">
                        <h2>Shopping Cart</h2>
                        <div id="cartItems"></div>
                        <div class="cart-total">
                            Total: $<span id="cartTotal">0</span>
                        </div>
                        <button id="checkoutBtn" class="btn btn-primary">Checkout</button>
                        <button id="closeCartBtn" class="btn btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;

        this.addStyles();
        this.renderCategories();
        this.renderProducts();
    }

    /**
     * Add CSS styles
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #f5f5f5;
                color: #333;
            }

            .ecommerce-container {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
            }

            .site-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .header-actions {
                display: flex;
                gap: 30px;
                align-items: center;
            }

            .cart-info {
                display: flex;
                align-items: center;
                gap: 5px;
                cursor: pointer;
                font-size: 20px;
            }

            .model-status-bar {
                background: white;
                padding: 15px 20px;
                border-bottom: 1px solid #e0e0e0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ff4444;
            }

            .status-dot.loaded {
                background: #44ff44;
            }

            .main-layout {
                flex: 1;
                display: grid;
                grid-template-columns: 250px 1fr 300px;
                gap: 20px;
                padding: 20px;
                max-width: 1600px;
                margin: 0 auto;
                width: 100%;
            }

            .sidebar {
                background: white;
                border-radius: 8px;
                padding: 20px;
                height: fit-content;
            }

            .filter-section {
                margin-bottom: 30px;
            }

            .filter-section h3 {
                margin-bottom: 15px;
                font-size: 16px;
            }

            .filter-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .filter-item {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }

            .filter-item:hover {
                color: #667eea;
            }

            .content {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .search-bar {
                background: white;
                padding: 20px;
                border-radius: 8px;
                display: flex;
                gap: 10px;
            }

            .search-bar input {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 16px;
            }

            .recommendation-section,
            .product-section {
                background: white;
                padding: 20px;
                border-radius: 8px;
            }

            .recommendation-strategy {
                color: #666;
                font-size: 14px;
                margin: 10px 0;
            }

            .product-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }

            .product-card {
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .product-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }

            .product-card.recommended {
                border: 2px solid #667eea;
            }

            .product-image {
                width: 100%;
                height: 150px;
                object-fit: cover;
            }

            .product-info {
                padding: 15px;
            }

            .product-name {
                font-weight: 600;
                margin-bottom: 5px;
                font-size: 14px;
            }

            .product-category {
                color: #666;
                font-size: 12px;
                margin-bottom: 10px;
            }

            .product-price {
                font-size: 18px;
                font-weight: 700;
                color: #333;
            }

            .product-rating {
                display: flex;
                align-items: center;
                gap: 5px;
                margin-top: 5px;
                font-size: 12px;
                color: #666;
            }

            .product-actions {
                padding: 10px 15px;
                border-top: 1px solid #e0e0e0;
                display: flex;
                gap: 10px;
            }

            .metrics-panel {
                background: white;
                border-radius: 8px;
                padding: 20px;
                height: fit-content;
            }

            .metric-card {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #e0e0e0;
            }

            .metric-label {
                color: #666;
                font-size: 14px;
            }

            .metric-value {
                font-weight: 600;
            }

            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.3s ease;
            }

            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .btn-secondary {
                background: #6c757d;
                color: white;
            }

            .btn-small {
                padding: 5px 10px;
                font-size: 12px;
            }

            .btn:hover {
                opacity: 0.9;
            }

            .cart-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }

            .modal-content {
                background: white;
                padding: 30px;
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
            }

            .loading-state {
                text-align: center;
                padding: 40px;
                color: #666;
            }

            .user-profile {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                margin-top: 20px;
            }

            .preference-item {
                display: flex;
                justify-content: space-between;
                margin: 8px 0;
                font-size: 14px;
            }

            @media (max-width: 1200px) {
                .main-layout {
                    grid-template-columns: 200px 1fr;
                }
                
                .metrics-panel {
                    display: none;
                }
            }

            @media (max-width: 768px) {
                .main-layout {
                    grid-template-columns: 1fr;
                }
                
                .sidebar {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Model initialization
        document.getElementById('loadModelBtn').addEventListener('click', () => this.initializeModels());
        
        // Search
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        
        // Sort
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.sortProducts(e.target.value);
        });
        
        // Price filter
        document.getElementById('priceRange').addEventListener('input', (e) => {
            document.getElementById('priceValue').textContent = `$0 - $${e.target.value}`;
            this.filterByPrice(e.target.value);
        });
        
        // Cart
        document.querySelector('.cart-info').addEventListener('click', () => this.showCart());
        document.getElementById('closeCartBtn').addEventListener('click', () => this.hideCart());
        document.getElementById('checkoutBtn').addEventListener('click', () => this.checkout());
        
        // Export metrics
        document.getElementById('exportMetricsBtn').addEventListener('click', () => this.exportMetrics());
    }

    /**
     * Initialize personalization models
     */
    async initializeModels() {
        const loadBtn = document.getElementById('loadModelBtn');
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        
        try {
            const modelInfo = await this.modelManager.loadModels();
            
            this.isInitialized = true;
            this.updateModelStatus(true);
            
            // Initialize user session
            this.currentUser = this.modelManager.userProfile;
            this.statsCollector.setUserId(this.currentUser.userId);
            
            // Load initial recommendations
            await this.loadRecommendations();
            
            // Start performance monitoring
            this.performanceMonitor.initialize('performanceChart');
            
            console.log('Models initialized:', modelInfo);
            
        } catch (error) {
            console.error('Failed to initialize models:', error);
            alert('Failed to initialize personalization engine');
            loadBtn.disabled = false;
            loadBtn.textContent = 'Initialize Personalization';
        }
    }

    /**
     * Load personalized recommendations
     */
    async loadRecommendations() {
        if (!this.isInitialized) return;
        
        const container = document.getElementById('recommendations');
        container.innerHTML = '<div class="loading-state">Generating recommendations...</div>';
        
        try {
            // Get recommendations
            const result = await this.modelManager.getRecommendations(8, {
                timeOfDay: new Date().getHours(),
                dayOfWeek: new Date().getDay(),
                searchQuery: document.getElementById('searchInput').value || null
            });
            
            // Display recommendations
            this.displayRecommendations(result.recommendations);
            
            // Update strategy display
            document.getElementById('strategyType').textContent = result.strategy;
            document.getElementById('confidenceScore').textContent = (result.confidence * 100).toFixed(0) + '%';
            
            // Track impressions
            const impressionId = this.statsCollector.trackImpression(
                result.recommendations.map((rec, i) => ({
                    ...rec,
                    position: i + 1,
                    strategy: result.strategy
                })),
                { pageType: 'home' }
            );
            
            // Track model performance
            this.statsCollector.trackModelPerformance({
                inferenceTime: result.inferenceTime,
                strategy: result.strategy,
                confidence: result.confidence,
                candidateCount: 100,
                memoryUsage: this.modelManager.getMemoryUsage()
            });
            
            // Update metrics display
            document.getElementById('inferenceTime').textContent = result.inferenceTime.toFixed(0) + 'ms';
            
        } catch (error) {
            console.error('Failed to load recommendations:', error);
            container.innerHTML = '<div class="loading-state">Failed to load recommendations</div>';
        }
    }

    /**
     * Display recommendations
     */
    displayRecommendations(recommendations) {
        const container = document.getElementById('recommendations');
        container.innerHTML = '';
        
        recommendations.forEach((rec, index) => {
            // Find actual product from catalog (in production, this would come from the recommendation)
            const product = this.productCatalog[Math.floor(Math.random() * this.productCatalog.length)];
            if (product) {
                const card = this.createProductCard(product, true, index);
                container.appendChild(card);
            }
        });
    }

    /**
     * Render product catalog
     */
    renderProducts() {
        const container = document.getElementById('productGrid');
        container.innerHTML = '';
        
        // Display first 20 products
        this.productCatalog.slice(0, 20).forEach(product => {
            const card = this.createProductCard(product, false);
            container.appendChild(card);
        });
    }

    /**
     * Create product card element
     */
    createProductCard(product, isRecommended = false, position = null) {
        const card = document.createElement('div');
        card.className = `product-card ${isRecommended ? 'recommended' : ''}`;
        card.innerHTML = `
            <img src="${product.image}" alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-category">${product.category}</div>
                <div class="product-price">$${product.price}</div>
                <div class="product-rating">
                    ⭐ ${product.rating} (${product.reviews})
                </div>
            </div>
            <div class="product-actions">
                <button class="btn btn-small btn-primary" data-product-id="${product.id}">View</button>
                <button class="btn btn-small btn-secondary" data-product-id="${product.id}">Add to Cart</button>
            </div>
        `;
        
        // Bind events
        card.querySelector('.btn-primary').addEventListener('click', () => {
            this.viewProduct(product, isRecommended, position);
        });
        
        card.querySelector('.btn-secondary').addEventListener('click', () => {
            this.addToCart(product, isRecommended, position);
        });
        
        return card;
    }

    /**
     * Handle product view
     */
    async viewProduct(product, fromRecommendation = false, position = null) {
        // Track behavior
        await this.modelManager.trackBehavior('view', product, {
            fromRecommendation,
            position
        });
        
        // Track click if from recommendation
        if (fromRecommendation) {
            this.statsCollector.trackClick(product.id, null, position);
        }
        
        // Update view count
        const viewCount = parseInt(document.getElementById('viewCount').textContent);
        document.getElementById('viewCount').textContent = viewCount + 1;
        
        // Refresh recommendations after behavior
        if (this.isInitialized) {
            setTimeout(() => this.loadRecommendations(), 1000);
        }
        
        alert(`Viewing: ${product.name}\nPrice: $${product.price}\nCategory: ${product.category}`);
    }

    /**
     * Add product to cart
     */
    async addToCart(product, fromRecommendation = false, position = null) {
        // Add to cart
        this.cart.push(product);
        document.getElementById('cartCount').textContent = this.cart.length;
        
        // Track behavior
        await this.modelManager.trackBehavior('cart_add', product, {
            fromRecommendation,
            position
        });
        
        // Track cart add
        this.statsCollector.trackCartAdd(product.id, 1, product.price, fromRecommendation ? 'rec_1' : null);
        
        // Update cart add count
        const cartAddCount = parseInt(document.getElementById('cartAddCount').textContent);
        document.getElementById('cartAddCount').textContent = cartAddCount + 1;
        
        // Update metrics
        this.updateRealtimeMetrics();
        
        // Refresh recommendations
        if (this.isInitialized) {
            setTimeout(() => this.loadRecommendations(), 1000);
        }
    }

    /**
     * Handle search
     */
    async handleSearch() {
        const query = document.getElementById('searchInput').value;
        if (!query) return;
        
        // Track search
        const searchResults = this.productCatalog.filter(p => 
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.category.toLowerCase().includes(query.toLowerCase())
        );
        
        this.statsCollector.trackSearch(query, searchResults.length);
        
        // Track behavior
        if (this.isInitialized) {
            await this.modelManager.trackBehavior('search', { query }, { resultsCount: searchResults.length });
        }
        
        // Display results
        const container = document.getElementById('productGrid');
        container.innerHTML = '';
        
        searchResults.slice(0, 20).forEach(product => {
            const card = this.createProductCard(product, false);
            container.appendChild(card);
        });
        
        // Refresh recommendations based on search
        if (this.isInitialized) {
            setTimeout(() => this.loadRecommendations(), 500);
        }
    }

    /**
     * Sort products
     */
    sortProducts(sortBy) {
        let sorted = [...this.productCatalog];
        
        switch(sortBy) {
            case 'price_asc':
                sorted.sort((a, b) => a.price - b.price);
                break;
            case 'price_desc':
                sorted.sort((a, b) => b.price - a.price);
                break;
            case 'rating':
                sorted.sort((a, b) => b.rating - a.rating);
                break;
            case 'popularity':
                sorted.sort((a, b) => b.popularity - a.popularity);
                break;
        }
        
        const container = document.getElementById('productGrid');
        container.innerHTML = '';
        
        sorted.slice(0, 20).forEach(product => {
            const card = this.createProductCard(product, false);
            container.appendChild(card);
        });
    }

    /**
     * Filter by price
     */
    filterByPrice(maxPrice) {
        const filtered = this.productCatalog.filter(p => p.price <= maxPrice);
        
        const container = document.getElementById('productGrid');
        container.innerHTML = '';
        
        filtered.slice(0, 20).forEach(product => {
            const card = this.createProductCard(product, false);
            container.appendChild(card);
        });
    }

    /**
     * Render category filters
     */
    renderCategories() {
        const container = document.getElementById('categoryFilters');
        const categories = [...new Set(this.productCatalog.map(p => p.category))];
        
        categories.forEach(category => {
            const item = document.createElement('div');
            item.className = 'filter-item';
            item.innerHTML = `
                <input type="checkbox" id="cat_${category}" value="${category}">
                <label for="cat_${category}">${category}</label>
            `;
            
            item.querySelector('input').addEventListener('change', (e) => {
                this.filterByCategory(category, e.target.checked);
            });
            
            container.appendChild(item);
        });
    }

    /**
     * Filter by category
     */
    filterByCategory(category, include) {
        // Simple implementation - in production would handle multiple selections
        if (include) {
            const filtered = this.productCatalog.filter(p => p.category === category);
            const container = document.getElementById('productGrid');
            container.innerHTML = '';
            
            filtered.slice(0, 20).forEach(product => {
                const card = this.createProductCard(product, false);
                container.appendChild(card);
            });
        } else {
            this.renderProducts();
        }
    }

    /**
     * Show cart modal
     */
    showCart() {
        const modal = document.getElementById('cartModal');
        const itemsContainer = document.getElementById('cartItems');
        
        itemsContainer.innerHTML = '';
        let total = 0;
        
        this.cart.forEach(product => {
            const item = document.createElement('div');
            item.innerHTML = `
                <div style="padding: 10px; border-bottom: 1px solid #eee;">
                    ${product.name} - $${product.price}
                </div>
            `;
            itemsContainer.appendChild(item);
            total += product.price;
        });
        
        document.getElementById('cartTotal').textContent = total.toFixed(2);
        modal.style.display = 'flex';
    }

    /**
     * Hide cart modal
     */
    hideCart() {
        document.getElementById('cartModal').style.display = 'none';
    }

    /**
     * Process checkout
     */
    async checkout() {
        if (this.cart.length === 0) {
            alert('Cart is empty');
            return;
        }
        
        const total = this.cart.reduce((sum, p) => sum + p.price, 0);
        
        // Track purchase
        const orderData = {
            orderId: `order_${Date.now()}`,
            products: this.cart.map(p => ({
                productId: p.id,
                quantity: 1,
                price: p.price,
                fromRecommendation: false
            })),
            totalValue: total,
            currency: 'USD',
            paymentMethod: 'card',
            shippingMethod: 'standard'
        };
        
        this.statsCollector.trackPurchase(orderData);
        
        // Track behavior
        if (this.isInitialized) {
            for (const product of this.cart) {
                await this.modelManager.trackBehavior('purchase', product, { orderId: orderData.orderId });
            }
        }
        
        // Update purchase count
        const purchaseCount = parseInt(document.getElementById('purchaseCount').textContent);
        document.getElementById('purchaseCount').textContent = purchaseCount + 1;
        
        // Clear cart
        this.cart = [];
        document.getElementById('cartCount').textContent = '0';
        
        // Update metrics
        this.updateRealtimeMetrics();
        
        alert(`Order placed successfully!\nTotal: $${total.toFixed(2)}`);
        this.hideCart();
        
        // Refresh recommendations
        if (this.isInitialized) {
            setTimeout(() => this.loadRecommendations(), 1000);
        }
    }

    /**
     * Update real-time metrics display
     */
    updateRealtimeMetrics() {
        const metrics = this.statsCollector.getRealtimeMetrics();
        
        document.getElementById('ctrMetric').textContent = (metrics.metrics.ctr * 100).toFixed(1) + '%';
        document.getElementById('conversionMetric').textContent = (metrics.metrics.conversionRate * 100).toFixed(1) + '%';
        document.getElementById('aovMetric').textContent = '$' + metrics.metrics.aov.toFixed(2);
    }

    /**
     * Export metrics
     */
    exportMetrics() {
        const metrics = this.statsCollector.exportMetrics();
        const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecommerce-metrics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Update model status
     */
    updateModelStatus(loaded) {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const btn = document.getElementById('loadModelBtn');
        
        if (loaded) {
            dot.classList.add('loaded');
            text.textContent = 'Personalization engine active';
            btn.style.display = 'none';
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new EcommercePersonalizationApp();
});

export default EcommercePersonalizationApp;