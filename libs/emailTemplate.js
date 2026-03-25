import config from "@/config";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatContent = (content = "") => escapeHtml(content).replace(/\n/g, "<br />");

export const emailTemplate = ({
  eyebrow = "Good Gut Hut",
  title = config.appName,
  subtitle = config.appDescription,
  content = "",
  contentHtml = "",
  logoUrl = `https://${config.domainName}/icon.png`,
  footer = `Need help? Call or WhatsApp +919916331569 or email ${config.mailgun.supportEmail}.`,
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #f3ede2;
        font-family: Georgia, "Times New Roman", serif;
        color: #2f4a3e;
      }
      .shell {
        width: 100%;
        padding: 24px 12px;
      }
      .card {
        max-width: 640px;
        margin: 0 auto;
        background: #fffdf8;
        border: 1px solid #ddcfb6;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 18px 48px rgba(47, 74, 62, 0.10);
      }
      .hero {
        padding: 36px 32px 24px;
        background: linear-gradient(135deg, #2f4a3e 0%, #406351 100%);
        color: #f8f3e7;
        text-align: center;
      }
      .logo {
        display: block;
        width: 72px;
        height: 72px;
        margin: 0 auto 16px;
        border-radius: 18px;
        background: rgba(255, 253, 248, 0.12);
      }
      .eyebrow {
        margin: 0 0 12px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(248, 243, 231, 0.78);
      }
      .title {
        margin: 0;
        font-size: 40px;
        line-height: 1.08;
      }
      .subtitle {
        margin: 14px auto 0;
        max-width: 520px;
        font-family: Arial, sans-serif;
        font-size: 15px;
        line-height: 1.7;
        color: rgba(248, 243, 231, 0.86);
      }
      .content {
        padding: 30px 32px 18px;
        font-family: Arial, sans-serif;
        font-size: 16px;
        line-height: 1.8;
        color: #42584d;
      }
      .section-title {
        margin: 28px 0 10px;
        font-size: 20px;
        line-height: 1.3;
        color: #2f4a3e;
      }
      .summary-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      .summary-table td {
        padding: 8px 0;
        border-bottom: 1px solid #eadfcd;
        font-size: 15px;
        line-height: 1.6;
        color: #42584d;
      }
      .summary-table td:last-child {
        text-align: right;
        font-weight: 600;
      }
      .summary-total td {
        font-size: 18px;
        font-weight: 700;
        color: #2f4a3e;
        border-bottom: 0;
        padding-top: 14px;
      }
      .item-list {
        margin: 10px 0 0;
        padding-left: 20px;
      }
      .item-list li {
        margin: 0 0 10px;
      }
      .meta-line {
        margin: 0 0 10px;
      }
      .footer {
        padding: 0 32px 30px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        line-height: 1.7;
        color: #6b7d74;
      }
    </style>
  </head>
  <body>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="shell">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="card">
            <tr>
              <td class="hero">
                <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(config.appName)}" class="logo" width="72" height="72" />
                <p class="eyebrow">${escapeHtml(eyebrow)}</p>
                <h1 class="title">${escapeHtml(title)}</h1>
                <p class="subtitle">${escapeHtml(subtitle)}</p>
              </td>
            </tr>
            <tr>
              <td class="content">${contentHtml || formatContent(content)}</td>
            </tr>
            <tr>
              <td class="footer">${escapeHtml(footer)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
