#!/bin/sh
# gff_fixture: the live gawlakfamilyfarms.com data (loaded as gff_old from
# Martin's export) with every credential removed or swapped for a test value,
# so the plugin under test can never call out with, or reveal, a real one.
# Real customer data: it stays in local MariaDB; nothing from it is committed.
set -e
mysql -uroot -e "drop database if exists gff_fixture; create database gff_fixture character set utf8mb4"
for t in options users usermeta posts postmeta; do
  mysql -uroot -e "create table gff_fixture.svz_$t like gff_old.svz_$t; insert into gff_fixture.svz_$t select * from gff_old.svz_$t"
done
mysql -uroot gff_fixture -e "
  delete from svz_options where option_name like '\_transient%' or option_name like '\_site\_transient%';
  -- WordPress password hashes and reset keys: sign-in moves to the shared accounts service.
  update svz_users set user_pass = '', user_activation_key = '';
  delete from svz_usermeta where meta_key = 'session_tokens' or meta_key like 'svz\_googlesitekit%' or meta_key like 'wfls%';
  -- The Google geocoding key becomes a test value (the Worker's GOOGLE_GEOCODE_KEY in tests).
  update svz_options set option_value = 'test-geocode-key' where option_name = 'gff_google_geocode_key';
  -- The Drive backup plugin's service-account key (that plugin is not ported yet).
  delete from svz_options where option_name = 'gff_dbk_sa_json';
"
mysql -uroot gff_fixture -N -e "select count(*) as users from svz_users; select count(*) as gff_meta from svz_usermeta where meta_key like 'gff\_%'"
