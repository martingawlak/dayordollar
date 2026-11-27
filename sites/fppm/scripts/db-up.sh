#!/bin/sh
# Start local MariaDB if it is not running (it does not survive container restarts).
mysqladmin ping >/dev/null 2>&1 && exit 0
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
(setsid nohup mysqld_safe --user=mysql >/dev/null 2>&1 < /dev/null &)
for i in $(seq 1 30); do mysqladmin ping >/dev/null 2>&1 && exit 0; sleep 1; done
echo "mariadb did not start" >&2; exit 1
