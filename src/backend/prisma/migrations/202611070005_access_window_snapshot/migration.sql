-- Snapshot the catalogue access window for all registration callers, including
-- callers written before check-in was introduced. Existing purchases are unchanged.
CREATE FUNCTION fithub_capture_access_window() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT "accessWindow" INTO NEW."accessWindowSnapshot" FROM "Package" WHERE "id"=NEW."packageId";
  RETURN NEW;
END $$;
CREATE TRIGGER "membership_capture_access_window" BEFORE INSERT ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION fithub_capture_access_window();
