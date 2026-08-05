import { EMAILJS_CONFIG } from '../config/emailjs';

/**
 * Sends an OTP verification email using EmailJS REST API.
 * @param email Recipient's email address
 * @param otp The 6-digit verification code
 * @param name Recipient's name
 */
export async function sendOTPEmail(email: string, otp: string, name: string = "User"): Promise<{ success: boolean; error?: string }> {
  console.log(`[EmailJS Debug] sendOTPEmail called with email: "${email}", name: "${name}"`);
  if (!email || !email.trim()) {
    console.warn("[EmailJS Warning] Aborting sendOTPEmail: recipient email is empty!");
    return { success: false, error: "Recipient email is empty" };
  }
  try {
    const cleanEmail = email.trim();
    const cleanName = name || "User";
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: EMAILJS_CONFIG.SERVICE_ID,
        template_id: EMAILJS_CONFIG.OTP_TEMPLATE_ID,
        user_id: EMAILJS_CONFIG.PUBLIC_KEY,
        template_params: {
          to_name: cleanName,
          name: cleanName,
          user_name: cleanName,
          recipient_name: cleanName,
          to_email: cleanEmail,
          email: cleanEmail,
          to: cleanEmail,
          recipient: cleanEmail,
          recipient_email: cleanEmail,
          user_email: cleanEmail,
          userEmail: cleanEmail,
          mail: cleanEmail,
          client_email: cleanEmail,
          applicant_email: cleanEmail,
          employee_email: cleanEmail,
          otp_code: otp,
          otp: otp,
          code: otp,
          passcode: otp,
          verification_code: otp,
          reply_to: "support@skyautomation.tech"
        }
      })
    });

    if (response.ok) {
      console.log(`[EmailJS] OTP sent successfully to ${cleanEmail}`);
      return { success: true };
    } else {
      const errText = await response.text();
      console.warn("[EmailJS Notice - Check Dashboard Template To Field]", errText);
      return { success: false, error: `EmailJS API Error (${response.status}): ${errText}` };
    }
  } catch (err: any) {
    console.warn("[EmailJS Network/System Notice]", err);
    return { success: false, error: `Network/System Error: ${err?.message || 'Unknown error'}` };
  }
}

/**
 * Sends a welcome approval confirmation email to a newly approved employee using the Welcome Template ID.
 * Parameters passed:
 * - to_name: employee's name
 * - email_subject: "Welcome to Sky Automation Tech!"
 * - email_body: "Your account has been approved! Your Employee ID is [EMPLOYEE_ID]. You can now log in."
 */
export async function sendWelcomeEmail(
  email: string,
  employeeId: string,
  name: string = "Employee"
): Promise<{ success: boolean; error?: string }> {
  console.log(`[EmailJS Debug] sendWelcomeEmail called with email: "${email}", employeeId: "${employeeId}", name: "${name}"`);
  if (!email || !email.trim()) {
    console.warn("[EmailJS Warning] Aborting sendWelcomeEmail: recipient email is empty!");
    return { success: false, error: "Recipient email is empty" };
  }
  try {
    const cleanEmail = email.trim();
    const cleanName = name || "Employee";
    const emailSubject = "Welcome to Sky Automation Tech!";
    const emailBody = `Your account has been approved! Your Employee ID is ${employeeId}. You can now log in.`;

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: EMAILJS_CONFIG.SERVICE_ID,
        template_id: EMAILJS_CONFIG.WELCOME_TEMPLATE_ID,
        user_id: EMAILJS_CONFIG.PUBLIC_KEY,
        template_params: {
          to_name: cleanName,
          name: cleanName,
          user_name: cleanName,
          recipient_name: cleanName,
          to_email: cleanEmail,
          email: cleanEmail,
          to: cleanEmail,
          recipient: cleanEmail,
          recipient_email: cleanEmail,
          user_email: cleanEmail,
          userEmail: cleanEmail,
          mail: cleanEmail,
          client_email: cleanEmail,
          applicant_email: cleanEmail,
          employee_email: cleanEmail,
          email_subject: emailSubject,
          subject: emailSubject,
          email_body: emailBody,
          message: emailBody,
          body: emailBody,
          employee_id: employeeId,
          employeeId: employeeId,
          login_url: window.location.origin,
          reply_to: "support@skyautomation.tech"
        }
      })
    });

    if (response.ok) {
      console.log(`[EmailJS] Welcome email sent successfully to ${cleanEmail}`);
      return { success: true };
    } else {
      const errText = await response.text();
      console.warn("[EmailJS Welcome Email Notice - Check Dashboard Template To Field]", errText);
      return { success: false, error: errText };
    }
  } catch (err: any) {
    console.warn("[EmailJS Welcome Email Network/System Notice]", err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

// Kept for compatibility if imported elsewhere, but delegates to mock/no-op per instructions (Rejection handled in-app without email)
export async function sendCredentialsEmail(
  email: string, 
  password: string, 
  name: string = "User"
): Promise<boolean> {
  console.log(`[EmailJS] Credentials email skipped or handled in-app.`);
  return true;
}

export async function sendRejectionEmail(
  email: string,
  reason: string,
  name: string = "Applicant"
): Promise<boolean> {
  console.log(`[EmailJS] Rejection email skipped per user instruction (in-app only).`);
  return true;
}
