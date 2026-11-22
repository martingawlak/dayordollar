-- Card payments through PayPal Checkout: the PayPal order an order was paid with.
ALTER TABLE orders ADD COLUMN paypal_order_id TEXT;
CREATE INDEX orders_paypal ON orders (paypal_order_id);
