-- Shows imported from the Dead Dreams Facebook Page: the Facebook event they came from.
ALTER TABLE events ADD COLUMN fb_event_id TEXT;
CREATE UNIQUE INDEX events_fb ON events (fb_event_id);
