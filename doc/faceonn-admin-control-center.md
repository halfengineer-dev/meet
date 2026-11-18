# Faceonn Enterprise Admin Control Center — Documentation

## 1. Architecture Overview

The Faceonn Enterprise Admin Control Center extends Faceonn's existing React/TypeScript/Redux frontend, Node.js/Express/TypeScript backend, PostgreSQL schema, Jitsi Meet JWT integration, Socket.IO signaling, and Mediasoup SFU backend without duplicating authentication or meeting management logic.

- **Frontend Entry Route**: `/admin` and `/admin/*` (routed via `react/features/app/getRouteToRender.web.ts` to `react/features/admin/components/AdminControlCenter.web.tsx`).
- **Backend API Prefix**: `/api/admin/*` (`backend/src/routes/admin-routes.ts`), backed by modular domain services in `backend/src/admin/` and dual-mode PostgreSQL repository `backend/src/db/repositories/admin-store.ts`.
- **Database Migrations**: Versioned SQL migrations in `backend/src/db/migrations/001_enterprise_admin.sql`, executed transactionally and tracked in `schema_migrations` by `initDatabase()`.

---

## 2. Role-Based Access Control (RBAC)

All authorization is centrally enforced on the backend via `requireAuth`, `requireAdminAccess`, `requirePermission(...)`, `requirePlatformAdminOnly`, and `assertOrgScope(...)`.

### Platform Roles (`users.admin_role`)
| Role | Access Scope | Explicit Restrictions |
| :--- | :--- | :--- |
| `super_admin` | Full platform access (`*`) | Cannot self-delete or demote own Super Admin role. |
| `platform_admin` | Users, Organizations, Meetings, Live Monitoring, Recordings metadata, Support, Moderation, Announcements, Audit Logs (read). | Cannot modify `super_admin` accounts, escalate roles, edit `maintenance_mode` / `access_policies`, or access billing/refunds. |
| `support_admin` | Users (read), Meetings (read), Support Tickets, Moderation, Platform Health. | Cannot view/download private recordings, modify billing, or modify infrastructure. |
| `billing_admin` | Subscription Plans, Subscriptions, Payments, Refunds, Invoices, Coupons, Revenue Analytics, Organizations (read). | Cannot manage users, meetings, infrastructure, or platform settings. |
| `technical_admin` | SFU, Jitsi, TURN, Redis, Socket.IO, API Monitoring, Alerts, System Logs, Security (read), Feature Flags, non-critical settings. | Cannot access billing/financials or modify Super Admin accounts. |

### Organization Roles (`organization_members.role`)
- `org_owner`: Full control scoped strictly to their single organization.
- `org_admin`: Manage members, invitations, policies, meetings, and view org recordings/audit logs for their organization only.
- `meeting_admin`: Manage meetings and live monitoring for their organization only.
- `member` / `guest`: No admin console access (403 on all `/api/admin/*` routes).

**Backward Compatibility**: Existing accounts with `users.role = 'admin'` and `admin_role IS NULL` automatically resolve to `super_admin`.

---

## 3. Environment Variables

### Core Auth, Database & Server
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Backend HTTP & Socket.IO port. |
| `NODE_ENV` | Yes (prod) | `development` | Set to `production` in production deployments. |
| `DATABASE_URL` | Yes (prod) | — | PostgreSQL connection string (`postgres://user:pass@host:5432/faceonn`). In production, failure to connect throws rather than silently falling back to memory. |
| `PG_POOL_MAX` | No | `20` | Maximum PostgreSQL connection pool size. |
| `JWT_ACCESS_SECRET` | Yes (prod) | dev default | 32+ char HS256 secret for Faceonn access tokens. |
| `JWT_APP_SECRET` | Yes (prod) | dev default | Shared Jitsi JWT secret matching Prosody `APP_SECRET`. |
| `JWT_APP_ID` | No | `faceonn` | Jitsi JWT `iss`/`aud` app identifier. |
| `PUBLIC_DOMAIN` | No | `faceonn.com` | Public conferencing domain. |
| `ALLOWED_ORIGINS` | Yes (prod) | `https://faceonn.com,...` | Comma-separated CORS allowed origins. |
| `ADMIN_EMAIL` | First boot | — | Bootstrap Super Admin email. |
| `ADMIN_PASSWORD` | First boot | — | Bootstrap Super Admin password (min 8 chars, mixed case + number). |
| `ADMIN_SENSITIVE_RATE_LIMIT` | No | `120` | Max sensitive admin mutations per IP per 15 minutes. |

