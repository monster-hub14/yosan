/**
 * Email service using Nodemailer.
 * Server-only. NEVER import from client components.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

interface EmailConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  fromAddress: string;
  fromName: string;
  secure: boolean;
}

async function getEmailConfig(): Promise<EmailConfig | null> {
  const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.isEnabled || !config.smtpHost || !config.fromAddress) return null;

  const decryptedPass = config.smtpPass ? (() => { try { return decrypt(config.smtpPass!); } catch { return null; } })() : null;

  return {
    host: config.smtpHost,
    port: config.smtpPort,
    user: config.smtpUser ?? null,
    pass: decryptedPass,
    fromAddress: config.fromAddress,
    fromName: config.fromName || "Budget App",
    secure: config.smtpPort === 465,
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
    console.log("[email] SMTP not configured or disabled — skipping send");
    return { ok: false, error: "SMTP not configured" };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html.replace(/<[^>]+>/g, ""),
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] Send failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function testEmailConfig(config: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: config.toAddress,
      subject: "Budget App — Test Email",
      html: `<p>This is a test email from your Budget App. SMTP configuration is working correctly.</p>`,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Email templates ----

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px">
<tr><td style="background:#2563eb;padding:24px 32px">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${title}</h1>
</td></tr>
<tr><td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.6">
${body}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f8f8;color:#888;font-size:12px;border-top:1px solid #eee">
Sent by Budget App &mdash; <a href="#" style="color:#2563eb">Manage notification preferences</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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
      <table style="margin:16px 0;background:#fff4f4;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#888;font-size:13px">Spent</td><td style="font-weight:700;font-size:18px;color:#dc2626">${fmt(params.spent)}</td></tr>
        <tr><td style="color:#888;font-size:13px">Budget</td><td style="font-weight:600">${fmt(params.target)}</td></tr>
        <tr><td style="color:#888;font-size:13px">Over by</td><td style="color:#dc2626;font-weight:600">${fmt(params.spent - params.target)}</td></tr>
      </table>
      <p>Consider reviewing this category's spending before the end of your pay period.</p>
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
    .map((c) => `<tr><td style="padding:4px 0">${c.name}</td><td style="text-align:right;font-weight:600">${fmt(c.amount)}</td></tr>`)
    .join("");

  return {
    subject: `${statusIcon} Weekly Budget Summary — ${params.budgetName}`,
    html: baseTemplate("Weekly Budget Summary", `
      <p>Hi ${params.userName}, here's your weekly spending summary for <em>${params.budgetName}</em>.</p>
      <table style="margin:16px 0;background:#f8faff;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#888;font-size:13px">Total spent</td><td style="font-weight:700;font-size:20px">${fmt(params.totalSpent)}</td></tr>
        <tr><td style="color:#888;font-size:13px">Period income</td><td style="font-weight:600">${fmt(params.totalIncome)}</td></tr>
      </table>
      ${catRows ? `<h3 style="margin-top:24px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#888">Top Categories</h3><table style="width:100%">${catRows}</table>` : ""}
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
      <table style="margin:16px 0;background:#f8faff;border-radius:6px;padding:16px;width:100%">
        <tr><td style="color:#888;font-size:13px">Bill</td><td style="font-weight:700;font-size:18px">${params.billName}</td></tr>
        <tr><td style="color:#888;font-size:13px">Amount</td><td style="font-weight:600">${fmt(params.amount)}</td></tr>
        <tr><td style="color:#888;font-size:13px">Due date</td><td>${params.dueDate}</td></tr>
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
      <p>Great time to review your budget and plan your spending for the next pay period.</p>
    `),
  };
}
