/**
 * A data source option rendered in the Explore sidebar picker. Kept in a
 * dedicated module so the type can outlive the legacy `data-source-selector`
 * component that used to own it.
 */
export interface DataSourceOption {
  id: string;
  name: string;
  type: string;
  hasSchemaDoc?: boolean;
}
