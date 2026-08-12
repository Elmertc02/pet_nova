export default function handler(req, res) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || '').split(',')[0].trim();

  res.status(200).json({
    ip,
    country: req.headers['x-vercel-ip-country'] || '',
    city: req.headers['x-vercel-ip-city'] || '',
  });
}
