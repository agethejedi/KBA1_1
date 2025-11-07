
export function requireBearer(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token || token !== (process.env.KBA_API_KEY || "devkey")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
