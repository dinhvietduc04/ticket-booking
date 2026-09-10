-- Preserve prices for reservations created before the upgrade.
UPDATE seat_hold_items AS h SET price = s.price, currency = s.currency FROM session_seats AS s WHERE h."sessionSeatId" = s.id;
UPDATE session_seats SET "basePrice" = price;
ALTER TABLE seat_hold_items ADD CONSTRAINT hold_price_nonnegative CHECK (price >= 0);
ALTER TABLE payments ADD CONSTRAINT refund_within_capture CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= amount);
ALTER TABLE refunds ADD CONSTRAINT refund_nonnegative CHECK (amount >= 0);
ALTER TABLE sessions ADD CONSTRAINT waiting_capacity_nonnegative CHECK ("waitingRoomCapacity" >= 0);
