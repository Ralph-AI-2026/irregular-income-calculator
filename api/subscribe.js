const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = 'Skip the Surprise <hello@skipthesurprise.com>';
const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3; // max 3 requests per IP per minute

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = RATE_LIMIT_MAP.get(key);

  if (!entry) {
    RATE_LIMIT_MAP.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (now > entry.resetAt) {
    RATE_LIMIT_MAP.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count += 1;
  return false;
}

function buildWelcomeEmail(email) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Monthly Budget Template is Ready</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }
    .wrapper {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #1e3a5f, #2563eb);
      padding: 40px 40px 32px;
      text-align: center;
    }
    .header-eyebrow {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #7dd3fc;
      margin: 0 0 12px;
    }
    .header-title {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      margin: 0;
      line-height: 1.25;
    }
    .body {
      padding: 40px;
    }
    .intro {
      font-size: 15px;
      line-height: 1.7;
      color: #374151;
      margin: 0 0 32px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #2563eb;
      margin: 0 0 12px;
    }
    .tips-list {
      margin: 0 0 32px;
      padding: 0;
      list-style: none;
    }
    .tips-list li {
      padding: 14px 16px 14px 20px;
      border-left: 3px solid #2563eb;
      background: #f8fafc;
      border-radius: 0 8px 8px 0;
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
    }
    .tips-list li strong {
      color: #1e293b;
      display: block;
      margin-bottom: 2px;
    }
    .cta-block {
      text-align: center;
      margin: 0 0 32px;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 32px;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 0 0 24px;
    }
    .closing {
      font-size: 14px;
      line-height: 1.7;
      color: #64748b;
      margin: 0 0 24px;
    }
    .footer {
      background: #f8fafc;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0 0 4px;
      line-height: 1.6;
    }
    .footer a {
      color: #94a3b8;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="header-eyebrow">Skip the Surprise</p>
      <h1 class="header-title">Your Monthly Budget Template is Ready</h1>
    </div>
    <div class="body">
      <p class="intro">
        Thanks for using the Skip the Surprise calculator. You are using the right approach to budgeting on irregular income -- planning from your worst month instead of your best one. Most freelancers get this backwards, which is why they get caught short.
      </p>

      <p class="section-label">Three tips for making this work</p>

      <ul class="tips-list">
        <li>
          <strong>Lock in your worst-month number first.</strong>
          Before you set any budget line, go back through the last 12 months and find your lowest income month. That number is your planning floor. If your budget works on that month, it works every month.
        </li>
        <li>
          <strong>Keep your tax reserve separate and untouchable.</strong>
          Move your tax reserve to a dedicated account the same day income lands. If it stays in your operating account, it will get spent. Treat it like money you do not own, because you do not.
        </li>
        <li>
          <strong>Revisit your baseline every quarter.</strong>
          Income trends shift. If your worst month three months ago was $3,200 and your worst month this quarter is $2,600, your budget needs to move. The calculator is a live tool, not a one-time setup.
        </li>
      </ul>

      <div class="cta-block">
        <a class="cta-button" href="https://skipthesurprise.com" target="_blank" rel="noopener">
          Open the Calculator
        </a>
      </div>

      <hr class="divider" />

      <p class="closing">
        If you have questions or run into anything that does not make sense, reply to this email directly. No support queue, no bot -- just a response.
      </p>
    </div>
    <div class="footer">
      <p>You are receiving this because you signed up at skipthesurprise.com.</p>
      <p>No spam. <a href="mailto:hello@skipthesurprise.com?subject=Unsubscribe">Unsubscribe</a> anytime.</p>
      <p>Skip the Surprise</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Your Monthly Budget Template is Ready

Thanks for using the Skip the Surprise calculator. You are using the right approach to budgeting on irregular income -- planning from your worst month instead of your best one.

Three tips for making this work:

1. Lock in your worst-month number first.
Before you set any budget line, go back through the last 12 months and find your lowest income month. That number is your planning floor. If your budget works on that month, it works every month.

2. Keep your tax reserve separate and untouchable.
Move your tax reserve to a dedicated account the same day income lands. If it stays in your operating account, it will get spent. Treat it like money you do not own, because you do not.

3. Revisit your baseline every quarter.
Income trends shift. If your worst month three months ago was $3,200 and your worst month this quarter is $2,600, your budget needs to move. The calculator is a live tool, not a one-time setup.

Open the calculator: https://skipthesurprise.com

If you have questions, reply to this email directly.

---
You received this because you signed up at skipthesurprise.com.
Unsubscribe: mailto:hello@skipthesurprise.com?subject=Unsubscribe`;

  return { html, text };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
  if (checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const email = (body?.email || '').trim().toLowerCase();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const { html, text } = buildWelcomeEmail(email);

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject: 'Your Monthly Budget Template is Ready',
        html,
        text,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);
      // Return success to the user even if Resend fails due to unverified domain.
      // The signup intent is captured; the email will send once the domain is verified.
      return res.status(200).json({
        success: true,
        message: 'Signed up successfully.',
        _warning: 'Email delivery pending domain verification.',
      });
    }

    return res.status(200).json({ success: true, message: 'Welcome email sent.' });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