### Infrastructure & External Monitoring Exporters (Optional — Honestly Reported as `not_configured` if Unset)
| Variable | Example | Description |
| :--- | :--- | :--- |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Enables live Redis `INFO`/`DBSIZE`/`PING` telemetry in Infrastructure Monitor. |
| `SOCKETIO_REDIS_ADAPTER` | `true` | Indicates multi-node Socket.IO Redis adapter deployment. |
| `SFU_NODE_ID` | `sfu-eu-1` | Identifier for local Mediasoup SFU worker node. |
| `SERVER_REGION` | `eu-central-1` | Region label shown on Live Monitoring & SFU cards. |
| `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` | `10000` / `10100` | Mediasoup WebRTC UDP/TCP port range. |
| `JITSI_JVB_COLIBRI_URL` | `http://127.0.0.1:8080/colibri/stats` | Jitsi Videobridge Colibri stats JSON endpoint. |
| `JITSI_PROSODY_HEALTH_URL` | `http://127.0.0.1:5280/http-bind` | Prosody XMPP health probe URL. |
| `JITSI_JICOFO_HEALTH_URL` | `http://127.0.0.1:8888/stats` | Jicofo health/stats probe URL. |
| `TURN_HOST` / `TURN_PORT` | `turn.faceonn.com` / `3478` | Enables live TCP reachability & latency probe for TURN server. |
| `TURN_METRICS_URL` | `http://127.0.0.1:9641/metrics` | Optional Coturn metrics JSON exporter endpoint. |

### Optional Commercial & Storage Integrations
| Variable | Description |
| :--- | :--- |
| `RECORDING_STORAGE_PROVIDER` / `RECORDING_S3_BUCKET` | Cloud recording storage pipeline configuration (Jibri/S3). |
| `STRIPE_SECRET_KEY` | Live Stripe payment gateway key (when unset, billing runs in internal ledger mode; card numbers are never stored). |
| `SMTP_HOST` / `SMTP_PORT` | Outbound SMTP server for verification, invitation, and announcement emails. |

---

## 4. Backend Administrative API Reference

All endpoints require `Authorization: Bearer <accessToken>` and return JSON (except CSV export endpoints).

