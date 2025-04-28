CREATE OR REPLACE FUNCTION log_insert() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO trigger_log (table_name, operation, old_data, new_data, changed_at)
    VALUES (TG_TABLE_NAME, 'INSERT', NULL, row_to_json(NEW), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_update() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO trigger_log (table_name, operation, old_data, new_data, changed_at)
    VALUES (TG_TABLE_NAME, 'UPDATE', row_to_json(OLD), row_to_json(NEW), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_delete() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO trigger_log (table_name, operation, old_data, new_data, changed_at)
    VALUES (TG_TABLE_NAME, 'DELETE', row_to_json(OLD), NULL, NOW());
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS trigger_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_at TIMESTAMP NOT NULL
);

-- Trigger function
CREATE OR REPLACE FUNCTION insert_if_id_gt_4()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id <= 4 THEN
        -- Skip the insert by returning NULL
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for BEFORE UPDATE
CREATE OR REPLACE FUNCTION update_if_id_gt_4()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id <= 4 THEN
        -- Skip the update by returning NULL
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function
CREATE OR REPLACE FUNCTION insert_if_id_gt_5()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id > 5 THEN
        -- Skip the insert by returning NULL
        RETURN NEW;
    ELSE
        NEW.id := OLD.id;  -- Keep the old id if condition not met
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for BEFORE UPDATE
CREATE OR REPLACE FUNCTION update_if_id_gt_5()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id > 5 THEN
        -- Skip the insert by returning NULL
        RETURN NEW;
    ELSE
        NEW.id := OLD.id;  -- Keep the old id if condition not met
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_update_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_if_id_gt_4();

-- Trigger on users table
CREATE TRIGGER before_insert_users
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION insert_if_id_gt_4();

CREATE TRIGGER before_update_sample_table
BEFORE UPDATE ON sample_table
FOR EACH ROW
EXECUTE FUNCTION update_if_id_gt_5();

-- Trigger on users table
CREATE TRIGGER before_insert_sample_table
BEFORE INSERT ON sample_table
FOR EACH ROW
EXECUTE FUNCTION insert_if_id_gt_5();

CREATE TRIGGER after_insert_trigger
AFTER INSERT ON sample_table
FOR EACH ROW EXECUTE FUNCTION log_insert();

CREATE TRIGGER after_update_trigger
AFTER UPDATE ON sample_table
FOR EACH ROW EXECUTE FUNCTION log_update();

CREATE TRIGGER after_delete_trigger
AFTER DELETE ON sample_table
FOR EACH ROW EXECUTE FUNCTION log_delete();