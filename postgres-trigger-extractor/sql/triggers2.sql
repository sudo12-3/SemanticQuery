CREATE OR REPLACE FUNCTION check_value_lesser_than_4()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.value <= 4 THEN
        RETURN NULL;  -- cancel the insert
    RETURN NEW;   -- proceed with the insert
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_value
BEFORE INSERT ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_value_lesser_than_4();

CREATE TRIGGER trg_check_value_update
BEFORE UPDATE ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_value_lesser_than_4();