/**
 * Email service using Nodemailer.
 * Server-only. NEVER import from client components.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

interface ResolvedEmailConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  fromAddress: string;
  fromName: string;
  secure: boolean;
  requireTls: boolean;
}

/**
 * Resolve sender address with the defined fallback chain:
 *   1. override fromAddress (if explicitly set by admin)
 *   2. smtpUser (login email doubles as sender)
 *   3. noreply@localhost
 */
function resolveSenderAddress(fromAddress: string | null, smtpUser: string | null): string {
  if (fromAddress && fromAddress.trim()) return fromAddress.trim();
  if (smtpUser && smtpUser.trim()) return smtpUser.trim();
  return "noreply@localhost";
}

/**
 * "Configured" means required transport fields are present.
 * fromAddress is NOT required; it has a fallback chain.
 */
function isTransportConfigured(host: string | null, port: number | null): boolean {
  return !!(host && host.trim() && port && port > 0);
}

async function getEmailConfig(): Promise<ResolvedEmailConfig | null> {
  const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });

  if (!config || !config.isEnabled || !isTransportConfigured(config.smtpHost, config.smtpPort)) {
    console.log(
      `[email] getEmailConfig: not available — enabled=${config?.isEnabled ?? false}, host=${config?.smtpHost ?? "(none)"}`
    );
    return null;
  }

  const decryptedPass = config.smtpPass
    ? (() => {
        try { return decrypt(config.smtpPass!); }
        catch { console.error("[email] getEmailConfig: failed to decrypt SMTP password"); return null; }
      })()
    : null;

  const enc = config.smtpEncryption ?? "STARTTLS";
  const fromAddress = resolveSenderAddress(config.fromAddress, config.smtpUser);

  console.log(
    `[email] getEmailConfig: host=${config.smtpHost} port=${config.smtpPort} enc=${enc} user=${config.smtpUser ?? "(none)"} from=${fromAddress}`
  );

  return {
    host: config.smtpHost!,
    port: config.smtpPort,
    user: config.smtpUser ?? null,
    pass: decryptedPass,
    fromAddress,
    fromName: config.fromName || "Yosan AI",
    secure: enc === "TLS",
    requireTls: enc === "STARTTLS",
  };
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(options: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  const config = await getEmailConfig();
  if (!config) {
    console.log("[email] sendMail: SMTP not configured or disabled — skipping send");
    return { ok: false, error: "SMTP not configured" };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html.replace(/<[^>]+>/g, ""),
    });

    console.log(`[email] sendMail: delivered to=${options.to} subject="${options.subject}"`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] sendMail: failed:", msg);
    return { ok: false, error: msg };
  }
}

export interface TestEmailParams {
  host: string;
  port: number;
  smtpEncryption?: string;
  user?: string;
  /** Plaintext password — never log this */
  pass?: string;
  /** Optional override sender address */
  fromAddress?: string | null;
  fromName?: string;
  toAddress: string;
}

/**
 * Classify nodemailer error into a short code for UI display.
 */
function classifySmtpError(err: unknown): { errorCode: string; error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  if (m.includes("auth") || m.includes("535") || m.includes("534") || m.includes("username") || m.includes("password") || m.includes("credentials")) {
    return { errorCode: "auth_failed", error: "Authentication failed — check your username and password" };
  }
  if (m.includes("getaddrinfo") || m.includes("enotfound") || m.includes("econnrefused") || m.includes("connect")) {
    return { errorCode: "bad_host", error: "Cannot connect to SMTP server — check host and port" };
  }
  if (m.includes("tls") || m.includes("ssl") || m.includes("starttls") || m.includes("wrong version") || m.includes("unsupported protocol")) {
    return { errorCode: "tls_mismatch", error: "TLS/encryption mismatch — try a different encryption setting" };
  }
  if (m.includes("timeout") || m.includes("etimedout")) {
    return { errorCode: "timeout", error: "Connection timed out — check host, port and firewall rules" };
  }
  if (m.includes("sender") || m.includes("from") || m.includes("550") || m.includes("553")) {
    return { errorCode: "sender_rejected", error: "Sender address was rejected — check your from address" };
  }
  return { errorCode: "send_failed", error: msg };
}

