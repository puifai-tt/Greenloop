-- =====================================================================
-- GreenLoop — DEMO seed data (idempotent: INSERT IGNORE with fixed ids).
-- Run in MySQL Workbench AFTER schema.sql + migration_frontend.sql
-- (or migration.sql + migration_frontend.sql on an existing DB).
-- Before running:  USE your_database;
--
-- Demo logins (change or delete these before any real deployment!):
--   admin  : admin@greenloop.demo  / admin123
--   staff  : staff@greenloop.demo  / staff123   (Green Loop Bangkhen)
--   member : user@greenloop.demo   / user123    (GL-U-001284)
-- All other seeded members use password user123; other staff use staff123.
-- =====================================================================
SET NAMES utf8mb4;

-- Drop-off points
INSERT IGNORE INTO DropOffPoints (point_id,name,street,province,hours,phone,notes,is_active) VALUES (1,'Green Loop Bangkhen','Near the main campus entrance','Bangkok','08:30–18:00','02-555-0101','Main campus drop-off point',1);
INSERT IGNORE INTO DropOffPoints (point_id,name,street,province,hours,phone,notes,is_active) VALUES (2,'Green Loop Kaset','Community learning centre','Bangkok','09:00–17:00','02-555-0102','E-waste is not accepted here',1);
INSERT IGNORE INTO DropOffPoints (point_id,name,street,province,hours,phone,notes,is_active) VALUES (3,'Green Loop Ladprao','Ladprao community hub','Bangkok','Temporarily unavailable','02-555-0103','Temporarily closed for maintenance',0);
INSERT IGNORE INTO DropOffPoints (point_id,name,street,province,hours,phone,notes,is_active) VALUES (4,'Green Loop Ratchayothin','Ratchayothin green space','Bangkok','09:00–18:00','02-555-0104','Community collection point',1);

-- Recycle types
INSERT IGNORE INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,note,is_active) VALUES (1,'Plastic bottles',10,0.08,'🧴','#d8efff',NULL,TRUE);
INSERT IGNORE INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,note,is_active) VALUES (2,'Paper & cardboard',5,0.04,'📦','#f8e7c7',NULL,TRUE);
INSERT IGNORE INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,note,is_active) VALUES (3,'Aluminium cans',15,0.12,'🥫','#e5e7eb',NULL,TRUE);
INSERT IGNORE INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,note,is_active) VALUES (4,'Glass bottles',4,0.03,'🍾','#d7f2df',NULL,TRUE);
INSERT IGNORE INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,note,is_active) VALUES (5,'Small e-waste',20,0.18,'🔋','#e9e1fb','Small electronics and batteries; accept only at equipped points',TRUE);

-- Which materials each drop-off point accepts
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,1);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,2);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,3);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,4);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,5);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (2,1);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (2,2);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (2,3);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (2,4);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (3,1);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (3,2);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (3,3);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (3,4);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (4,1);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (4,2);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (4,3);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (4,4);
INSERT IGNORE INTO BranchAcceptedTypes (point_id,type_id) VALUES (4,5);

-- Users: admin, staff, members (explicit ids; member id 1284 = GL-U-001284 in the UI)
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1,'GreenLoop','Admin','admin@greenloop.demo','$2b$10$S97mNhCPGWTgpe1JBLZjjuToHacz9SFQKYE6Wc0ddV4xiZaID3266','admin',NULL,0,0,TRUE,'2026-01-05 09:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (2,'Narin','Staff','staff@greenloop.demo','$2b$10$f/VIWFfM3hYUEFRSL0Oxk.UrD.LiDTkS6W0fCFK3gYv9lYQUyZyPq','staff',1,0,0,TRUE,'2026-01-10 09:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (3,'Mali','Operations','mali.staff@greenloop.demo','$2b$10$f/VIWFfM3hYUEFRSL0Oxk.UrD.LiDTkS6W0fCFK3gYv9lYQUyZyPq','staff',2,0,0,TRUE,'2026-01-10 09:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (4,'Ploy','Branch Lead','ploy.staff@greenloop.demo','$2b$10$f/VIWFfM3hYUEFRSL0Oxk.UrD.LiDTkS6W0fCFK3gYv9lYQUyZyPq','staff',4,0,0,TRUE,'2026-01-10 09:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1284,'Mild','Green','user@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,1280,1.23,TRUE,'2026-03-12 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1285,'Pimchanok','Dee','pimchanok.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',2,860,0.56,TRUE,'2026-04-02 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1286,'Thanawat','Jai','thanawat.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,1540,0.55,TRUE,'2026-04-19 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1287,'Nicha','Saeng','nicha.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',4,420,0.20,TRUE,'2026-05-03 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1288,'Kawin','Rak','kawin.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',2,2150,0.44,TRUE,'2026-05-20 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1289,'Mali','Jaiyen','mali.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,690,0.10,TRUE,'2026-06-07 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1290,'Ploydao','Suksan','ploydao.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',4,980,0.32,TRUE,'2026-06-18 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1291,'Phurin','Kiet','phurin.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,330,0.28,TRUE,'2026-07-01 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1292,'Kanda','Mee','kanda.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',2,1760,0.20,TRUE,'2026-07-14 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1293,'Tawan','Chai','tawan.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,0,0.10,FALSE,'2026-08-05 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1294,'Arisa','Fon','arisa.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',4,1240,0.29,TRUE,'2026-08-22 12:00:00');
INSERT IGNORE INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,total_co2_saved,is_active,created_at) VALUES (1295,'Napat','Boon','napat.demo@greenloop.demo','$2b$10$rLLZbFTIWyhRZ.CBDF/yeu/zcjtWbRFMiwx/hqFgzAEjPSCFFzEKK','user',1,540,0.28,TRUE,'2026-09-09 12:00:00');

