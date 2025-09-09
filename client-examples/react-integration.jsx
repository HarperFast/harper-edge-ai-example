/**
 * React Integration Example for Edge AI Proxy
 * 
 * This demonstrates how to integrate the Edge AI Proxy with a React e-commerce application.
 * Simply change your API endpoint to point to the proxy instead of your backend directly.
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import axios from 'axios';

// Configuration
const PROXY_CONFIG = {
  // Change this single line to switch between proxy and direct API
  baseURL: process.env.REACT_APP_USE_PROXY === 'true' 
    ? 'http://localhost:3000/api' 
    : 'https://api.your-store.com',
  
  tenantId: process.env.REACT_APP_TENANT_ID || 'demo-store',
  timeout: 10000
};

// Create axios instance with proxy configuration
const apiClient = axios.create({
  baseURL: PROXY_CONFIG.baseURL,
  timeout: PROXY_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to inject user context
apiClient.interceptors.request.use((config) => {
  // Get user context from localStorage or state management
  const userContext = getUserContext();
  
  // Add proxy headers for personalization
  if (PROXY_CONFIG.baseURL.includes('localhost:3000')) {
    config.headers['X-Tenant-Id'] = PROXY_CONFIG.tenantId;
    config.headers['X-User-Id'] = userContext.userId;
    config.headers['X-Session-Id'] = userContext.sessionId;
    config.headers['X-Device-Type'] = detectDeviceType();
    
    if (userContext.preferences) {
      config.headers['X-User-Preferences'] = btoa(JSON.stringify(userContext.preferences));
    }
  }
  
  return config;
});

// Add response interceptor to track metrics
apiClient.interceptors.response.use((response) => {
  // Track proxy metrics
  if (response.headers['x-proxy-cache']) {
    console.log('Cache Status:', response.headers['x-proxy-cache']);
  }
  
  if (response.headers['x-proxy-enhanced']) {
    console.log('AI Enhanced:', response.headers['x-proxy-enhanced']);
  }
  
  if (response.headers['x-proxy-response-time']) {
    console.log('Response Time:', response.headers['x-proxy-response-time'] + 'ms');
  }
  
  return response;
}, (error) => {
  console.error('API Error:', error);
  return Promise.reject(error);
});

// Utility functions
function getUserContext() {
  return {
    userId: localStorage.getItem('userId') || 'anonymous',
    sessionId: sessionStorage.getItem('sessionId') || generateSessionId(),
    preferences: JSON.parse(localStorage.getItem('userPreferences') || '{}')
  };
}

function generateSessionId() {
  const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
  sessionStorage.setItem('sessionId', sessionId);
  return sessionId;
}

function detectDeviceType() {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

// API Service Layer
class EcommerceAPI {
  // Product endpoints
  static async getProducts(params = {}) {
    const response = await apiClient.get('/products', { params });
    return response.data;
  }
  
  static async getProduct(id) {
    const response = await apiClient.get(`/product/${id}`);
    return response.data;
  }
  
  static async searchProducts(query) {
    const response = await apiClient.get('/search', { params: { q: query } });
    return response.data;
  }
  
  // Recommendation endpoints
  static async getRecommendations(productId = null) {
    const endpoint = productId 
      ? `/recommendations/product/${productId}`
      : '/recommendations';
    const response = await apiClient.get(endpoint);
    return response.data;
  }
  
  static async getPersonalizedProducts(category = null) {
    const endpoint = category 
      ? `/products/category/${category}`
      : '/products/personalized';
    const response = await apiClient.get(endpoint);
    return response.data;
  }
  
  // Cart and checkout
  static async addToCart(productId, quantity = 1) {
    const response = await apiClient.post('/cart/add', { productId, quantity });
    return response.data;
  }
  
  static async getCart() {
    const response = await apiClient.get('/cart');
    return response.data;
  }
  
  // User preferences
  static async updatePreferences(preferences) {
    localStorage.setItem('userPreferences', JSON.stringify(preferences));
    const response = await apiClient.post('/user/preferences', preferences);
    return response.data;
  }
}

// React Context for Proxy State
const ProxyContext = createContext();

export const ProxyProvider = ({ children }) => {
  const [metrics, setMetrics] = useState({
    cacheHitRate: 0,
    enhancementRate: 0,
    averageResponseTime: 0,
    totalRequests: 0
  });
  
  const [isProxyEnabled, setIsProxyEnabled] = useState(
    PROXY_CONFIG.baseURL.includes('localhost:3000')
  );
  
  const updateMetrics = useCallback((newMetrics) => {
    setMetrics(prev => ({ ...prev, ...newMetrics }));
  }, []);
  
  return (
    <ProxyContext.Provider value={{ 
      metrics, 
      updateMetrics, 
      isProxyEnabled,
      setIsProxyEnabled 
    }}>
      {children}
    </ProxyContext.Provider>
  );
};

export const useProxy = () => useContext(ProxyContext);

// Custom Hooks
export const useProducts = (category = null) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { updateMetrics } = useProxy();
  
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const startTime = performance.now();
        
        const data = category 
          ? await EcommerceAPI.getPersonalizedProducts(category)
          : await EcommerceAPI.getProducts();
        
        const responseTime = performance.now() - startTime;
        
        setProducts(data.products || data);
        
        // Update metrics
        updateMetrics({
          averageResponseTime: responseTime,
          totalRequests: (prev) => prev + 1
        });
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, [category, updateMetrics]);
  
  return { products, loading, error };
};

export const useRecommendations = (productId = null) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const data = await EcommerceAPI.getRecommendations(productId);
        setRecommendations(data.recommendations || data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecommendations();
  }, [productId]);
  
  return { recommendations, loading, error };
};

export const useSearch = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const search = useCallback(async (query) => {
    if (!query) {
      setResults([]);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const data = await EcommerceAPI.searchProducts(query);
      setResults(data.results || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  return { results, search, loading, error };
};

// React Components
export const ProductCard = ({ product }) => {
  const isPersonalized = product.personalized || product.tags?.length > 0;
  
  return (
    <div className={`product-card ${isPersonalized ? 'personalized' : ''}`}>
      <div className="product-image">
        <img src={product.image || '/placeholder.png'} alt={product.name} />
        {isPersonalized && (
          <div className="personalization-badge">For You</div>
        )}
      </div>
      
      <div className="product-info">
        <h3>{product.name || product.title}</h3>
        <p className="category">{product.category}</p>
        
        <div className="price-container">
          <span className="price">
            ${product.personalizedPrice || product.price}
          </span>
          {product.originalPrice && (
            <span className="original-price">${product.originalPrice}</span>
          )}
          {product.discount && (
            <span className="discount">-{(product.discount * 100).toFixed(0)}%</span>
          )}
        </div>
        
        {product.tags && (
          <div className="tags">
            {product.tags.map((tag, index) => (
              <span key={index} className="tag">{tag}</span>
            ))}
          </div>
        )}
        
        {product.reason && (
          <div className="recommendation-reason">{product.reason}</div>
        )}
        
        {product.personalizedScore && (
          <div className="score">
            Match: {(product.personalizedScore * 100).toFixed(0)}%
          </div>
        )}
      </div>
      
      <button className="add-to-cart">Add to Cart</button>
    </div>
  );
};

export const ProductGrid = ({ products }) => {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};

export const SearchBar = () => {
  const [query, setQuery] = useState('');
  const { search, results, loading } = useSearch();
  
  const handleSearch = (e) => {
    e.preventDefault();
    search(query);
  };
  
  return (
    <div className="search-container">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="search-input"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
      
      {results.length > 0 && (
        <div className="search-results">
          <h3>Search Results ({results.length})</h3>
          <ProductGrid products={results} />
        </div>
      )}
    </div>
  );
};

export const RecommendationSection = ({ title = "Recommended for You" }) => {
  const { recommendations, loading, error } = useRecommendations();
  
  if (loading) return <div className="loader">Loading recommendations...</div>;
  if (error) return <div className="error">Failed to load recommendations</div>;
  if (recommendations.length === 0) return null;
  
  return (
    <section className="recommendations">
      <h2>{title}</h2>
      <ProductGrid products={recommendations} />
    </section>
  );
};

export const MetricsPanel = () => {
  const { metrics, isProxyEnabled } = useProxy();
  
  if (!isProxyEnabled) return null;
  
  return (
    <div className="metrics-panel">
      <h3>Proxy Performance</h3>
      <div className="metrics-grid">
        <div className="metric">
          <span className="value">{metrics.averageResponseTime.toFixed(0)}ms</span>
          <span className="label">Avg Response</span>
        </div>
        <div className="metric">
          <span className="value">{(metrics.cacheHitRate * 100).toFixed(1)}%</span>
          <span className="label">Cache Hit Rate</span>
        </div>
        <div className="metric">
          <span className="value">{(metrics.enhancementRate * 100).toFixed(1)}%</span>
          <span className="label">AI Enhanced</span>
        </div>
        <div className="metric">
          <span className="value">{metrics.totalRequests}</span>
          <span className="label">Total Requests</span>
        </div>
      </div>
    </div>
  );
};

// Main App Component
export const App = () => {
  const [category, setCategory] = useState(null);
  const { products, loading, error } = useProducts(category);
  
  return (
    <ProxyProvider>
      <div className="app">
        <header>
          <h1>E-commerce with Edge AI Proxy</h1>
          <MetricsPanel />
        </header>
        
        <nav>
          <button onClick={() => setCategory(null)}>All Products</button>
          <button onClick={() => setCategory('electronics')}>Electronics</button>
          <button onClick={() => setCategory('clothing')}>Clothing</button>
          <button onClick={() => setCategory('home')}>Home</button>
        </nav>
        
        <SearchBar />
        
        <main>
          {loading && <div className="loader">Loading products...</div>}
          {error && <div className="error">Error: {error}</div>}
          {!loading && !error && (
            <>
              <ProductGrid products={products} />
              <RecommendationSection />
            </>
          )}
        </main>
      </div>
    </ProxyProvider>
  );
};

// Export everything for use in other components
export default {
  apiClient,
  EcommerceAPI,
  ProxyProvider,
  useProxy,
  useProducts,
  useRecommendations,
  useSearch,
  ProductCard,
  ProductGrid,
  SearchBar,
  RecommendationSection,
  MetricsPanel,
  App
};