- **Context & Global Search**: `GET /api/admin/me`, `GET /api/admin/search?q=...`
- **Dashboard**: `GET /api/admin/dashboard/overview`, `GET /api/admin/dashboard/analytics`, `GET /api/admin/dashboard/activity`
- **Roles**: `GET /api/admin/roles`
- **Users**: `GET /api/admin/users`, `GET /api/admin/users/export`, `POST /api/admin/users`, `GET /api/admin/users/:id`, `GET /api/admin/users/:id/export`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/suspend`, `POST /api/admin/users/:id/reactivate`, `POST /api/admin/users/:id/revoke-sessions`, `POST /api/admin/users/:id/send-verification`, `DELETE /api/admin/users/:id`
- **Organizations & Invitations**: `GET /api/admin/organizations`, `POST /api/admin/organizations`, `GET /api/admin/organizations/:id`, `PATCH /api/admin/organizations/:id`, `DELETE /api/admin/organizations/:id`, `POST /api/admin/organizations/:id/members`, `DELETE /api/admin/organizations/:id/members/:userId`, `GET /api/admin/invitations`, `POST /api/admin/organizations/:id/invitations`, `POST /api/admin/organizations/:id/invitations/bulk-csv`, `DELETE /api/admin/invitations/:id`
- **Meetings & Live Monitoring**: `GET /api/admin/meetings`, `GET /api/admin/meetings/:id`, `POST /api/admin/meetings/:id/end`, `POST /api/admin/meetings/:id/cancel`, `POST /api/admin/meetings/:id/disable`, `GET /api/admin/live/meetings`, `GET /api/admin/live/metrics`
- **Recordings**: `GET /api/admin/recordings`, `GET /api/admin/recordings/:id`, `PATCH /api/admin/recordings/:id/retention`, `DELETE /api/admin/recordings/:id`, `POST /api/admin/recordings/:id/restore`
- **Billing**: `GET /api/admin/billing/overview`, `GET /api/admin/billing/plans`, `POST /api/admin/billing/plans`, `PATCH /api/admin/billing/plans/:id`, `GET /api/admin/subscriptions`, `POST /api/admin/subscriptions`, `POST /api/admin/subscriptions/:id/cancel`, `GET /api/admin/payments`, `POST /api/admin/payments/:id/refund`, `GET /api/admin/invoices`, `GET /api/admin/coupons`, `POST /api/admin/coupons`, `PATCH /api/admin/coupons/:id`
- **Support, Moderation, Comms**: `GET/POST /api/admin/support/tickets`, `GET/PATCH /api/admin/support/tickets/:id`, `POST /api/admin/support/tickets/:id/reply`, `GET/POST /api/admin/moderation/reports`, `PATCH /api/admin/moderation/reports/:id`, `GET/POST /api/admin/announcements`, `PATCH /api/admin/announcements/:id`, `GET /api/admin/notifications`, `POST /api/admin/notifications/:id/read`
- **Infrastructure**: `GET /api/admin/infrastructure/overview`, `/sfu`, `/jitsi`, `/turn`, `/redis`, `/api`, `/logs`, `GET/POST /api/admin/infrastructure/alerts`, `POST /api/admin/infrastructure/alerts/:id/acknowledge`, `POST /api/admin/infrastructure/alerts/:id/resolve`
- **Security & Audit**: `GET /api/admin/security/overview`, `GET /api/admin/security/events`, `GET /api/admin/security/sessions`, `DELETE /api/admin/security/sessions/:id`, `GET/POST /api/admin/security/api-keys`, `DELETE /api/admin/security/api-keys/:id`, `GET /api/admin/audit-logs`, `GET /api/admin/audit-logs/export`
- **Configuration**: `GET/PATCH /api/admin/settings`, `PATCH /api/admin/settings/:section`, `GET /api/admin/feature-flags`, `PATCH /api/admin/feature-flags/:id`

---

## 5. Deployment Instructions

1. **Configure PostgreSQL & Environment**:
   Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_APP_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optional monitoring URLs in `backend/.env`.
2. **Build & Run Backend** (migrations run automatically on startup and are recorded in `schema_migrations`):
   ```bash
   cd backend
   npm ci
   npm run build
   NODE_ENV=production node dist/index.js
   ```
3. **Build Frontend Bundle**:
   ```bash
   npm run tsc:web
   make compile
   ```
4. **NGINX Reverse Proxy**:
   Ensure `/api/` and `/socket.io/` proxy to the backend (already configured in `deploy/nginx-faceonn.conf`), and ensure SPA fallback serves `index.html` for `/admin` and `/admin/*`.
5. **Access**:
   Sign in at `/login` as an administrator and click **Admin Control Center** in the sidebar or navigate directly to `/admin`.

---

## 6. Features Requiring External Infrastructure / Future Integrations

The admin UI, database tables, RBAC enforcement, and backend service abstractions are production-ready, while the following external runtime integrations require infrastructure deployment:
1. **Cloud Recording Media Processor (Jibri / S3 Signed URLs)**: `recordings` metadata, privacy rules, retention policies, soft-delete/restore, and audit logging are implemented; connect Jibri recording webhooks and S3 pre-signed URL generation when Jibri is deployed.
2. **Live Payment Gateway (Stripe / Razorpay Webhooks)**: Plans, subscriptions, payments, invoices, coupons, and refund ledger workflows are implemented; add Stripe Checkout & webhook signature verification once live Stripe keys are provisioned.
3. **Outbound SMTP / Transactional Email Delivery**: Invitation, verification, and announcement records are stored in PostgreSQL; wire `nodemailer` / SES / Postmark using `SMTP_HOST` credentials to dispatch outbound emails.
4. **External Cluster Telemetry Exporters**: Live Mediasoup SFU worker/room stats, Express API latency/P95/P99/error rates, DB query latency, and Socket.IO telemetry are live today; configure `REDIS_URL`, `JITSI_JVB_COLIBRI_URL`, `JITSI_PROSODY_HEALTH_URL`, `JITSI_JICOFO_HEALTH_URL`, `TURN_HOST`, and `TURN_METRICS_URL` to stream external cluster telemetry.
5. **Multi-Node Socket.IO Redis Adapter**: Install `@socket.io/redis-adapter` and set `REDIS_URL` + `SOCKETIO_REDIS_ADAPTER=true` when horizontally scaling backend nodes.

