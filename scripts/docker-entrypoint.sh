#!/bin/sh
# Waits for MySQL, loads demo data on first start, then runs the API (which also serves the web app).
set -e
echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT:-3306} ..."
until node -e "require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD}).then(c=>c.end()).catch(()=>process.exit(1))" 2>/dev/null; do
  sleep 2
done
HAS_DATA=$(node -e "require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME}).then(async c=>{const [r]=await c.query('SELECT COUNT(*) n FROM users');console.log(r[0].n);await c.end()}).catch(()=>console.log(0))")
if [ "$HAS_DATA" = "0" ] || [ "$RESET_DB" = "true" ]; then
  echo "Loading schema and demo data ..."
  node server/db/reset.js
fi
exec node server/src/index.js