-- Rewards
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (1,'Reusable Tumbler','Eco lifestyle','🥤',350,18,'A reusable cup for your everyday drinks.','GL-RW-001','GreenLoop Studio','Cabinet A1',5,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (2,'Canvas Tote Bag','Daily essentials','👜',250,24,'A handy bag for shopping and campus days.','GL-RW-002','Local textile partner','Cabinet A2',6,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (3,'Plant Starter Set','Green living','🪴',500,9,'Start growing a little more green.','GL-RW-003','Community nursery','Shelf B1',3,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (4,'Recycled Notebook','Stationery','📒',180,14,'A notebook made with recycled paper.','GL-RW-004','Recycled Paper Co.','Shelf B2',4,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (5,'Bamboo Cutlery Set','Daily essentials','🍴',300,16,'A lightweight reusable cutlery set.','GL-RW-005','Green Goods','Cabinet A3',5,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (6,'Seed Paper Bookmark','Stationery','🌼',100,32,'Plant it after reading to grow wildflowers.','GL-RW-006','Community makers','Shelf B3',8,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (7,'Mini Desk Plant','Green living','🌱',420,8,'A small plant to brighten a desk.','GL-RW-007','Community nursery','Shelf C1',3,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (8,'Recycled Pencil Set','Stationery','✏️',150,27,'A set of pencils made with recycled material.','GL-RW-008','Eco Stationery','Shelf B4',6,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (9,'Foldable Shopping Bag','Daily essentials','🛍️',220,19,'A compact bag to keep with you on the go.','GL-RW-009','Local textile partner','Cabinet A4',5,TRUE);
INSERT IGNORE INTO RewardItems (reward_id,name,category,emoji,points_required,stock,description,sku,supplier,storage_location,low_stock,is_active) VALUES (10,'Solar Power Bank','Eco lifestyle','🔋',900,4,'A sample premium reward for the prototype.','GL-RW-010','Green tech partner','Locked cabinet D1',2,TRUE);

-- Past recycling transactions (dates are relative to the moment you run this script)
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (1,1284,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 0 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (1,1,1,2.5,0.2,25);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (2,1,3,0.8,0.1,12);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (2,1285,2,3,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 1 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (3,2,2,3.4,0.14,17);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (3,1286,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 2 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (4,3,3,1.7,0.2,26);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (5,3,4,2.1,0.06,8);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (4,1287,4,4,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 3 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (6,4,1,1.9,0.15,19);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (7,4,2,1.2,0.05,6);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (5,1288,4,4,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 5 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (8,5,5,0.6,0.11,12);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (9,5,3,1.1,0.13,17);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (6,1289,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 7 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (10,6,4,3.2,0.1,13);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (7,1284,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 8 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (11,7,2,4,0.16,20);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (12,7,4,1.5,0.05,6);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (8,1290,4,4,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 9 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (13,8,1,2.8,0.22,28);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (14,8,2,2.4,0.1,12);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (9,1291,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 12 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (15,9,3,2.3,0.28,35);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (10,1284,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 14 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (16,10,1,3.1,0.25,31);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (11,1292,2,3,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 15 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (17,11,2,4.1,0.16,21);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (18,11,4,1.4,0.04,6);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (12,1293,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 18 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (19,12,1,1.3,0.1,13);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (13,1294,4,4,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 23 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (20,13,5,0.9,0.16,18);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (21,13,1,1.6,0.13,16);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (14,1284,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 27 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (22,14,3,1.2,0.14,18);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (23,14,2,2.2,0.09,11);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (15,1295,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 31 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (24,15,2,2.7,0.11,14);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (25,15,3,1.4,0.17,21);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (16,1286,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 46 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (26,16,4,3.8,0.11,15);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (27,16,1,2.2,0.18,22);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (17,1284,1,2,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 60 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (28,17,1,2,0.16,20);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (29,17,4,2.6,0.08,10);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (18,1288,4,4,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 68 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (30,18,5,1.1,0.2,22);
INSERT IGNORE INTO Transactions (transaction_id,user_id,point_id,staff_id,trans_date) VALUES (19,1285,2,3,DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 11 HOUR), INTERVAL 104 DAY));
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (31,19,2,5.2,0.21,26);
INSERT IGNORE INTO TransactionsItems (item_id,transaction_id,type_id,weight_kg,co2_saved,points_earned) VALUES (32,19,1,2.6,0.21,26);

-- One pending reward redemption so the staff "Reward pickup" screen has something to show
INSERT IGNORE INTO RewardRedemptions (redemption_id,user_id,reward_id,staff_id,points_used,redemption_at,expires_at,status,redeem_code)
VALUES (1,1285,2,NULL,250,DATE_SUB(NOW(), INTERVAL 8 DAY),DATE_ADD(NOW(), INTERVAL 22 DAY),'pending','RD-K7M2QX');

