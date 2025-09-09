/**
 * CircuitBreaker - Fault tolerance and resilience pattern
 */

class CircuitBreaker {
  constructor(options) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    
    // Circuit states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
    this.circuits = new Map();
  }
  
  getCircuit(identifier) {
    if (!this.circuits.has(identifier)) {
      this.circuits.set(identifier, {
        state: 'CLOSED',
        failures: 0,
        lastFailure: null,
        successCount: 0,
        lastStateChange: Date.now(),
        totalRequests: 0,
        totalFailures: 0
      });
    }
    return this.circuits.get(identifier);
  }
  
  isOpen(identifier) {
    const circuit = this.getCircuit(identifier);
    
    if (circuit.state === 'OPEN') {
      // Check if we should transition to HALF_OPEN
      if (Date.now() - circuit.lastFailure > this.resetTimeout) {
        this.transitionTo(identifier, 'HALF_OPEN');
        return false;
      }
      return true;
    }
    
    return false;
  }
  
  recordSuccess(identifier) {
    const circuit = this.getCircuit(identifier);
    circuit.totalRequests++;
    
    switch (circuit.state) {
      case 'HALF_OPEN':
        circuit.successCount++;
        // Require 3 successful requests to fully close
        if (circuit.successCount >= 3) {
          this.transitionTo(identifier, 'CLOSED');
        }
        break;
        
      case 'CLOSED':
        // Reset failure count on success
        circuit.failures = 0;
        break;
    }
  }
  
  recordFailure(identifier) {
    const circuit = this.getCircuit(identifier);
    circuit.totalRequests++;
    circuit.totalFailures++;
    circuit.failures++;
    circuit.lastFailure = Date.now();
    
    switch (circuit.state) {
      case 'CLOSED':
        if (circuit.failures >= this.failureThreshold) {
          this.transitionTo(identifier, 'OPEN');
        }
        break;
        
      case 'HALF_OPEN':
        // Single failure in HALF_OPEN state reopens the circuit
        this.transitionTo(identifier, 'OPEN');
        break;
    }
  }
  
  transitionTo(identifier, newState) {
    const circuit = this.getCircuit(identifier);
    const oldState = circuit.state;
    
    circuit.state = newState;
    circuit.lastStateChange = Date.now();
    
    switch (newState) {
      case 'CLOSED':
        circuit.failures = 0;
        circuit.successCount = 0;
        console.log(`Circuit ${identifier}: ${oldState} -> CLOSED (recovered)`);
        break;
        
      case 'OPEN':
        console.warn(`Circuit ${identifier}: ${oldState} -> OPEN (failing)`);
        break;
        
      case 'HALF_OPEN':
        circuit.successCount = 0;
        console.log(`Circuit ${identifier}: ${oldState} -> HALF_OPEN (testing)`);
        break;
    }
  }
  
  getRetryAfter(identifier) {
    const circuit = this.getCircuit(identifier);
    
    if (circuit.state === 'OPEN') {
      const remaining = this.resetTimeout - (Date.now() - circuit.lastFailure);
      return Math.max(0, Math.ceil(remaining / 1000)); // Return seconds
    }
    
    return 0;
  }
  
  getHealth() {
    const health = {
      circuits: {}
    };
    
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    
    this.circuits.forEach((circuit, identifier) => {
      health.circuits[identifier] = {
        state: circuit.state,
        failures: circuit.failures,
        errorRate: circuit.totalRequests > 0 
          ? (circuit.totalFailures / circuit.totalRequests).toFixed(3)
          : 0,
        lastStateChange: new Date(circuit.lastStateChange).toISOString()
      };
      
      if (circuit.state === 'OPEN') openCircuits++;
      if (circuit.state === 'HALF_OPEN') halfOpenCircuits++;
    });
    
    health.summary = {
      totalCircuits: this.circuits.size,
      openCircuits,
      halfOpenCircuits,
      closedCircuits: this.circuits.size - openCircuits - halfOpenCircuits
    };
    
    health.status = openCircuits > this.circuits.size * 0.5 ? 'degraded' : 'healthy';
    
    return health;
  }
  
  reset(identifier) {
    if (identifier) {
      this.circuits.delete(identifier);
    } else {
      this.circuits.clear();
    }
  }
}

module.exports = CircuitBreaker;