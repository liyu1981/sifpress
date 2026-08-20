-- Add optional JSON schema to key-value pairs for value validation.
-- When non-null, the schema is a JSON object describing the expected shape
-- of the value; the frontend JSON editor validates against it in real time.
ALTER TABLE kv_pairs ADD COLUMN schema_json TEXT;