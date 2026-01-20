# Harper AI Ops Framework - Complete Design

> ⚠️ **DESIGN DOCUMENT - NOT IMPLEMENTED**
>
> This document describes the planned architecture for the complete Harper AI Ops Framework.
> **These features are designed but NOT yet implemented.**
>
> **For current capabilities**, see [README.md](../../README.md)
>
> **Implementation status:**
>
> - ✅ Phase 0: Multi-backend inference (COMPLETE - see README)
> - ❌ Milestone A: Monitoring & Observability (DESIGN ONLY)
> - ❌ Milestone C: Training & Validation (DESIGN ONLY)
> - ❌ Milestone B: Feature Store (NOT STARTED)
> - ❌ Milestone D: Deployment Orchestration (NOT STARTED)

**Status:** Design Phase - Milestones A & C Complete
**Created:** January 2025
**Last Updated:** January 2025

---

## Executive Summary

This document describes the complete design of the Harper AI Ops Framework - a production-grade AI operations platform built on HarperDB. The framework provides end-to-end capabilities for deploying, monitoring, training, and managing machine learning models in production environments.

**Current State:** Minimal viable foundation completed

- ✅ Multi-backend inference (ONNX, TensorFlow.js, Transformers.js, Ollama)
- ✅ Basic inference telemetry (InferenceEvent tracking)
- ✅ Performance benchmarking system

**Target State:** Full production AI pipeline with automated operations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Production Inferencing                     │
│              (Edge Devices, APIs, Services)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Inference Events, Metrics, Feedback
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                Harper AI Ops Cluster                         │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────────────────┐ │
│  │  Monitoring &      │  │  Training & Validation         │ │
│  │  Observability     │  │                                │ │
│  │  - Metrics         │  │  - Model Training              │ │
│  │  - Drift Detection │  │  - Experiment Tracking         │ │
│  │  - Alerting        │  │  - Validation & Promotion      │ │
│  │  - Retraining      │  │  - Model Registry              │ │
│  │    Triggers        │  │                                │ │
│  └────────────────────┘  └────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────────────────┐ │
│  │  Core Data &       │  │  Deployment & Orchestration    │ │
│  │  Services          │  │                                │ │
│  │  - Feature Store   │  │  - Model CI/CD                 │ │
│  │  - Data Processing │  │  - Automated Deployment        │ │
│  │  - Feature Eng.    │  │  - Canary Releases             │ │
│  │  - Data Sources    │  │  - A/B Testing                 │ │
│  └────────────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                     ↓                        ↑
            ┌────────────────┐      ┌────────────────┐
            │  BigQuery      │      │  Public Model  │
            │  Data Warehouse│      │  Repositories  │
            └────────────────┘      └────────────────┘
