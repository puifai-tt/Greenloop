-- =====================================================================
-- GreenLoop — idempotent migration for an EXISTING database built from
-- the PDF design. Safe to run more than once in MySQL Workbench.
-- (For a brand-new database use schema.sql instead.)
--
-- Before running: USE your_database;   (the procedure uses DATABASE())
-- =====================================================================
DROP PROCEDURE IF EXISTS gl_migrate;
DELIMITER $$
CREATE PROCEDURE gl_migrate()
BEGIN
  DECLARE db VARCHAR(64) DEFAULT DATABASE();

  -- 1) new columns the API needs --------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='description') THEN
    ALTER TABLE RewardItems ADD COLUMN description TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND COLUMN_NAME='image_url') THEN
    ALTER TABLE RewardItems ADD COLUMN image_url VARCHAR(255) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardRedemptions' AND COLUMN_NAME='redeem_code') THEN
    ALTER TABLE RewardRedemptions ADD COLUMN redeem_code VARCHAR(20) NULL;
  END IF;

  -- 2) a redemption is created before any staff is involved -> nullable
  ALTER TABLE RewardRedemptions
    MODIFY staff_id       INT NULL,
    MODIFY expires_at     DATETIME NULL,
    MODIFY handed_over_at DATETIME NULL,
    MODIFY status ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
    MODIFY redemption_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

  -- 3) indexes ---------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardRedemptions' AND INDEX_NAME='uq_redeem_code') THEN
    ALTER TABLE RewardRedemptions ADD UNIQUE KEY uq_redeem_code (redeem_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardRedemptions' AND INDEX_NAME='idx_rr_user') THEN
    ALTER TABLE RewardRedemptions ADD KEY idx_rr_user (user_id, redemption_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardRedemptions' AND INDEX_NAME='idx_rr_status_exp') THEN
    ALTER TABLE RewardRedemptions ADD KEY idx_rr_status_exp (status, expires_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='Users' AND INDEX_NAME='uq_users_email') THEN
    ALTER TABLE Users ADD UNIQUE KEY uq_users_email (email);
  END IF;

  -- 4) the PDF gives RewardRedemptions.staff_id no FK -------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardRedemptions' AND CONSTRAINT_NAME='fk_rr_staff') THEN
    ALTER TABLE RewardRedemptions ADD CONSTRAINT fk_rr_staff FOREIGN KEY (staff_id) REFERENCES Users(user_id);
  END IF;

  -- 5) last-line safeguards (enforced by MySQL 8.0.16+) -----------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=db AND TABLE_NAME='Users' AND CONSTRAINT_NAME='chk_points_nonneg') THEN
    ALTER TABLE Users ADD CONSTRAINT chk_points_nonneg CHECK (green_points >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND CONSTRAINT_NAME='chk_stock_nonneg') THEN
    ALTER TABLE RewardItems ADD CONSTRAINT chk_stock_nonneg CHECK (stock >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=db AND TABLE_NAME='RewardItems' AND CONSTRAINT_NAME='chk_reward_points') THEN
    ALTER TABLE RewardItems ADD CONSTRAINT chk_reward_points CHECK (points_required > 0);
  END IF;
END$$
DELIMITER ;

CALL gl_migrate();
DROP PROCEDURE gl_migrate;
