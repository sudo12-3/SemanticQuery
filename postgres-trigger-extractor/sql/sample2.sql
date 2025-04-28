-- Insert into users
INSERT INTO users (name, email)
SELECT 
    'User_' || g,
    'user_' || g || '@example.com'
FROM generate_series(1, 10000000) AS g;


-- Insert into orders
INSERT INTO orders (user_id, product_name, quantity, order_date)
SELECT 
    (g % 10000000) + 1,            -- ensure user_id between 1 and 10 million
    'Product_' || (g % 1000),       -- simulate 1000 products
    (g % 10) + 1,                   -- quantity between 1 and 10
    NOW() - (g % 1000) * INTERVAL '1 day'
FROM generate_series(1, 10000000) AS g;


-- Insert into sample_table
INSERT INTO sample_table (name, description, created_at)
SELECT 
    'Sample_' || g,
    'Description for sample ' || g,
    NOW() - (g % 500) * INTERVAL '1 day'
FROM generate_series(1, 10000000) AS g;