```

---

## Implementation Roadmap

### Milestone A: Monitoring & Observability (DESIGNED)

**Status:** Design Complete, Ready for Implementation

Complete production monitoring with performance tracking, drift detection, alerting, and automated retraining triggers.

**Deliverables:**

- Time-series metrics aggregation (5min/hourly/daily rollups)
- Real-time performance monitoring with sliding windows
- Multi-type drift detection (input, prediction, concept)
- Configurable alert rules with severity levels
- Automated retraining triggers with approval workflow
- Data quality metrics tracking

### Milestone C: Training & Validation (DESIGNED)

**Status:** Design Complete, Ready for Implementation

Model training orchestration with experiment tracking, validation, and lifecycle management.

**Deliverables:**

- Dual version system (source version + internal deployment version)
- Training job orchestration with queue processing
- In-process training for simple models
- External worker integration (stubbed initially)
- Automated validation with success criteria
- Model promotion workflow (candidate → staging → production)
- Training experiment tracking with per-epoch metrics

### Milestone B: Core Data & Services (PLANNED)

**Status:** Not Yet Designed

Feature engineering, data processing pipelines, and feature store integration.

**Planned Capabilities:**

- Feature store with versioning
- Data preprocessing pipelines
- Feature engineering transformations
- Data source connectors (BigQuery, S3, etc.)
- Feature serving for real-time inference

### Milestone D: Deployment & Orchestration (PLANNED)

**Status:** Not Yet Designed

CI/CD pipelines for model deployment with canary releases and A/B testing.

**Planned Capabilities:**

- Model deployment automation
- Canary release strategies
- A/B testing framework
- Rollback mechanisms
- Deployment health checks

---

## Milestone A: Monitoring & Observability

### Design Principles

1. **Data-First Approach** - Capture all metrics in Harper tables before building dashboards
2. **Hybrid Aggregation** - Real-time sliding windows + scheduled batch aggregation
3. **Comprehensive Drift Detection** - Input, prediction, and concept drift
4. **Configurable with Sensible Defaults** - Global defaults with per-model overrides
5. **Manual Approval for Retraining** - Automated detection, manual approval workflow

### Data Model

#### ModelMetrics Table

```graphql
type ModelMetrics @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	periodStart: Long @indexed
	periodEnd: Long
	granularity: String @indexed # "5min" | "hourly" | "daily"
	# Performance Metrics
	requestCount: Int
	avgLatency: Float
	p50Latency: Float
	p95Latency: Float
	p99Latency: Float
	maxLatency: Float
	errorRate: Float
	errorCount: Int
	throughputPerSecond: Float
}
```

**Purpose:** Time-series performance metrics with multiple granularities for efficient querying.

**Indexing Strategy:**

- Query by model + time range: `(modelName, periodStart)`
- Query by granularity: `(granularity, periodStart)`

---

#### DriftMetrics Table

```graphql
type DriftMetrics @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	timestamp: Long @indexed

	driftType: String @indexed # "input" | "prediction" | "concept"
	featureName: String # Null for prediction/concept drift
	driftScore: Float # Magnitude of drift (0-1)
	driftMethod: String # "ks_test" | "chi_square" | "psi" | "accuracy_drop"
	pValue: Float # Statistical significance (for tests)
	# Distribution snapshots
	baseline: String # JSON-encoded baseline distribution
	current: String # JSON-encoded current distribution
}
```

**Purpose:** Track all types of drift with statistical measures.

**Drift Types:**

- **Input Drift** - Feature distribution changes (KS test for numeric, chi-square for categorical)
- **Prediction Drift** - Output distribution changes (PSI - Population Stability Index)
- **Concept Drift** - Input-output relationship changes (requires ground truth labels)

---

#### DataQualityMetrics Table

```graphql
type DataQualityMetrics @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	timestamp: Long @indexed

	totalRecords: Int
	schemaViolations: Int
	nullRates: String # JSON: {"feature1": 0.05, "feature2": 0.02}
	outlierCounts: String # JSON: {"feature1": 12, "feature2": 5}
	valueRangeViolations: Int
	categoricalUnknowns: String # JSON: {"category_feature": ["unknown_val1", "unknown_val2"]}
}
```

**Purpose:** Track data quality issues that may indicate drift or upstream problems.

---

#### AlertEvent Table

```graphql
type AlertEvent @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	timestamp: Long @indexed

	alertType: String @indexed # "latency" | "error_rate" | "drift" | "data_quality"
	severity: String @indexed # "critical" | "warning" | "info"
	condition: String # Human-readable condition (e.g., "p95Latency > 500ms")
	actualValue: Float
	threshold: Float
	message: String

	# Acknowledgment tracking
	acknowledged: Boolean
	acknowledgedBy: String # Optional userId or "system"
	acknowledgedAt: Long
}
```

**Purpose:** Record all triggered alerts with acknowledgment workflow.

---

#### RetrainingRequest Table

```graphql
type RetrainingRequest @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	requestedAt: Long @indexed

	triggerReason: String @indexed # "drift_detected" | "error_rate_threshold" | "scheduled" | "manual"
	triggerDetails: String # JSON with context (alertId, drift scores, etc.)
	status: String @indexed # "pending_approval" | "approved" | "rejected" | "completed"
	reviewedBy: String # Optional userId
	reviewedAt: Long
	trainingJobId: String # Link to TrainingRun when approved
}
```

**Purpose:** Queue retraining requests with approval workflow and safety checks.

**Safety Conditions:**

- Minimum days between retraining attempts
- Minimum number of new labeled samples required
- Prevents retraining storms

---

#### AlertRule Table

```graphql
type AlertRule @table @export {
	id: ID @primaryKey
	ruleName: String
	modelName: String @indexed # Null for global rules
	modelVersion: String # Null for global rules
	enabled: Boolean @indexed

	alertType: String @indexed
	condition: String # JSON-encoded condition logic
	severity: String
	notificationChannels: String # JSON array of channels (future: email, slack, webhook)
}
```

**Purpose:** Define alert rules with flexible conditions.

**Example Conditions:**

```json
{
	"metric": "p95Latency",
	"operator": ">",
	"threshold": 500,
	"windowMinutes": 5
}
```

```json
{
	"metric": "driftScore",
	"driftType": "input",
	"operator": ">",
	"threshold": 0.3
}
```

---

#### MonitoringConfig Table

```graphql
type MonitoringConfig @table @export {
	modelName: String @primaryKey # Null for global defaults
	modelVersion: String
	config: String # JSON configuration
}
```

**Purpose:** Per-model monitoring configuration with global fallback.

**Example Config:**

```json
{
	"aggregation": {
		"hourlyAggregation": "1h",
		"dailyAggregation": "24h",
		"driftCheck": "6h",
		"dataQualityCheck": "1h"
	},
	"drift": {
		"inputDrift": {
			"enabled": true,
			"method": "ks_test",
			"threshold": 0.05,
			"windowHours": 24
		},
		"predictionDrift": {
			"enabled": true,
			"method": "psi",
			"threshold": 0.2,
			"windowHours": 24
		},
		"conceptDrift": {
			"enabled": true,
			"minLabeledSamples": 100,
			"accuracyDropThreshold": 0.05
		}
	},
	"retrainingTriggers": {
		"enabled": true,
		"minDaysBetweenRetraining": 7,
		"minNewLabeledSamples": 500,
		"conditions": [
			{
				"type": "drift",
				"driftTypes": ["input", "concept"],
				"threshold": 0.3
			},
			{
				"type": "error_rate",
				"threshold": 0.1
			}
		]
	}
}
```

**Duration Strings:** Human-readable intervals (e.g., "5m", "1h", "6h", "24h") instead of cron expressions for better usability.

---

### Component Architecture

#### 1. MonitoringBackend (Extended)

**Location:** `src/core/monitoring/MonitoringBackend.js`

**Current Responsibilities:**

- Record inference events to InferenceEvent table

**New Responsibilities:**

- Maintain real-time sliding windows (5-minute in-memory buffers)
- Periodic flush to ModelMetrics table
- Expose real-time metrics via API

**Key Methods:**

```javascript
class MonitoringBackend {
  async recordInference(event)      // Existing + real-time update
  updateRealTimeMetrics(event)      // NEW: Update sliding windows
  async flushRealTimeMetrics()      // NEW: Periodic flush to DB
  async getRealTimeMetrics(modelKey) // NEW: Query in-memory metrics
}
```

---

#### 2. DriftDetector

**Location:** `src/core/monitoring/DriftDetector.js`

**Responsibilities:**

- Detect input, prediction, and concept drift
- Run statistical tests (KS test, chi-square, PSI)
- Write DriftMetrics records
- Compare against baseline distributions

**Key Methods:**

```javascript
class DriftDetector {
  async detectDrift(modelName, modelVersion, config)
  async detectInputDrift(modelName, modelVersion, baseline, recent)
  async detectPredictionDrift(modelName, modelVersion, baseline, recent)
  async detectConceptDrift(modelName, modelVersion, baseline, recent)
}
```

**Statistical Tests:**

- **Kolmogorov-Smirnov (KS) Test** - Numeric features
- **Chi-Square Test** - Categorical features
- **Population Stability Index (PSI)** - Prediction distributions
- **Accuracy Drop Detection** - Concept drift (requires labels)

---

#### 3. AlertEvaluator

**Location:** `src/core/monitoring/AlertEvaluator.js`

**Responsibilities:**

- Evaluate enabled AlertRule records
- Query recent metrics and compare to thresholds
- Create AlertEvent records when triggered
- Check retraining trigger conditions
- Create RetrainingRequest records with safety checks

**Key Methods:**

```javascript
class AlertEvaluator {
  async evaluateRules()
  async evaluateRule(rule)
  async checkCondition(metrics, condition)
  async createAlert(rule, metrics)
  async checkRetrainingTrigger(rule)
}
```

**Retraining Safety Checks:**

- Minimum days since last retraining
- Minimum new labeled samples available
- Prevents cascading retraining requests

---

#### 4. AggregationJobs

**Location:** `src/core/monitoring/AggregationJobs.js`

**Responsibilities:**

- Schedule periodic aggregation jobs
- Aggregate InferenceEvent records into ModelMetrics
- Trigger drift detection checks
- Trigger data quality checks

**Key Methods:**

```javascript
class AggregationJobs {
  async start()                    // Start scheduled jobs
  async aggregateHourly()
  async aggregateDaily()
  async runDriftDetection()
  async runDataQualityCheck()
}
```

**Job Scheduler:** Uses duration strings ("5m", "1h", "6h") parsed into milliseconds for `setInterval`.

---

### Aggregation Strategy

**Hybrid Approach:**

1. **Real-Time (In-Memory):**
   - Sliding 5-minute windows per model
   - Updated on every inference event
   - Provides immediate visibility via API
   - Periodically flushed to ModelMetrics table

2. **Scheduled Batch:**
   - Hourly aggregation: Compute from InferenceEvent table
   - Daily aggregation: Compute from hourly ModelMetrics
   - Reduces query load for historical analysis
   - Enables efficient time-range queries

**Benefits:**

- Real-time visibility without database load
- Historical analysis with pre-aggregated data
- Efficient storage (rollups vs. raw events)

---

### API Endpoints

**Metrics:**

- `GET /monitoring/metrics/{modelName}?granularity=5min&from={timestamp}&to={timestamp}`
- `GET /monitoring/metrics/{modelName}/realtime` - Current sliding window

**Drift:**

- `GET /monitoring/drift/{modelName}?from={timestamp}&to={timestamp}`
- `POST /monitoring/drift/{modelName}/check` - Trigger drift detection

**Alerts:**

- `GET /monitoring/alerts?modelName={name}&severity={level}`
- `POST /monitoring/alerts/{alertId}/acknowledge`

**Retraining:**

- `GET /monitoring/retraining-requests?status={status}`
- `POST /monitoring/retraining-requests/{requestId}/approve`
- `POST /monitoring/retraining-requests/{requestId}/reject`

---

## Milestone C: Training & Validation

### Design Principles

1. **Dual Version System** - Source version (from user/HuggingFace) + internal deployment version
2. **Semantic Versioning with Stages** - candidate → staging → production → archived
3. **Training as Code** - Training recipes stored in model metadata
4. **Hybrid Execution** - In-process for simple models, external workers for complex/GPU models
5. **Experiment Tracking** - Full metrics history per training run
6. **Validation-First** - Models must pass validation before promotion

### Data Model

#### TrainingRun Table

```graphql
type TrainingRun @table @export {
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed
	deploymentVersion: Int # Internal version number this run targets
	status: String @indexed # "queued" | "running" | "validating" | "completed" | "failed"
	trainingType: String # "initial" | "retrain" | "finetune"
	# Trigger tracking
	triggeredBy: String # "user" | "drift-alert" | "scheduled" | "retraining-request"
	triggerReference: String # userId, alertId, requestId, etc.
	# Configuration
	trainingConfig: String # JSON: hyperparameters, script path, etc.
	datasetStats: String # JSON: training/validation/test split sizes
	# Results
	trainingMetrics: String # JSON: per-epoch metrics
	validationMetrics: String # JSON: final validation results
	testMetrics: String # JSON: final test results (optional)
	validationPassed: Boolean
	failureReason: String

	# Timing
	startedAt: Long @indexed
	completedAt: Long
	durationSeconds: Int
}
```

**Purpose:** Track all training experiments with full context and metrics.

---

#### Extended Model Table

```graphql
type Model @table @export {
	# Existing fields
	id: ID @primaryKey
	modelName: String @indexed
	modelVersion: String @indexed # Source version (from user/HuggingFace)
	framework: String @indexed
	stage: String @indexed # "candidate" | "staging" | "production" | "archived"
	modelBlob: Blob
	inputSchema: String
	outputSchema: String
	metadata: String
	uploadedAt: Long @createdTime

	# NEW: Deployment tracking
	deploymentVersion: Int @indexed # Internal version counter
	trainingRunId: String # Link to TrainingRun that produced this
	parentDeploymentVersion: Int # Previous production version (for rollback)
	promotedAt: Long
	promotedBy: String # Optional userId
}
```

**Version Strategy:**

- `modelVersion` - External/source version (e.g., "v1", "v2", "bert-base-uncased")
- `deploymentVersion` - Internal counter (1, 2, 3, ...) for lifecycle tracking
- Allows multiple deployment versions per modelVersion (retraining iterations)

**Example:**

- `sentiment-analyzer:v1` (source version)
  - deploymentVersion: 1 (initial upload) - stage: production
  - deploymentVersion: 2 (retrained) - stage: candidate
  - deploymentVersion: 3 (retrained again) - stage: staging
  - deploymentVersion: 4 (promoted) - stage: production

---

### Component Architecture

#### 1. TrainingOrchestrator

**Location:** `src/core/training/TrainingOrchestrator.js`

**Responsibilities:**

- Poll TrainingRun table for queued jobs
- Execute training (in-process or external worker)
- Run validation and create new Model records
- Update TrainingRun status throughout lifecycle

**Key Methods:**

```javascript
class TrainingOrchestrator {
  async processQueue()                    // Poll for queued jobs
  async runInProcess(run, config)         // Execute in-process training
  async runExternalWorker(run, config)    // Submit to external worker (STUBBED)
  async validateModel(model, data, criteria)
  async createModelVersion(run, modelBlob, metrics)
}
```

**Job Lifecycle:**

```
queued → running → validating → completed/failed
```

---

#### 2. In-Process Training

**Pattern:** Dynamic module loading

Training scripts are stored as JavaScript modules and loaded dynamically:

```javascript
// Training recipe in model metadata:
{
  "trainingConfig": {
    "type": "in-process",
    "script": "./training-scripts/sentiment-classifier-train.js",
    "hyperparameters": {
      "epochs": 10,
      "learningRate": 0.001,
      "batchSize": 32
    },
    "successCriteria": {
      "minAccuracy": 0.85,
      "minF1Score": 0.80
    }
  }
}

