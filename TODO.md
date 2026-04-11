# Authentication Implementation TODO

## Steps:

- [x] 1. Create authentication middleware (middleware/auth.js)
- [x] 2. Update login to include branchId/branchUnitId in token payload
- [x] 3. Apply middleware to all routes except login in router/api.js
- [x] 4. Update medexUserController to use req.user.nik instead of config.nik

## Progress:

- ✅ Completed: Authentication system implementation
- ✅ All API routes now require valid JWT token (except login)
- ✅ Token contains: nik, name, email, roles, branchId, branchUnitId, sectorId
