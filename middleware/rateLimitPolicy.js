// Authentication endpoints have their own stricter limit. Clock reads have a
// separate authenticated, per-user limit in the API router.
export const skipGeneralApiLimit = (req) => {
  if (req.method !== "GET" && req.method !== "POST") return false;
  if (req.method === "POST" && ["/auth/login", "/auth/forgot-password", "/auth/reset-password"].includes(req.path)) return true;
  return req.method === "GET" && (
    /^\/theorySessions\/\d+\/clock$/.test(req.path) ||
    req.path === "/theorySessions/lead/clocks"
  );
};
