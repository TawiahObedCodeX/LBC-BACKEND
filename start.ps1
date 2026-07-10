# ──────────────────────────────────────────────────────────────
# start.ps1 — Church Backend: full local startup sequence
# ──────────────────────────────────────────────────────────────
# HOW TO USE:
#   1. Make sure Docker Desktop is open and fully loaded first.
#   2. Run this script:  .\start.ps1
#   3. It will start Postgres + Redis in Docker, then the API.
#   4. Open a SECOND terminal and run "yarn worker" separately —
#      the worker must run in its own terminal, not this one,
#      because "yarn dev" keeps this terminal busy watching for
#      file changes and never returns control.
# ──────────────────────────────────────────────────────────────

# Step 1 — Start Postgres and Redis containers in the background (-d = detached)
docker compose up -d

# Step 2 — Show container status so you can confirm both say "healthy"
#          before the API tries to connect to them
docker compose ps

# Step 3 — Start the API with hot-reload (nodemon restarts it on file changes)
#          This terminal will stay open/busy running the server —
#          that's expected, leave it running.
yarn dev

# ──────────────────────────────────────────────────────────────
# 👉 NEXT STEP (do this in a NEW terminal window/tab):
#
#     cd "C:\Users\CodeX Dev Space\Desktop\LBC-BACKEND"
#     yarn worker
#
# This starts the background worker that actually sends newsletter
# emails and payment receipts. Without it running, emails will sit
# queued in Redis and never send.
#
# Then verify everything is connected by running, in a THIRD terminal:
#
#     curl http://localhost:5000/api/v1/health
#
# Expected: {"success":true,"message":"ok","data":{"checks":{"database":true,"redis":true}}}
# ──────────────────────────────────────────────────────────────