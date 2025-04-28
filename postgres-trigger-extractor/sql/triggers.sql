CREATE OR REPLACE FUNCTION check_id_lesser_than_4()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id <= 4 THEN
        RETURN NULL;  -- cancel the insert
    RETURN NEW;   -- proceed with the insert
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_id
BEFORE INSERT ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_id_lesser_than_4();

CREATE TRIGGER trg_check_id_update
BEFORE UPDATE ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_id_lesser_than_4();


CREATE OR REPLACE FUNCTION check_id_greater_than_4()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id > 4 THEN
        RETURN NEW;  -- cancel the insert
    ELSE
        NEW.id := OLD.id;
        RETURN NULL;   -- proceed with the insert
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_id_greater_than_4_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id > 4 THEN
        RETURN NEW;  -- cancel the insert
    ELSE
        NEW.id := OLD.id;
        RETURN NULL;   -- proceed with the insert
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_id_2
BEFORE INSERT ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_id_greater_than_4();

CREATE TRIGGER trg_check_id_2_update
BEFORE UPDATE ON test_table
FOR EACH ROW
EXECUTE FUNCTION check_id_greater_than_4_update();