export async function testEmailConfig(params: TestEmailParams): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
  const enc = params.smtpEncryption ?? (params.port === 465 ? "TLS" : "STARTTLS");
  const fromAddress = resolveSenderAddress(params.fromAddress ?? null, params.user ?? null);
  const fromName = params.fromName || "Yosan AI";

  console.log(
    `[email] testEmailConfig: host=${params.host} port=${params.port} enc=${enc} user=${params.user ?? "(none)"} from=${fromAddress} to=${params.toAddress}`
  );

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: params.host,
      port: params.port,
      secure: enc === "TLS",
      requireTLS: enc === "STARTTLS",
      auth: params.user && params.pass ? { user: params.user, pass: params.pass } : undefined,
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: params.toAddress,
      subject: "Yosan AI — Test Email",
      html: testEmailHtml(fromAddress),
    });

    console.log(`[email] testEmailConfig: success — delivered to=${params.toAddress}`);
    return { ok: true };
  } catch (err) {
    const classified = classifySmtpError(err);
    console.error(`[email] testEmailConfig: failed errorCode=${classified.errorCode} error=${classified.error}`);
    return { ok: false, ...classified };
  }
}

// ---- Email templates ----

/** Direct public URL for the Yosan AI logo, loaded by email clients as an external image. */
const LOGO_URL =
  "https://raw.githubusercontent.com/monster-hub14/yosan-assets/main/Untitled%20design%20(7).png";

/**
 * Branded base template for all Yosan AI emails.
 * Uses an externally hosted logo URL so email clients load it directly — no base64,
 * no file reads, no data URIs. Emails stay well under Gmail's 102 KB clip threshold.
 * @param title  Card header title
 * @param body   HTML body content
 */
function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f2f5;padding:40px 0">
    <tr>
      <td align="center">
        <!-- Logo + app name above card -->
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px">
          <tr>
            <td align="center" style="padding:0 0 20px 0">
              <img src="${LOGO_URL}" alt="Yosan AI" height="48" style="display:block;margin:0 auto 10px auto;border:0;height:48px;width:auto" />
              <div style="color:#111827;font-size:22px;font-weight:700;letter-spacing:-0.01em">Yosan AI</div>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:560px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

          <!-- Card header -->
          <tr>
            <td style="background:#1d4ed8;padding:24px 32px">
              <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em">${title}</h1>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="padding:28px 32px;color:#111827;font-size:15px;line-height:1.65">
              ${body}
            </td>
          </tr>

          <!-- Card footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.5">
              Sent by <strong style="color:#6b7280">Yosan AI</strong> &mdash; self-hosted budget tracker.
              This is an automated message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function testEmailHtml(senderAddress: string): string {
  return baseTemplate(
    "SMTP Configuration Test",
    `<p style="margin:0 0 16px">Your Yosan AI instance can send email.</p>
    <table cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px 20px;width:100%;margin:0 0 16px">
      <tr>
        <td style="color:#0369a1;font-size:14px">
          <strong>SMTP is working correctly.</strong><br />
          Alerts, reminders, and summaries will be delivered from
          <span style="font-family:monospace;background:#e0f2fe;padding:2px 6px;border-radius:4px">${senderAddress}</span>.
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px">
      You can close this tab and return to settings. If you did not initiate this test, no action is needed.
    </p>`
  );
}

