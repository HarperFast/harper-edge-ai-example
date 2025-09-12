/**
 * TenantValidator - Validates tenant configurations
 */

export class TenantValidator {
  constructor() {
    this.requiredFields = ['id', 'name', 'baseUrl'];
    this.validResponseFormats = ['standard', 'nested'];
    this.validPricingStrategies = ['optimize-conversion', 'optimize-margin', 'optimize-revenue'];
    this.validPersonalizationTypes = [
      'product-listing',
      'product-recommendations', 
      'search-results',
      'dynamic-pricing',
      'content-personalization',
      'user-segmentation'
    ];
  }

  async validate(tenantData) {
    const errors = [];

    // Check required fields
    for (const field of this.requiredFields) {
      if (!tenantData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate ID format
    if (tenantData.id && !/^[a-zA-Z0-9-_]+$/.test(tenantData.id)) {
      errors.push('Tenant ID must contain only alphanumeric characters, hyphens, and underscores');
    }

    // Validate URL format
    if (tenantData.baseUrl) {
      try {
        new URL(tenantData.baseUrl);
      } catch {
        errors.push(`Invalid baseUrl: ${tenantData.baseUrl}`);
      }
    }

    // Validate response format
    if (tenantData.responseFormat && 
        !this.validResponseFormats.includes(tenantData.responseFormat)) {
      errors.push(`Invalid responseFormat. Must be one of: ${this.validResponseFormats.join(', ')}`);
    }

    // Validate pricing strategy
    if (tenantData.pricingStrategy && 
        !this.validPricingStrategies.includes(tenantData.pricingStrategy)) {
      errors.push(`Invalid pricingStrategy. Must be one of: ${this.validPricingStrategies.join(', ')}`);
    }

    // Validate numeric ranges
    if (tenantData.recommendationLimit !== undefined) {
      if (typeof tenantData.recommendationLimit !== 'number' || 
          tenantData.recommendationLimit < 1 || 
          tenantData.recommendationLimit > 100) {
        errors.push('recommendationLimit must be a number between 1 and 100');
      }
    }

    if (tenantData.personalizationBoost !== undefined) {
      if (typeof tenantData.personalizationBoost !== 'number' || 
          tenantData.personalizationBoost < 0.1 || 
          tenantData.personalizationBoost > 5.0) {
        errors.push('personalizationBoost must be a number between 0.1 and 5.0');
      }
    }

    if (tenantData.maxDiscount !== undefined) {
      if (typeof tenantData.maxDiscount !== 'number' || 
          tenantData.maxDiscount < 0 || 
          tenantData.maxDiscount > 1) {
        errors.push('maxDiscount must be a number between 0 and 1');
      }
    }

    // Validate endpoints
    if (tenantData.endpoints) {
      if (!Array.isArray(tenantData.endpoints)) {
        errors.push('endpoints must be an array');
      } else {
        tenantData.endpoints.forEach((endpoint, index) => {
          const endpointErrors = this.validateEndpoint(endpoint, index);
          errors.push(...endpointErrors);
        });
      }
    }

    // Validate category weights
    if (tenantData.categoryWeights) {
      if (typeof tenantData.categoryWeights !== 'object') {
        errors.push('categoryWeights must be an object');
      } else {
        Object.entries(tenantData.categoryWeights).forEach(([category, weight]) => {
          if (typeof weight !== 'number' || weight < 0 || weight > 10) {
            errors.push(`categoryWeights.${category} must be a number between 0 and 10`);
          }
        });
      }
    }

    // Validate rate limits
    if (tenantData.rateLimits) {
      const rateLimitErrors = this.validateRateLimits(tenantData.rateLimits);
      errors.push(...rateLimitErrors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateEndpoint(endpoint, index) {
    const errors = [];
    const prefix = `endpoints[${index}]`;

    if (!endpoint.name) {
      errors.push(`${prefix}.name is required`);
    }

    if (!endpoint.pattern) {
      errors.push(`${prefix}.pattern is required`);
    } else {
      // Validate regex pattern
      try {
        new RegExp(endpoint.pattern);
      } catch {
        errors.push(`${prefix}.pattern is not a valid regex: ${endpoint.pattern}`);
      }
    }

    if (endpoint.cacheTTL !== undefined) {
      if (typeof endpoint.cacheTTL !== 'number' || endpoint.cacheTTL < 0) {
        errors.push(`${prefix}.cacheTTL must be a non-negative number`);
      }
    }

    if (endpoint.personalization) {
      if (typeof endpoint.personalization !== 'object') {
        errors.push(`${prefix}.personalization must be an object`);
      } else {
        if (endpoint.personalization.type && 
            !this.validPersonalizationTypes.includes(endpoint.personalization.type)) {
          errors.push(`${prefix}.personalization.type must be one of: ${this.validPersonalizationTypes.join(', ')}`);
        }
      }
    }

    return errors;
  }

  validateRateLimits(rateLimits) {
    const errors = [];

    if (typeof rateLimits !== 'object') {
      errors.push('rateLimits must be an object');
      return errors;
    }

    const validFields = ['requestsPerSecond', 'requestsPerMinute', 'requestsPerHour'];
    
    Object.entries(rateLimits).forEach(([field, value]) => {
      if (!validFields.includes(field)) {
        errors.push(`rateLimits.${field} is not a valid rate limit field`);
      } else if (typeof value !== 'number' || value < 1) {
        errors.push(`rateLimits.${field} must be a positive number`);
      }
    });

    return errors;
  }
}