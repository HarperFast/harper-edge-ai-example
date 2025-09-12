/**
 * Harper Components Initialization
 * Seeds tenant data from JSON into Harper cold storage
 */

import { readFileSync } from 'fs';
import { HarperTenantService } from './utils/HarperTenantService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeComponents(harperClient) {
  console.log('Initializing Harper Edge AI Components...');
  
  try {
    const tenantService = new HarperTenantService(harperClient);
    
    // Check if tenants already exist
    const existingTenants = await tenantService.getActiveTenants();
    
    if (existingTenants.length === 0) {
      console.log('No tenants found, seeding from JSON...');
      
      // Load tenants from seed file
      const tenantsPath = path.join(__dirname, 'data/seed-tenants.json');
      const tenantsData = JSON.parse(readFileSync(tenantsPath, 'utf8'));
      
      // Seed tenants into Harper
      const result = await tenantService.seedTenants(tenantsData);
      console.log(`Seeded ${result.seeded} of ${result.total} tenants`);
    } else {
      console.log(`Found ${existingTenants.length} existing tenants in Harper`);
    }
    
    // Get tenant stats
    const stats = await tenantService.getTenantStats();
    console.log('Tenant Statistics:', stats);
    
    console.log('Harper Edge AI Components initialized successfully!');
    return true;
    
  } catch (error) {
    console.error('Failed to initialize Harper components:', error);
    throw error;
  }
}