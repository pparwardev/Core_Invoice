import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Core-Invoice" <noreply@coreinvoice.com>',
    to: email,
    subject: 'Verify Your Email - Core-Invoice',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; font-size: 28px; margin: 0;">Core<span style="color: #f59e0b;">_Invoice</span></h1>
          <p style="color: #666; font-size: 14px; margin-top: 5px;">Vendor Billing Management System</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; border: 1px solid #e9ecef;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Welcome, ${name}!</h2>
          <p style="color: #555; line-height: 1.6;">
            Thank you for registering with Core-Invoice. Please verify your email address to activate your account.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background: #f59e0b; color: #1a1a2e; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #888; font-size: 12px; text-align: center;">
            This link will expire in 24 hours. If you didn't create this account, please ignore this email.
          </p>
        </div>
        <p style="color: #aaa; font-size: 11px; text-align: center; margin-top: 20px;">
          © Core-Invoice | Precision in Every Payment
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
