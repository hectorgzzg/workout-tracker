ALTER TABLE exercises
  ADD COLUMN equipment text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN image_alt_text text,
  ADD COLUMN image_credit text,
  ADD COLUMN image_license text,
  ADD COLUMN side_count smallint CHECK (side_count IN (1, 2)),
  ADD CONSTRAINT exercises_equipment_nonempty CHECK (length(trim(equipment)) > 0);