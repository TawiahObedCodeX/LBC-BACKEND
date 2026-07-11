/**
 * src/modules/newsletter/templates/receipt.template.js
 * ──────────────────────────────────────────────────────────────
 * Generates the HTML for a payment receipt email sent to a giver
 * after their payment is confirmed by Paystack.
 *
 * WHY THIS LIVES IN newsletter/templates/ INSTEAD OF payments/?
 * The "newsletter" module is the email-sending module. It owns all
 * email templates, regardless of which feature triggers them.
 * Payments triggers the send, but the template is an email concern.
 *
 * If the project grows, this folder could be renamed to
 * "email-templates/" and moved to src/ — for now, keeping it
 * colocated with the module that owns email sending is simpler.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * @param {object} params
 * @param {string} params.giverName - the name the giver provided
 * @param {number} params.amountMinorUnits - amount in pesewas/kobo
 * @param {string} params.currency - e.g. "GHS"
 * @param {string} params.purpose - TITHE, OFFERING, DONATION, or EVENT_TICKET
 * @param {string} params.reference - our unique payment reference
 * @param {string} params.date - ISO date string of the payment
 * @param {string} params.baseUrl - the frontend's base URL
 * @returns {string} complete HTML email
 */
function receiptEmailHtml({ giverName, amountMinorUnits, currency, purpose, reference, date, baseUrl }) {
  // Convert from minor units back to the main currency unit for
  // display — 5000 pesewas → "50.00"
  const displayAmount = (amountMinorUnits / 100).toFixed(2);
  const formattedDate = new Date(date).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const purposeLabel = {
    TITHE: 'Tithe',
    OFFERING: 'Offering',
    DONATION: 'Donation',
    EVENT_TICKET: 'Event Ticket',
  }[purpose] || purpose;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#27ae60; padding: 30px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px;">Payment Receipt</h1>
              <p style="color:#ffffff; margin:10px 0 0 0; font-size:14px; opacity:0.9;">
                Thank you for your generosity
              </p>
            </td>
          </tr>

          <!-- Receipt details -->
          <tr>
            <td style="padding: 30px;">
              <table width="100%" cellpadding="8" cellspacing="0" style="font-size:14px; color:#333333;">
                <tr>
                  <td style="font-weight:bold; color:#777777; width:40%;">Name</td>
                  <td>${escapeHtml(giverName || 'Anonymous')}</td>
                </tr>
                <tr>
                  <td style="font-weight:bold; color:#777777;">Purpose</td>
                  <td>${escapeHtml(purposeLabel)}</td>
                </tr>
                <tr>
                  <td style="font-weight:bold; color:#777777;">Amount</td>
                  <td style="font-size:20px; font-weight:bold; color:#27ae60;">
                    ${escapeHtml(currency)} ${escapeHtml(displayAmount)}
                  </td>
                </tr>
                <tr>
                  <td style="font-weight:bold; color:#777777;">Date</td>
                  <td>${escapeHtml(formattedDate)}</td>
                </tr>
                <tr>
                  <td style="font-weight:bold; color:#777777;">Reference</td>
                  <td style="font-family:monospace; font-size:12px;">${escapeHtml(reference)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9; padding: 20px; text-align:center; font-size:12px; color:#777777; border-top:1px solid #eeeeee;">
              <p style="margin:0;">
                This is an automated receipt. If you have any questions, please contact the church office directly.
              </p>
              <p style="margin:10px 0 0 0;">
                <a href="${baseUrl}" style="color:#3498db; text-decoration:underline;">Visit our website</a>
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

module.exports = { receiptEmailHtml };