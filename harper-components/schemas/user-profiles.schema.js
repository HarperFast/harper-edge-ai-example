/**
 * User Profiles Schema Definition for Harper-fabric
 * Stores user behavior data, preferences, and personalization context
 */

export const userProfilesSchema = {
  name: 'user_profiles',
  description: 'User behavior profiles and personalization data',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique profile identifier'
    },
    
    user_id: {
      type: 'string',
      required: true,
      description: 'External user identifier from the tenant system',
      validation: {
        maxLength: 100
      }
    },
    
    tenant_id: {
      type: 'string',
      required: true,
      description: 'Associated tenant identifier',
      reference: {
        table: 'tenants',
        field: 'id'
      }
    },
    
    preferences: {
      type: 'json',
      default: {},
      description: 'User preferences and settings',
      schema: {
        type: 'object',
        properties: {
          favoriteCategories: {
            type: 'array',
            items: { type: 'string' }
          },
          priceRange: {
            type: 'object',
            properties: {
              min: { type: 'number', minimum: 0 },
              max: { type: 'number', minimum: 0 }
            }
          },
          brands: {
            type: 'array',
            items: { type: 'string' }
          },
          colors: {
            type: 'array',
            items: { type: 'string' }
          },
          sizes: {
            type: 'array',
            items: { type: 'string' }
          },
          personalizeOptOut: {
            type: 'boolean',
            default: false
          },
          language: {
            type: 'string',
            default: 'en'
          },
          currency: {
            type: 'string',
            default: 'USD'
          },
          notifications: {
            type: 'object',
            properties: {
              email: { type: 'boolean', default: true },
              push: { type: 'boolean', default: false },
              sms: { type: 'boolean', default: false }
            }
          }
        }
      }
    },
    
    behavior_data: {
      type: 'json',
      default: {},
      description: 'User behavior tracking data',
      schema: {
        type: 'object',
        properties: {
          sessionCount: {
            type: 'number',
            default: 0
          },
          totalPageViews: {
            type: 'number',
            default: 0
          },
          avgSessionDuration: {
            type: 'number',
            default: 0
          },
          bounceRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          conversionRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          cartAbandonmentRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          avgOrderValue: {
            type: 'number',
            minimum: 0
          },
          purchaseFrequency: {
            type: 'number',
            minimum: 0
          },
          returnRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          clickThroughRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          searchQueries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                timestamp: { type: 'number' },
                resultsClicked: { type: 'number' }
              }
            }
          },
          categoryAffinity: {
            type: 'object',
            description: 'Category preference scores (0-1)',
            patternProperties: {
              '^[a-zA-Z0-9-_]+$': {
                type: 'number',
                minimum: 0,
                maximum: 1
              }
            }
          },
          devicePreference: {
            type: 'object',
            properties: {
              desktop: { type: 'number', minimum: 0, maximum: 1 },
              mobile: { type: 'number', minimum: 0, maximum: 1 },
              tablet: { type: 'number', minimum: 0, maximum: 1 }
            }
          }
        }
      }
    },
    
    segments: {
      type: 'json',
      default: [],
      description: 'User segmentation classifications',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            segment: {
              type: 'string',
              enum: ['premium', 'price-sensitive', 'brand-loyal', 'impulse', 'researcher', 'new-user', 'returning', 'high-value']
            },
            score: {
              type: 'number',
              minimum: 0,
              maximum: 1
            },
            assignedAt: {
              type: 'number'
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1
            }
          },
          required: ['segment', 'score']
        }
      }
    },
    
    purchase_history: {
      type: 'json',
      default: [],
      description: 'User purchase history summary',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            date: { type: 'number' },
            total: { type: 'number', minimum: 0 },
            currency: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  category: { type: 'string' },
                  brand: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  quantity: { type: 'number', minimum: 1 }
                }
              }
            },
            channel: {
              type: 'string',
              enum: ['web', 'mobile', 'app', 'store', 'phone', 'email']
            }
          },
          required: ['orderId', 'date', 'total']
        }
      }
    },
    
    session_data: {
      type: 'json',
      default: {},
      description: 'Current and recent session information',
      schema: {
        type: 'object',
        properties: {
          currentSession: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              startTime: { type: 'number' },
              lastActivity: { type: 'number' },
              pageViews: { type: 'number', default: 0 },
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    timestamp: { type: 'number' },
                    data: { type: 'object' }
                  }
                }
              },
              referrer: { type: 'string' },
              landingPage: { type: 'string' },
              exitPage: { type: 'string' }
            }
          },
          recentSessions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                startTime: { type: 'number' },
                duration: { type: 'number' },
                pageViews: { type: 'number' },
                bounced: { type: 'boolean' },
                converted: { type: 'boolean' }
              }
            }
          }
        }
      }
    },
    
    device_info: {
      type: 'json',
      default: {},
      description: 'Device and browser information',
      schema: {
        type: 'object',
        properties: {
          primaryDevice: {
            type: 'string',
            enum: ['desktop', 'mobile', 'tablet']
          },
          browsers: {
            type: 'array',
            items: { type: 'string' }
          },
          operatingSystems: {
            type: 'array',
            items: { type: 'string' }
          },
          screenResolutions: {
            type: 'array',
            items: { type: 'string' }
          },
          connectionTypes: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    
    location_data: {
      type: 'json',
      default: {},
      description: 'Geographic and location information',
      schema: {
        type: 'object',
        properties: {
          country: { type: 'string' },
          region: { type: 'string' },
          city: { type: 'string' },
          timezone: { type: 'string' },
          coordinates: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' }
            }
          },
          nearbyStores: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                storeId: { type: 'string' },
                distance: { type: 'number' },
                name: { type: 'string' }
              }
            }
          }
        }
      }
    },
    
    embeddings: {
      type: 'json',
      default: [],
      description: 'ML feature embeddings for the user',
      schema: {
        type: 'array',
        items: {
          type: 'number'
        },
        maxItems: 512
      }
    },
    
    personalization_score: {
      type: 'number',
      default: 0.5,
      validation: {
        min: 0,
        max: 1
      },
      description: 'Overall personalization effectiveness score'
    },
    
    privacy_settings: {
      type: 'json',
      default: {},
      description: 'Privacy and consent settings',
      schema: {
        type: 'object',
        properties: {
          dataCollection: { type: 'boolean', default: true },
          personalization: { type: 'boolean', default: true },
          analytics: { type: 'boolean', default: true },
          marketing: { type: 'boolean', default: false },
          thirdPartySharing: { type: 'boolean', default: false },
          consentDate: { type: 'number' },
          gdprCompliant: { type: 'boolean', default: false },
          ccpaOptOut: { type: 'boolean', default: false }
        }
      }
    },
    
    last_active: {
      type: 'timestamp',
      description: 'Last activity timestamp'
    },
    
    created_at: {
      type: 'timestamp',
      default: 'now',
      description: 'Profile creation timestamp'
    },
    
    updated_at: {
      type: 'timestamp',
      default: 'now',
      description: 'Last update timestamp'
    }
  },
  
  indexes: [
    {
      name: 'idx_user_tenant',
      fields: ['tenant_id', 'user_id'],
      unique: true,
      description: 'Unique user per tenant'
    },
    {
      name: 'idx_user_active',
      fields: ['tenant_id', 'last_active'],
      type: 'btree',
      description: 'Query active users by tenant'
    },
    {
      name: 'idx_user_segments',
      fields: ['tenant_id', 'segments'],
      type: 'gin',
      description: 'Query users by segments (JSON index)'
    },
    {
      name: 'idx_personalization_score',
      fields: ['personalization_score'],
      type: 'btree',
      description: 'Query by personalization effectiveness'
    }
  ],
  
  constraints: [
    {
      name: 'valid_personalization_score',
      type: 'check',
      expression: 'personalization_score BETWEEN 0 AND 1'
    },
    {
      name: 'valid_user_id',
      type: 'check',
      expression: 'LENGTH(user_id) > 0'
    }
  ],
  
  triggers: [
    {
      name: 'update_user_profile_timestamp',
      event: 'BEFORE UPDATE',
      action: 'SET updated_at = NOW()'
    },
    {
      name: 'update_last_active_on_session',
      event: 'BEFORE UPDATE',
      condition: 'NEW.session_data != OLD.session_data',
      action: 'SET last_active = NOW()'
    }
  ],
  
  partitioning: {
    type: 'hash',
    field: 'tenant_id',
    partitions: 8,
    description: 'Partition by tenant for better performance'
  },
  
  permissions: {
    read: ['admin', 'operator', 'analytics'],
    write: ['admin', 'operator', 'system'],
    delete: ['admin']
  }
};

