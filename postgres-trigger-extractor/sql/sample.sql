-- Create a sample table
CREATE TABLE test_table (
    id SERIAL PRIMARY KEY,
    name TEXT,
    value INT,
    created_at TIMESTAMP
);

-- Insert 10 million rows
INSERT INTO test_table (name, value, created_at)
SELECT
    md5(random()::text),  -- random string
    (random() * 1000)::int, -- random value
    NOW() - (random() * interval '365 days')
FROM generate_series(1, 10000000) AS s(i);
