-- Distinct sports (#49): trail running, road cycling and mountain biking. The existing values keep their
-- meaning ('running' becomes road running, 'cycling' leisure cycling), so existing routes are unchanged and
-- the code deployed before this migration keeps working. New values are positioned after values that already
-- exist, since a value added in this transaction cannot be used yet.
alter type public.sport_type add value if not exists 'trail' after 'running';
alter type public.sport_type add value if not exists 'mountain_biking' after 'cycling';
alter type public.sport_type add value if not exists 'road_cycling' after 'cycling';