/**
 * User Profile utility functions
 */
export class UserProfileManager {
  constructor(harperdb) {
    this.harperdb = harperdb;
  }

  async getOrCreateProfile(userId, tenantId) {
    try {
      // Try to find existing profile
      const existing = await this.harperdb.searchByConditions('user_profiles', [
        { search_attribute: 'user_id', search_value: userId },
        { search_attribute: 'tenant_id', search_value: tenantId }
      ]);

      if (existing && existing.length > 0) {
        return existing[0];
      }

      // Create new profile
      const newProfile = {
        id: `${tenantId}_${userId}_${Date.now()}`,
        user_id: userId,
        tenant_id: tenantId,
        preferences: {},
        behavior_data: {
          sessionCount: 0,
          totalPageViews: 0,
          avgSessionDuration: 0,
          categoryAffinity: {}
        },
        segments: [{
          segment: 'new-user',
          score: 1.0,
          assignedAt: Date.now(),
          confidence: 0.9
        }],
        purchase_history: [],
        session_data: {},
        device_info: {},
        location_data: {},
        embeddings: [],
        personalization_score: 0.5,
        privacy_settings: {
          dataCollection: true,
          personalization: true,
          analytics: true
        },
        last_active: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.harperdb.insert('user_profiles', newProfile);
      return newProfile;

    } catch (error) {
      console.error('Failed to get or create user profile:', error);
      throw error;
    }
  }

  async updateBehaviorData(userId, tenantId, behaviorUpdate) {
    try {
      const profile = await this.getOrCreateProfile(userId, tenantId);
      
      const updatedBehavior = {
        ...profile.behavior_data,
        ...behaviorUpdate
      };

      await this.harperdb.update('user_profiles', 
        { 
          behavior_data: updatedBehavior,
          updated_at: new Date(),
          last_active: new Date()
        }, 
        { user_id: userId, tenant_id: tenantId }
      );

      return updatedBehavior;
    } catch (error) {
      console.error('Failed to update behavior data:', error);
      throw error;
    }
  }

  async updateUserSegments(userId, tenantId, segments) {
    try {
      await this.harperdb.update('user_profiles', 
        { 
          segments,
          updated_at: new Date()
        }, 
        { user_id: userId, tenant_id: tenantId }
      );

      return segments;
    } catch (error) {
      console.error('Failed to update user segments:', error);
      throw error;
    }
  }

  async recordPurchase(userId, tenantId, purchaseData) {
    try {
      const profile = await this.getOrCreateProfile(userId, tenantId);
      
      const updatedHistory = [
        ...profile.purchase_history,
        {
          ...purchaseData,
          date: Date.now()
        }
      ];

      // Keep only last 100 purchases
      if (updatedHistory.length > 100) {
        updatedHistory.splice(0, updatedHistory.length - 100);
      }

      await this.harperdb.update('user_profiles', 
        { 
          purchase_history: updatedHistory,
          updated_at: new Date(),
          last_active: new Date()
        }, 
        { user_id: userId, tenant_id: tenantId }
      );

      return updatedHistory;
    } catch (error) {
      console.error('Failed to record purchase:', error);
      throw error;
    }
  }

  async updateEmbeddings(userId, tenantId, embeddings) {
    try {
      await this.harperdb.update('user_profiles', 
        { 
          embeddings,
          updated_at: new Date()
        }, 
        { user_id: userId, tenant_id: tenantId }
      );

      return embeddings;
    } catch (error) {
      console.error('Failed to update embeddings:', error);
      throw error;
    }
  }

  async getUsersBySegment(tenantId, segment, limit = 100) {
    try {
      // Get all users for tenant and filter by segment client-side
      // Harper doesn't support complex JSON querying in searchByConditions
      const allUsers = await this.harperdb.searchByValue('user_profiles', 'tenant_id', tenantId);
      
      const users = allUsers
        .filter(user => {
          if (!user.segments || !Array.isArray(user.segments)) return false;
          return user.segments.some(seg => seg.segment === segment);
        })
        .sort((a, b) => new Date(b.last_active) - new Date(a.last_active))
        .slice(0, limit);

      return users;
    } catch (error) {
      console.error('Failed to get users by segment:', error);
      return [];
    }
  }

  async getActiveUsers(tenantId, hoursBack = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
      
      const users = await this.harperdb.searchByConditions('user_profiles', [
        { search_attribute: 'tenant_id', search_value: tenantId },
        { search_attribute: 'last_active', search_type: 'greater_than', search_value: cutoffTime }
      ]);
      
      // Sort by last_active descending
      users.sort((a, b) => new Date(b.last_active) - new Date(a.last_active));

      return users;
    } catch (error) {
      console.error('Failed to get active users:', error);
      return [];
    }
  }
}