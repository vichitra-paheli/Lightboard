-- Create the telemetry schema
CREATE SCHEMA IF NOT EXISTS telemetry;

-- Create the application role (RLS enforced)
CREATE ROLE lightboard_app LOGIN PASSWORD 'lightboard_app_password';

-- Grant permissions on public schema
GRANT CONNECT ON DATABASE lightboard TO lightboard_app;
GRANT USAGE ON SCHEMA public TO lightboard_app;
GRANT USAGE ON SCHEMA telemetry TO lightboard_app;

-- Allow app role to use sequences (for serial/generated columns)
ALTER DEFAULT PRIVILEGES FOR ROLE lightboard_admin IN SCHEMA public
  GRANT ALL ON TABLES TO lightboard_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lightboard_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lightboard_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lightboard_admin IN SCHEMA telemetry
  GRANT ALL ON TABLES TO lightboard_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lightboard_admin IN SCHEMA telemetry
  GRANT USAGE, SELECT ON SEQUENCES TO lightboard_app;
