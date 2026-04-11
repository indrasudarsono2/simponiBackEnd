import jwt from "jsonwebtoken";

const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "change_this_secret_in_env"
    );

    // Attach user data to request
    req.user = {
      nik: decoded.nik,
      name: decoded.name,
      email: decoded.email,
      roles: decoded.roles,
      branchId: decoded.branchId,
      branchUnitId: decoded.branchUnitId,
      sectorId: decoded.sectorId,
      professionInBranchId: decoded.professionInBranchId,
      professionId: decoded.professionId
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({
        success: false,
        message: "Invalid token.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication error.",
      error: error.message,
    });
  }
};

export { authenticateToken };