// Training script interface:
export async function train({ trainingData, validationData, hyperparameters }) {
  // Train model
  // Return { model: modelBlob, metrics: { loss, accuracy, ... } }
}
```

**Supported Use Cases:**

- Simple TensorFlow.js models
- ONNX model conversion/optimization
- Lightweight fine-tuning

---

#### 3. External Worker Integration (STUBBED)

**Pattern:** REST API job submission with callbacks

For complex models requiring GPU or Python frameworks (PyTorch, etc.):

**Job Submission:**

```http
POST https://training-workers.example.com/jobs
Content-Type: application/json

{
  "jobId": "uuid-from-harper",
  "modelName": "my-model",
  "modelVersion": "v1",
  "framework": "pytorch",
  "trainingScript": "s3://bucket/train.py",
  "hyperparameters": {
    "epochs": 10,
    "lr": 0.001
  },
  "dataSource": {
    "type": "harper-table",
    "connectionString": "https://harper.example.com",
    "query": "SELECT * FROM InferenceEvent WHERE modelName='my-model'"
  },
  "callbackUrl": "https://harper.example.com/training/callbacks"
}
```

**Worker Callbacks:**

- `POST /training/callbacks/progress` - Training progress updates
- `POST /training/callbacks/complete` - Job completion with model artifact URL
- `POST /training/callbacks/failed` - Job failure with error details

**Initial Release:** Stubbed with console.log, returns "not yet implemented"

---

#### 4. Model Promotion Workflow

**Stages:** candidate → staging → production → archived

**Promotion Rules:**

- `candidate → staging`: Validation passed
- `staging → production`: Manual approval with review
- `production → archived`: When replaced by new production version

**Rollback Support:**

- `parentDeploymentVersion` tracks previous production version
- Can instantly rollback by re-promoting parent version

**Promotion Tracking:**

```javascript
await tables.Model.put({
	...existingModel,
	stage: 'production',
	promotedAt: Date.now(),
	promotedBy: 'user-123',
});
```

---

### API Endpoints

**Training Jobs:**

- `POST /training/jobs` - Create new training job
- `GET /training/jobs/{jobId}` - Get job status
- `GET /training/jobs?modelName={name}&status={status}` - List jobs
- `POST /training/jobs/{jobId}/cancel` - Cancel running job

**Model Promotion:**

- `POST /models/{modelName}/{modelVersion}/promote` - Promote to next stage
- `GET /models/{modelName}/versions` - List all deployment versions
- `GET /models/{modelName}/active` - Get current production version

**Validation Results:**

- `GET /training/jobs/{jobId}/metrics` - Detailed metrics
- `GET /models/{modelName}/validation-history` - Historical results

**External Worker Callbacks (STUBBED):**

- `POST /training/callbacks/progress`
- `POST /training/callbacks/complete`
- `POST /training/callbacks/failed`

---

### Training-to-Monitoring Integration

**Flow:**

1. **Drift Alert** → Creates `RetrainingRequest` (status: pending_approval)
2. **Manual Approval** → Creates `TrainingRun` (status: queued)
3. **Training Completes** → Creates new `Model` record (stage: candidate)
4. **Validation Passes** → Can promote to staging
5. **Staging Testing** → Manual promotion to production
6. **Production Deployment** → MonitoringBackend tracks new version metrics

**Linkage:**

- `RetrainingRequest.trainingJobId` → `TrainingRun.id`
- `TrainingRun.id` → `Model.trainingRunId`
- `Model.parentDeploymentVersion` → Previous `Model.deploymentVersion`

---

## Milestone B: Core Data & Services (NOT YET DESIGNED)

**Planned Capabilities:**

- Feature store with time-travel queries
- Data preprocessing pipelines
- Feature engineering transformations
- Data source connectors (BigQuery, S3, Harper tables)
- Feature serving for real-time inference
- Feature drift detection (integrated with Monitoring)

**Open Questions:**

- Online vs. offline feature store?
- Feature versioning strategy?
- Feature computation: push vs. pull model?
- Integration with external data warehouses?

---

## Milestone D: Deployment & Orchestration (NOT YET DESIGNED)

**Planned Capabilities:**

- Model deployment automation
- Canary release strategies (gradual rollout)
- A/B testing framework (traffic splitting)
- Rollback mechanisms (instant revert)
- Deployment health checks (automated validation)
- CI/CD pipeline integration

**Open Questions:**

- Deployment targets (edge devices, cloud APIs, serverless)?
- Traffic routing strategy?
- Health check criteria?
- Integration with existing CI/CD tools?

---

## Implementation Guidelines

### Phase 1: Milestone A - Monitoring & Observability

**Week 1: Data Model & Real-Time Metrics**

1. Add new tables to `schema.graphql`
2. Extend MonitoringBackend with sliding windows
3. Implement metrics flushing
4. Add real-time metrics API endpoints
5. Write unit tests for metric calculation

**Week 2: Aggregation & Drift Detection**

1. Implement AggregationJobs with duration string parsing
2. Implement DriftDetector with statistical tests
3. Add drift detection API endpoints
4. Write unit tests for drift detection algorithms

**Week 3: Alerting & Retraining Triggers**

1. Implement AlertEvaluator
2. Implement AlertRule evaluation logic
3. Add retraining trigger safety checks
4. Add alert and retraining API endpoints
5. Write integration tests

**Week 4: Testing & Documentation**

1. End-to-end testing with real models
2. Performance testing (aggregation jobs, drift detection)
3. API documentation
4. User guide for configuring monitoring

### Phase 2: Milestone C - Training & Validation

**Week 1: Data Model & Training Orchestrator**

1. Add TrainingRun table and extend Model table
2. Implement TrainingOrchestrator job queue
3. Implement model version management
4. Write unit tests for version logic

**Week 2: In-Process Training**

1. Implement in-process training execution
2. Create training script interface specification
3. Implement validation and success criteria checking
4. Write unit tests with mock training scripts

**Week 3: Model Promotion & API**

1. Implement promotion workflow
2. Add training API endpoints
3. Integrate with RetrainingRequest (Milestone A)
4. Write integration tests

**Week 4: Testing & Documentation**

1. End-to-end training workflow testing
2. Training recipe examples
3. API documentation
4. User guide for model training and promotion

---

## Success Criteria

### Milestone A:

- ✅ All monitoring tables created and populated
- ✅ Real-time metrics available via API
- ✅ Drift detection runs on schedule and detects known drift patterns
- ✅ Alerts trigger based on thresholds
- ✅ Retraining requests created with proper safety checks
- ✅ 100% test coverage on metric calculations and drift detection

### Milestone C:

- ✅ Training jobs execute successfully (in-process)
- ✅ Validation criteria enforced before promotion
- ✅ Model lifecycle stages work correctly
- ✅ Training metrics persisted and queryable
- ✅ Integration with retraining requests functional
- ✅ External worker API stubbed with clear documentation

---

## Technology Stack

**Core:**

- HarperDB (database, GraphQL schema, REST API)
- Node.js (backend runtime)
- Harper's native table operations

**Monitoring:**

- Statistical libraries for drift detection (need to select)
- In-memory data structures for sliding windows

**Training:**

- TensorFlow.js (in-process training)
- ONNX Runtime (model conversion)
- External: PyTorch, scikit-learn (via worker API - stubbed)

**Testing:**

- Node.js native test runner
- Mock inference data generators
- Statistical test validation

---

## Security Considerations

**Current State:**

- No authentication in place
- Optional userId fields support future auth integration

**Future Requirements:**

- User authentication for retraining approval
- Model access controls (who can deploy/promote)
- API key management for external workers
- Audit logging for all model lifecycle changes

---

## Performance Considerations

**Monitoring:**

- Sliding windows limited to 5 minutes to control memory
- Aggregation jobs run on schedule, not real-time
- Indexed fields for efficient time-range queries

**Training:**

- In-process training limited to models that fit in memory
- External workers for GPU-intensive training
- Training queue to prevent resource contention

**Drift Detection:**

- Statistical tests optimized for incremental computation
- Baseline distributions cached in memory
- Configurable detection frequency

---

## Future Enhancements

**Monitoring:**

- Anomaly detection (ML-based, not just thresholds)
- Multi-model correlation analysis
- Predictive alerting (forecast issues before they occur)

**Training:**

- AutoML for hyperparameter tuning
- Federated learning support
- Multi-stage training pipelines

**General:**

- Web UI for monitoring dashboards
- Slack/email notification integrations
- Cost tracking and optimization recommendations

---

## References

- [Harper Documentation](https://docs.harperdb.io/)
- [Model Metadata Standard](../MODEL_METADATA.md)
- [Benchmarking Guide](../BENCHMARKING.md)
- Statistical Drift Detection Methods (TBD)
- Training Recipe Specification (TBD)

---

## Change Log

**January 2025:**

- Initial design document created
- Milestone A (Monitoring & Observability) designed
- Milestone C (Training & Validation) designed
- Milestones B and D planned but not yet designed