export function overspendingAlertEmail(params: {
  userName: string;
  budgetName: string;
  categoryName: string;
  spent: number;
  target: number;
  currency: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  const pct = Math.round((params.spent / params.target) * 100);
  return {
    subject: `⚠️ Over budget: ${params.categoryName} (${pct}% used) — ${params.budgetName}`,
    html: baseTemplate("Spending Alert", `
      <p>Hi ${params.userName},</p>
      <p>You've exceeded your budget for <strong>${params.categoryName}</strong> in <em>${params.budgetName}</em>.</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;background:#fef2f2;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Spent</td><td style="font-weight:700;font-size:18px;color:#dc2626;text-align:right">${fmt(params.spent)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Budget</td><td style="font-weight:600;text-align:right">${fmt(params.target)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Over by</td><td style="color:#dc2626;font-weight:600;text-align:right">${fmt(params.spent - params.target)}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:14px">Consider reviewing this category's spending before the end of your pay period.</p>
    `),
  };
}

export function weeklySummaryEmail(params: {
  userName: string;
  budgetName: string;
  totalSpent: number;
  totalIncome: number;
  currency: string;
  topCategories: { name: string; amount: number }[];
  status: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  const statusIcon = params.status === "on-track" ? "✅" : params.status === "at-risk" ? "⚠️" : "🔴";
  const catRows = params.topCategories.slice(0, 5)
    .map((c) => `<tr><td style="padding:4px 0;font-size:14px">${c.name}</td><td style="text-align:right;font-weight:600;font-size:14px">${fmt(c.amount)}</td></tr>`)
    .join("");

  return {
    subject: `${statusIcon} Weekly Budget Summary — ${params.budgetName}`,
    html: baseTemplate("Weekly Budget Summary", `
      <p>Hi ${params.userName}, here's your weekly spending summary for <em>${params.budgetName}</em>.</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;background:#f8faff;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Total spent</td><td style="font-weight:700;font-size:20px;text-align:right">${fmt(params.totalSpent)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Period income</td><td style="font-weight:600;text-align:right">${fmt(params.totalIncome)}</td></tr>
      </table>
      ${catRows ? `<p style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;font-weight:600;margin:20px 0 8px">Top Categories</p><table width="100%" cellpadding="0" cellspacing="0">${catRows}</table>` : ""}
    `),
  };
}

export function upcomingBillEmail(params: {
  userName: string;
  budgetName: string;
  billName: string;
  amount: number;
  dueDate: string;
  currency: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  return {
    subject: `📅 Upcoming bill: ${params.billName} due ${params.dueDate} — ${params.budgetName}`,
    html: baseTemplate("Upcoming Bill Reminder", `
      <p>Hi ${params.userName},</p>
      <p>You have an upcoming recurring bill in <em>${params.budgetName}</em>.</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;background:#f8faff;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Bill</td><td style="font-weight:700;font-size:18px;text-align:right">${params.billName}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Amount</td><td style="font-weight:600;text-align:right">${fmt(params.amount)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Due date</td><td style="text-align:right">${params.dueDate}</td></tr>
      </table>
    `),
  };
}

export function paydayReminderEmail(params: {
  userName: string;
  budgetName: string;
  payAmount: number;
  payDate: string;
  currency: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  return {
    subject: `💰 Payday tomorrow: ${fmt(params.payAmount)} — ${params.budgetName}`,
    html: baseTemplate("Payday Reminder", `
      <p>Hi ${params.userName},</p>
      <p>Your paycheck of <strong>${fmt(params.payAmount)}</strong> is expected tomorrow (${params.payDate}) in <em>${params.budgetName}</em>.</p>
      <p style="color:#6b7280;font-size:14px">Great time to review your budget and plan your spending for the next pay period.</p>
    `),
  };
}

export function deficitRiskEmail(params: {
  userName: string;
  budgetName: string;
  projectedDeficit: number;
  withinDays: number;
  currency: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  return {
    subject: `🔴 Cash flow alert: projected shortfall in ${params.withinDays} days — ${params.budgetName}`,
    html: baseTemplate("Cash Flow Deficit Risk", `
      <p>Hi ${params.userName},</p>
      <p>Your cash flow forecast for <em>${params.budgetName}</em> shows a projected deficit within the next <strong>${params.withinDays} days</strong>.</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;background:#fef2f2;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Projected shortfall</td><td style="font-weight:700;font-size:18px;color:#dc2626;text-align:right">${fmt(Math.abs(params.projectedDeficit))}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Within</td><td style="font-weight:600;text-align:right">${params.withinDays} days</td></tr>
      </table>
      <p style="color:#6b7280;font-size:14px">Review your upcoming bills and consider adjusting discretionary spending to avoid a negative balance.</p>
    `),
  };
}

export function savingsGoalRiskEmail(params: {
  userName: string;
  budgetName: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
}): { subject: string; html: string } {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: params.currency }).format(n);
  const pct = params.targetAmount > 0 ? Math.round((params.currentAmount / params.targetAmount) * 100) : 0;
  return {
    subject: `⚠️ Savings goal at risk: ${params.goalName} — ${params.budgetName}`,
    html: baseTemplate("Savings Goal At Risk", `
      <p>Hi ${params.userName},</p>
      <p>Your savings goal <strong>${params.goalName}</strong> in <em>${params.budgetName}</em> is at risk of not being met based on current spending.</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;background:#fffbeb;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Goal</td><td style="font-weight:700;font-size:18px;text-align:right">${fmt(params.targetAmount)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Progress</td><td style="font-weight:600;text-align:right">${fmt(params.currentAmount)} (${pct}%)</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Still needed</td><td style="color:#d97706;font-weight:600;text-align:right">${fmt(params.targetAmount - params.currentAmount)}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:14px">Consider reducing discretionary spending or increasing your per-paycheck savings contribution.</p>
    `),
  };
}

export function receiptReminderEmail(params: {
  userName: string;
  budgetName: string;
  daysSinceLastUpload: number;
}): { subject: string; html: string } {
  return {
    subject: `📎 Don't forget your receipts — ${params.budgetName}`,
    html: baseTemplate("Receipt Upload Reminder", `
      <p>Hi ${params.userName},</p>
      <p>It's been <strong>${params.daysSinceLastUpload} day${params.daysSinceLastUpload !== 1 ? "s" : ""}</strong> since your last receipt upload in <em>${params.budgetName}</em>.</p>
      <p style="color:#6b7280;font-size:14px">Keeping your receipts up to date helps Yosan AI give you accurate spending insights and cash flow forecasts.</p>
    `),
  };
}

// ---- Transactional emails ----

export function passwordChangedEmail(params: {
  userName: string;
  userEmail: string;
}): { subject: string; html: string } {
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return {
    subject: "Yosan AI — Your password has been changed",
    html: baseTemplate("Password Changed", `
      <p>Hi ${params.userName},</p>
      <p>Your Yosan AI account password was successfully changed on <strong>${timestamp} UTC</strong>.</p>
      <table cellpadding="0" cellspacing="0" role="presentation"
             style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px 20px;width:100%;margin:16px 0">
        <tr>
          <td style="color:#0369a1;font-size:14px">
            <strong>Account:</strong> ${params.userEmail}
          </td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:13px">
        If you did not make this change, please contact your Yosan AI administrator immediately.
      </p>
    `),
  };
}

export function welcomeEmail(params: {
  userName: string;
  userEmail: string;
  appUrl?: string;
}): { subject: string; html: string } {
  const loginLink = params.appUrl
    ? `<p style="margin:20px 0 0"><a href="${params.appUrl}/login" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600">Sign In to Yosan AI</a></p>`
    : "";
  return {
    subject: "Welcome to Yosan AI — your account is ready",
    html: baseTemplate("Welcome to Yosan AI", `
      <p>Hi ${params.userName},</p>
      <p>An administrator has created a Yosan AI account for you. You can now sign in with your credentials.</p>
      <table cellpadding="0" cellspacing="0" role="presentation"
             style="background:#f8faff;border-radius:6px;padding:16px 20px;width:100%;margin:16px 0">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Email</td><td style="font-weight:600;font-size:14px;text-align:right">${params.userEmail}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">
        Use the password provided by your administrator to sign in. You can change your password at any time from your account settings.
      </p>
      ${loginLink}
    `),
  };
}

export function budgetInviteEmail(params: {
  userName: string;
  budgetName: string;
  budgetType: string;
  role: string;
  inviterName: string;
  appUrl?: string;
}): { subject: string; html: string } {
  const roleLabel: Record<string, string> = {
    ADMIN: "Admin",
    MEMBER: "Member",
    VIEWER: "Viewer",
    HELPER: "Helper",
    CO_OWNER: "Co-owner",
  };
  const displayRole = roleLabel[params.role] ?? params.role;
  const typeLabel = params.budgetType === "SHARED" ? "shared" : "personal";
  const loginLink = params.appUrl
    ? `<p style="margin:20px 0 0"><a href="${params.appUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600">Open Yosan AI</a></p>`
    : "";
  return {
    subject: `You've been added to "${params.budgetName}" on Yosan AI`,
    html: baseTemplate("Budget Access Granted", `
      <p>Hi ${params.userName},</p>
      <p><strong>${params.inviterName}</strong> has added you to a ${typeLabel} budget on Yosan AI.</p>
      <table cellpadding="0" cellspacing="0" role="presentation"
             style="background:#f8faff;border-radius:6px;padding:16px 20px;width:100%;margin:16px 0">
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Budget</td><td style="font-weight:700;font-size:15px;text-align:right">${params.budgetName}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:3px 0">Your role</td><td style="font-weight:600;text-align:right">${displayRole}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">
        Sign in to Yosan AI to view your budgets and start tracking expenses.
      </p>
      ${loginLink}
    `),
  };
}
