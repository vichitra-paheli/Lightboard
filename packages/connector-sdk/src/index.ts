export { ConnectorRegistry, defaultRegistry, type ConnectorFactory } from './registry';
export { connectorConfigSchema, poolConfigSchema, postgresConnectionSchema } from './schemas';
export type {
  ArrowRecordBatch,
  ArrowResult,
  ColumnMetadata,
  Connector,
  ConnectorCapabilities,
  ConnectorConfig,
  HealthCheckResult,
  JsonResult,
  QueryOptions,
  RelationshipMetadata,
  SchemaMetadata,
  TableMetadata,
} from './types';
