export const ADMIN_OVERVIEW_SQL = `
  SELECT
    (SELECT COUNT(*) FROM merchants m WHERE m.is_demo = 0) AS merchants,
    (SELECT COUNT(*)
      FROM merchants m
      LEFT JOIN merchant_admin_state s ON s.merchant_id = m.id
      WHERE m.is_demo = 0 AND COALESCE(s.status, 'active') = 'active') AS active_merchants,
    (SELECT COUNT(*)
      FROM merchants m
      JOIN merchant_admin_state s ON s.merchant_id = m.id
      WHERE m.is_demo = 0 AND s.status = 'suspended') AS suspended_merchants,
    (SELECT COUNT(*)
      FROM memberships mb
      JOIN merchants m ON m.id = mb.merchant_id
      WHERE m.is_demo = 0 AND mb.deleted_at IS NULL) AS customers,
    (SELECT COUNT(*)
      FROM employees e
      JOIN merchants m ON m.id = e.merchant_id
      WHERE m.is_demo = 0 AND e.active = 1) AS active_employees,
    (SELECT COUNT(*)
      FROM stamps s
      JOIN merchants m ON m.id = s.merchant_id
      WHERE m.is_demo = 0 AND s.delta > 0 AND s.reason IN ('visit', 'purchase')
        AND s.reversed_at IS NULL) AS passages,
    (SELECT COUNT(*)
      FROM rewards r
      JOIN merchants m ON m.id = r.merchant_id
      WHERE m.is_demo = 0 AND r.status = 'redeemed') AS rewards,
    (SELECT COALESCE(SUM(mb.points), 0)
      FROM memberships mb
      JOIN merchants m ON m.id = mb.merchant_id
      WHERE m.is_demo = 0 AND mb.deleted_at IS NULL) AS current_points
`;
