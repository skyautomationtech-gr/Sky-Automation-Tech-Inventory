/**
 * EmailJS Configuration and Integration
 * Replace these placeholder keys with your actual EmailJS credentials.
 */

export const EMAILJS_SERVICE_ID = "service_sat_inv";   // Replace with your EmailJS Service ID
export const EMAILJS_TEMPLATE_ID = "template_otp_sat"; // Replace with your EmailJS Template ID
export const EMAILJS_PUBLIC_KEY = "user_sat_pub_key";  // Replace with your EmailJS Public Key

/**
 * Sends an OTP verification email using EmailJS REST API.
 * This approach does not require installing bulky extra npm modules.
 * @param email Recipient's email address
 * @param otp The 6-digit verification code
 * @param name Recipient's name
 */
export async function sendOTPEmail(email: string, otp: string, name: string = "User"): Promise<boolean> {
  // If the credentials are placeholders, we'll log to console and simulate success for the demo
  if (
    EMAILJS_SERVICE_ID === "service_sat_inv" || 
    EMAILJS_TEMPLATE_ID === "template_otp_sat" || 
    EMAILJS_PUBLIC_KEY === "user_sat_pub_key"
  ) {
    console.log(`[EmailJS Mock] Sending OTP ${otp} to ${email} (Name: ${name})`);
    return true;
  }

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name: name,
          to_email: email,
          otp_code: otp,
          reply_to: "support@skyautomation.tech"
        }
      })
    });

    if (response.ok) {
      console.log(`[EmailJS] OTP sent successfully to ${email}`);
      return true;
    } else {
      const errText = await response.text();
      console.error("[EmailJS Error Response]", errText);
      return false;
    }
  } catch (err) {
    console.error("[EmailJS Network/System Error]", err);
    return false;
  }
}

/**
 * Sends temporary credentials to a new user.
 */
export async function sendCredentialsEmail(
  email: string, 
  password: string, 
  name: string = "User"
): Promise<boolean> {
  // Use a generic template or a specific one if provided
  // For now, using the same logic as OTP but with different params
  if (
    EMAILJS_SERVICE_ID === "service_sat_inv" || 
    EMAILJS_PUBLIC_KEY === "user_sat_pub_key"
  ) {
    console.log(`[EmailJS Mock] Sending credentials to ${email}: PW=${password}`);
    return true;
  }

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: "template_credentials_sat", // Placeholder for credentials template
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name: name,
          to_email: email,
          temp_password: password,
          login_url: window.location.origin,
          reply_to: "support@skyautomation.tech"
        }
      })
    });

    return response.ok;
  } catch (err) {
    console.error("[EmailJS Credentials Error]", err);
    return false;
  }
}
