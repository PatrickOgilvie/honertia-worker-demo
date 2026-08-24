CREATE INDEX idx_rate_limits_last_request
ON rate_limits(last_request, id);
