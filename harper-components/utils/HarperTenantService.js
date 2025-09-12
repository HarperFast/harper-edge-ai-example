/**
 * Harper Tenant Service
 * Manages tenant configuration in Harper cold storage
 * Replaces config/tenants.json with Harper-native storage
 */

export class HarperTenantService {
  constructor(harperClient) {
    this.harper = harperClient;
    this.cache = new Map(); // In-memory cache for active tenants
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load tenants from Harper cold storage
   */
  async loadTenants() {
    try {
      const tenants = await this.harper.searchByValue('tenants', 'active', true);
      
      // Update in-memory cache
      this.cache.clear();
      tenants.forEach(tenant => {
        this.cache.set(tenant.id, {
          data: tenant,
          cachedAt: Date.now()
        });
      });

      console.log(`Loaded ${tenants.length} active tenants from Harper`);
      return tenants;
    } catch (error) {
      console.error('Error loading tenants from Harper:', error);
      throw error;
    }
  }

  /**
   * Get tenant by ID with caching
   */
  async getTenant(tenantId) {
    // Check cache first
    const cached = this.cache.get(tenantId);
    if (cached && (Date.now() - cached.cachedAt) < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const result = await this.harper.searchByHash('tenants', { id: tenantId });
      const tenant = result[0];
      
      if (tenant && tenant.active) {
        // Update cache
        this.cache.set(tenantId, {
          data: tenant,
          cachedAt: Date.now()
        });
        return tenant;
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active tenants with caching
   */
  async getActiveTenants() {
    // Check if we have fresh cached data for all tenants
    const now = Date.now();
    const allFresh = Array.from(this.cache.values()).every(
      cached => (now - cached.cachedAt) < this.cacheExpiry
    );

    if (this.cache.size > 0 && allFresh) {
      return Array.from(this.cache.values()).map(cached => cached.data);
    }

    // Reload from Harper
    return await this.loadTenants();
  }

  /**
   * Seed tenants from JSON file (development only)
   */
  async seedTenants(tenantsData) {
    console.log('Seeding tenants into Harper cold storage...');
    
    try {
      let seeded = 0;
      
      for (const tenant of tenantsData.tenants) {
        // Check if tenant already exists
        const existing = await this.harper.searchByHash('tenants', { id: tenant.id });
        
        if (existing.length === 0) {
          await this.harper.insert('tenants', {
            ...tenant,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          });
          seeded++;
          console.log(`Seeded tenant: ${tenant.id} - ${tenant.name}`);
        } else {
          console.log(`Tenant already exists: ${tenant.id}`);
        }
      }

      console.log(`Seeded ${seeded} new tenants into Harper`);
      
      // Refresh cache
      await this.loadTenants();
      
      return { seeded, total: tenantsData.tenants.length };
    } catch (error) {
      console.error('Error seeding tenants:', error);
      throw error;
    }
  }

  /**
   * Update tenant configuration
   */
  async updateTenant(tenantId, updates) {
    try {
      await this.harper.update('tenants', {
        id: tenantId,
        ...updates,
        updated_at: new Date()
      });

      // Clear from cache to force refresh
      this.cache.delete(tenantId);
      
      console.log(`Updated tenant: ${tenantId}`);
      return true;
    } catch (error) {
      console.error(`Error updating tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Create new tenant
   */
  async createTenant(tenantData) {
    try {
      const tenant = {
        ...tenantData,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.harper.insert('tenants', tenant);
      
      // Add to cache
      this.cache.set(tenant.id, {
        data: tenant,
        cachedAt: Date.now()
      });
      
      console.log(`Created tenant: ${tenant.id} - ${tenant.name}`);
      return tenant;
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw error;
    }
  }

  /**
   * Deactivate tenant
   */
  async deactivateTenant(tenantId) {
    try {
      await this.updateTenant(tenantId, { active: false });
      this.cache.delete(tenantId);
      console.log(`Deactivated tenant: ${tenantId}`);
      return true;
    } catch (error) {
      console.error(`Error deactivating tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats() {
    try {
      const [allTenants, activeTenants] = await Promise.all([
        this.harper.searchByValue('tenants', 'id', '*'),
        this.harper.searchByValue('tenants', 'active', true)
      ]);

      const inactiveTenants = allTenants.filter(t => !t.active);

      return { 
        total_tenants: allTenants.length, 
        active_tenants: activeTenants.length, 
        inactive_tenants: inactiveTenants.length 
      };
    } catch (error) {
      console.error('Error getting tenant stats:', error);
      throw error;
    }
  }

  /**
   * Clear cache (useful for development)
   */
  clearCache() {
    this.cache.clear();
    console.log('Tenant cache cleared');
  }
}

export default HarperTenantService;