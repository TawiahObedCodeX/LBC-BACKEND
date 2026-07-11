/**
 * src/modules/newsletter/templates/newsletter.template.js
 * ──────────────────────────────────────────────────────────────
 * Generates the HTML for a newsletter email sent to subscribers.
 *
 * WHY A SEPARATE TEMPLATE FILE?
 * Inline HTML strings in the service or worker become unreadable
 * fast. Keeping templates here means:
 *   - The email's structure is visible in one place
 *   - You can add Handlebars/Mustache later without touching the
 *     sending logic (just change this file's exports)
 *   - A designer can tweak the HTML without reading service code
 *
 * CURRENT APPROACH: template literals (no extra dependency).
 * UPGRADE PATH: when emails get more complex, swap this for
 * Handlebars templates stored as `.hbs` files in this same folder.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * @param {object} params
 * @param {string} params.subject - the campaign subject line
 * @param {string} params.bodyHtml - the HTML body the admin wrote
 * @param {string} params.unsubscribeToken - unique token for one-click unsubscribe
 * @param {string} params.baseUrl - the frontend's base URL (from env or config)
 * @returns {string} complete HTML email
 */
function newsletterEmailHtml({ subject, bodyHtml, unsubscribeToken, baseUrl }) {
  // The unsubscribe link points to the Next.js frontend, which
  // extracts the token and calls POST /api/v1/newsletter/unsubscribe
  // with it. The frontend is responsible for that UX; the backend
  // just provides the token in the link.
  const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#2c3e50; padding: 30px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px;">${escapeHtml(subject)}</h1>
            </td>
          </tr>

          <!-- Body — this is what the admin wrote in the dashboard -->
          <tr>
            <td style="padding: 30px; font-size:16px; line-height:1.6; color:#333333;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer with unsubscribe -->
          <tr>
            <td style="background-color:#f9f9f9; padding: 20px; text-align:center; font-size:12px; color:#777777; border-top:1px solid #eeeeee;">
              <p style="margin:0 0 10px 0;">
                You are receiving this email because you subscribed to our newsletter.
              </p>
              <p style="margin:0;">
                <a href="${unsubscribeUrl}" style="color:#e74c3c; text-decoration:underline;">
                  Unsubscribe
                </a>
                &nbsp;|&nbsp;
                <a href="${baseUrl}" style="color:#3498db; text-decoration:underline;">
                  Visit our website
                </a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Escapes characters that could break the HTML structure or
 * enable XSS if the admin's subject line contains HTML characters.
 * This is a minimal defense — the admin is trusted, but defense
 * in depth never hurts.
 */
function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(str).replace(/[&<>"']/g, (char) => map[char]);
}

module.exports = { newsletterEmailHtml };