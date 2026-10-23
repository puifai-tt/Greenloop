-- =====================================================================
-- GreenLoop — migration for the React frontend (idempotent, MySQL 8 / Workbench).
-- Run AFTER schema.sql (fresh DB) or AFTER migration.sql (existing DB).
-- Safe to run more than once.
--
-- Before running:  USE your_database;
-- =====================================================================
DROP PROCEDURE IF EXISTS gl_migrate_frontend;
DELIMITER $$
CREATE PROCEDURE gl_migrate_frontend()
BEGIN
  DECLARE db VARCHAR(64) DEFAULT DATABASE();

  -- Users: "member since" -------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='Users' AND COLUMN_NAME='created_at') THEN
    ALTER TABLE Users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;

  -- RewardItems: fields shown in the reward store / inventory screens -----
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='category') THEN
    ALTER TABLE RewardItems ADD COLUMN category VARCHAR(50) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='emoji') THEN
    ALTER TABLE RewardItems ADD COLUMN emoji VARCHAR(16) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='sku') THEN
    ALTER TABLE RewardItems ADD COLUMN sku VARCHAR(40) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='supplier') THEN
    ALTER TABLE RewardItems ADD COLUMN supplier VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='storage_location') THEN
    ALTER TABLE RewardItems ADD COLUMN storage_location VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='low_stock') THEN
    ALTER TABLE RewardItems ADD COLUMN low_stock INT NOT NULL DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND INDEX_NAME='uq_reward_sku') THEN
    ALTER TABLE RewardItems ADD UNIQUE KEY uq_reward_sku (sku);   -- NULLs are allowed to repeat
  END IF;

  -- RecycleTypes: presentation fields -------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RecycleTypes' AND COLUMN_NAME='emoji') THEN
    ALTER TABLE RecycleTypes ADD COLUMN emoji VARCHAR(16) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RecycleTypes' AND COLUMN_NAME='color') THEN
    ALTER TABLE RecycleTypes ADD COLUMN color VARCHAR(20) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RecycleTypes' AND COLUMN_NAME='note') THEN
    ALTER TABLE RecycleTypes ADD COLUMN note VARCHAR(255) NULL;
  END IF;

  -- DropOffPoints: details shown on the map / branch cards ----------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='DropOffPoints' AND COLUMN_NAME='hours') THEN
    ALTER TABLE DropOffPoints ADD COLUMN hours VARCHAR(50) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='DropOffPoints' AND COLUMN_NAME='phone') THEN
    ALTER TABLE DropOffPoints ADD COLUMN phone VARCHAR(30) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='DropOffPoints' AND COLUMN_NAME='notes') THEN
    ALTER TABLE DropOffPoints ADD COLUMN notes VARCHAR(255) NULL;
  END IF;
END$$
DELIMITER ;

CALL gl_migrate_frontend();
DROP PROCEDURE gl_migrate_frontend;
