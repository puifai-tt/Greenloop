-- =====================================================================
-- GreenLoop — full schema (fresh install). MySQL 8.0.16+ / InnoDB.
-- Matches the PDF design + the extra columns the API needs.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS DropOffPoints (
  point_id    INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  house_no    VARCHAR(20),
  street      VARCHAR(100),
  subdistrict VARCHAR(100),
  district    VARCHAR(100),
  province    VARCHAR(100),
  postal_code VARCHAR(10),
  latitude    DECIMAL(9,6),
  longitude   DECIMAL(9,6),
  hours       VARCHAR(50)  NULL,
  phone       VARCHAR(30)  NULL,
  notes       VARCHAR(255) NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Users (
  user_id         INT AUTO_INCREMENT PRIMARY KEY,
  fname           VARCHAR(50)  NOT NULL,
  mname           VARCHAR(50)  NULL,
  lname           VARCHAR(50)  NOT NULL,
  email           VARCHAR(150) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('user','staff','admin') NOT NULL DEFAULT 'user',
  point_id        INT NULL,
  green_points    INT NOT NULL DEFAULT 0,
  total_co2_saved DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_point FOREIGN KEY (point_id) REFERENCES DropOffPoints(point_id),
  CONSTRAINT chk_points_nonneg CHECK (green_points >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RecycleTypes (
  type_id       INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  points_per_kg DECIMAL(6,2) NOT NULL,
  co2_factor_kg DECIMAL(6,2) NOT NULL,
  emoji         VARCHAR(16)  NULL,
  color         VARCHAR(20)  NULL,
  note          VARCHAR(255) NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BranchAcceptedTypes (
  point_id INT NOT NULL,
  type_id  INT NOT NULL,
  PRIMARY KEY (point_id, type_id),
  CONSTRAINT fk_bat_point FOREIGN KEY (point_id) REFERENCES DropOffPoints(point_id),
  CONSTRAINT fk_bat_type  FOREIGN KEY (type_id)  REFERENCES RecycleTypes(type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  point_id       INT NOT NULL,
  staff_id       INT NULL,
  trans_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tx_user_date (user_id, trans_date),
  CONSTRAINT fk_tx_user  FOREIGN KEY (user_id)  REFERENCES Users(user_id),
  CONSTRAINT fk_tx_point FOREIGN KEY (point_id) REFERENCES DropOffPoints(point_id),
  CONSTRAINT fk_tx_staff FOREIGN KEY (staff_id) REFERENCES Users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS TransactionsItems (
  item_id        INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  type_id        INT NOT NULL,
  weight_kg      DECIMAL(8,2)  NOT NULL,
  co2_saved      DECIMAL(10,2) NOT NULL DEFAULT 0,
  points_earned  INT NOT NULL DEFAULT 0,
  KEY idx_ti_tx (transaction_id),
  CONSTRAINT fk_ti_tx   FOREIGN KEY (transaction_id) REFERENCES Transactions(transaction_id),
  CONSTRAINT fk_ti_type FOREIGN KEY (type_id)        REFERENCES RecycleTypes(type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RewardItems (
  reward_id       INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  description     TEXT NULL,
  image_url       VARCHAR(255) NULL,
  points_required INT NOT NULL,
  stock           INT NOT NULL DEFAULT 0,
  category        VARCHAR(50)  NULL,
  emoji           VARCHAR(16)  NULL,
  sku             VARCHAR(40)  NULL,
  supplier        VARCHAR(100) NULL,
  storage_location VARCHAR(100) NULL,
  low_stock       INT NOT NULL DEFAULT 3,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_reward_sku (sku),
  CONSTRAINT chk_stock_nonneg  CHECK (stock >= 0),
  CONSTRAINT chk_reward_points CHECK (points_required > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RewardRedemptions (
  redemption_id  INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  reward_id      INT NOT NULL,
  staff_id       INT NULL,                       -- NULL until staff hands the reward over
  points_used    INT NOT NULL,
  redemption_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NULL,
  handed_over_at DATETIME NULL,
  status         ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  redeem_code    VARCHAR(20) NULL,
  UNIQUE KEY uq_redeem_code (redeem_code),
  KEY idx_rr_user (user_id, redemption_at),
  KEY idx_rr_status_exp (status, expires_at),
  CONSTRAINT fk_rr_user   FOREIGN KEY (user_id)   REFERENCES Users(user_id),
  CONSTRAINT fk_rr_reward FOREIGN KEY (reward_id) REFERENCES RewardItems(reward_id),
  CONSTRAINT fk_rr_staff  FOREIGN KEY (staff_id)  REFERENCES Users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
