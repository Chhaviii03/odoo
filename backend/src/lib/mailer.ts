import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export function isSmtpConfigured() {
  return Boolean(env.smtp.user && env.smtp.pass && env.smtp.from);
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured (set SMTP_USER and SMTP_PASS)');
  }

  const transport = createTransport();
  await transport.sendMail({
    from: `"AssetFlow" <${env.smtp.from}>`,
    to,
    subject: 'Reset your AssetFlow password',
    text: `You requested a password reset for AssetFlow.\n\nOpen this link within 30 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <p>You requested a password reset for <strong>AssetFlow</strong>.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in <strong>30 minutes</strong>.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}
