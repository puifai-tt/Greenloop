DELIMITER $$
CREATE TRIGGER calc_points_before_item
BEFORE INSERT ON TransactionsItems
FOR EACH ROW
BEGIN
  DECLARE pts_per_kg DECIMAL(6,2);
  DECLARE co2_per_kg DECIMAL(6,2);

  SELECT points_per_kg, co2_factor_kg INTO pts_per_kg, co2_per_kg
  FROM RecycleTypes WHERE type_id = NEW.type_id;

  SET NEW.points_earned = ROUND(NEW.weight_kg * pts_per_kg);
  SET NEW.co2_saved = ROUND(NEW.weight_kg * co2_per_kg, 2);
END$$
DELIMITER ;


DELIMITER $$
CREATE PROCEDURE GetMonthlyReport(IN p_month INT, IN p_year INT)
BEGIN
  SELECT 
    dp.name AS branch_name,
    SUM(ti.weight_kg) AS total_weight,
    SUM(ti.co2_saved) AS total_co2_saved,
    COUNT(DISTINCT t.transaction_id) AS total_transactions
  FROM Transactions t
  JOIN DropOffPoints dp ON t.point_id = dp.point_id
  JOIN TransactionsItems ti ON ti.transaction_id = t.transaction_id
  WHERE MONTH(t.trans_date) = p_month AND YEAR(t.trans_date) = p_year
  GROUP BY dp.point_id;
END$$
DELIMITER ;
