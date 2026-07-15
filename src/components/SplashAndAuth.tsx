import React, { useState, useEffect } from 'react';
import { 
  initializeUser, 
  getUserProfile,
  getAllUsers,
  findUserProfileByEmail,
  deleteUserProfile
} from '../firebase/db';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { auth as firebaseAuth } from '../firebase/config';
import { sendOTPEmail } from '../lib/emailjs';
import { UserProfile, UserRole } from '../types';
import { ShieldCheck, Mail, Lock, User, KeyRound, Sparkles, Send, CheckCircle2 } from 'lucide-react';

interface SplashAndAuthProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export default function SplashAndAuth({ onAuthSuccess }: SplashAndAuthProps) {
  const [showSplash, setShowSplash] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  
  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [userEnteredOtp, setUserEnteredOtp] = useState('');
  const [tempUserId, setTempUserId] = useState('');
  
  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Auto skip splash after 3 seconds, or click to proceed
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('staff');
    setOtpSent(false);
    setGeneratedOtp('');
    setUserEnteredOtp('');
    setTempUserId('');
    setError('');
    setInfoMessage('');
  };

  // Handle standard Login or Registration
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        // Handle password reset
        await sendPasswordResetEmail(firebaseAuth, email);
        setInfoMessage('Password reset email sent. Check your inbox!');
        setLoading(false);
        return;
      }

      if (!isLogin) {
        // Registration Flow
        if (!fullName.trim()) {
          setError('Please enter your full name for the operator profile.');
          setLoading(false);
          return;
        }

        const { createUserWithEmailAndPassword } = await import('firebase/auth');
        console.log("REGISTRATION - Creating Auth user for:", email);
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const userId = userCredential.user.uid;
        
        console.log("REGISTRATION - Initializing user profile document...");
        await initializeUser(userId, {
          name: fullName.trim(),
          email: email.toLowerCase().trim(),
          role: 'staff' // initializeUser automatically promotes first user to superadmin
        });
        
        console.log("REGISTRATION - Success! Refreshing profile...");
        const profile = await getUserProfile(userId);
        if (profile) {
          onAuthSuccess(profile);
          setLoading(false);
          return;
        }
      }

      // Standard Login
      try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        
        const userId = userCredential.user.uid;
        console.log("AUTH UID:", JSON.stringify(userId));
        console.log("AUTH UID LENGTH:", userId.length);
        console.log("QUERYING PATH: users/" + userId);
        
        // Force token refresh/synchronization to ensure Auth is fully synchronized with Firestore
        try {
          await userCredential.user.getIdToken(true);
        } catch (tokenErr) {
          console.warn('SplashAndAuth: Failed to force token refresh (non-blocking):', tokenErr);
        }
        
        // Brief delay to allow token propagation to Firestore
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get profile
        let profile = await getUserProfile(userId);
        
        if (!profile) {
          console.warn('SplashAndAuth: Profile missing for UID:', userId, 'Attempting self-healing...');
          try {
            const { findUserProfileByEmail, createUserProfile, deleteUserProfile } = await import('../firebase/db');
            
            // Re-verify token synchronization is complete
            try {
              await userCredential.user.getIdToken(true);
            } catch (tErr) {}
            await new Promise(resolve => setTimeout(resolve, 300));

            const orphanedProfile = await findUserProfileByEmail(email);
            if (orphanedProfile) {
              console.log('SplashAndAuth: AUTO-HEAL - Found profile for email at wrong ID:', orphanedProfile.id);
              // Migrate data to correct UID
              await createUserProfile(userId, { ...orphanedProfile, id: userId });
              
              // Try cleanup, but don't fail if permissions prevent it (only Super Admins can delete)
              try {
                await deleteUserProfile(orphanedProfile.id);
                console.log('SplashAndAuth: AUTO-HEAL - Old record cleaned up.');
              } catch (delErr) {
                console.warn('SplashAndAuth: AUTO-HEAL - Cleanup skipped (Permission issue). Record remains at old ID but account is now usable.');
              }

              // Re-fetch
              profile = await getUserProfile(userId);
              console.log('SplashAndAuth: AUTO-HEAL SUCCESS - Profile migrated.');
            }
          } catch (healErr) {
            console.error('SplashAndAuth: AUTO-HEAL FAILED:', healErr);
          }
        }

        if (!profile) {
          console.error('SplashAndAuth: CRITICAL - Profile missing for UID:', userId);
          setError('This account is not registered in the system. Please contact your Super Admin.');
          await signOut(firebaseAuth);
          setLoading(false);
          return;
        }

        // Safety Check: Suspended Account
        if (profile.active === false) {
          await signOut(firebaseAuth);
          setError('This account has been suspended. Please contact your Super Admin.');
          setLoading(false);
          return;
        }
        
        // Trigger OTP check for secure first-time login
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedOtp(otp);
        setTempUserId(userId);
        
        // Send via EmailJS (will mock if no custom keys are entered)
        const sent = await sendOTPEmail(email, otp, profile.name);
        setOtpSent(true);
        setInfoMessage(`A security verification code was sent to ${email}`);
      } catch (err: any) {
        console.error('Login error code:', err.code);
        console.error('Login error message:', err.message);
        
        if (err.code === 'auth/user-not-found') {
          setError('No account found with this email.');
        } else if (err.code === 'auth/wrong-password') {
          setError('Incorrect password.');
        } else if (err.code === 'auth/invalid-credential') {
          setError('Invalid email or password.');
        } else {
          setError(`Authentication failed (${err.code || 'unknown'}): ${err.message}`);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Only allow login if OTP matches the generated one
    if (userEnteredOtp === generatedOtp && generatedOtp !== '') {
      setLoading(true);
      try {
        const currentUser = firebaseAuth.currentUser;
        if (currentUser && currentUser.uid === tempUserId) {
          let profile = await getUserProfile(tempUserId);
          if (!profile) {
            await signOut(firebaseAuth);
            setError('This account is not registered in the system. Please contact your Super Admin.');
            setLoading(false);
            return;
          }

          if (profile.active === false) {
            await signOut(firebaseAuth);
            setError('This account has been suspended. Please contact your Super Admin.');
            setLoading(false);
            return;
          }
          
          onAuthSuccess(profile);
        } else if (tempUserId) {
          // If we had a profile loaded from login
          const profile = await getUserProfile(tempUserId);
          if (profile) {
            onAuthSuccess(profile);
          }
        }
      } catch (err: any) {
        console.error('Error initializing profile after OTP:', err);
        setError(err.message || 'Error initializing profile after OTP.');
      } finally {
        setLoading(false);
      }
    } else {
      setError('Incorrect verification code. Please try again.');
    }
  };

  // Splash Component Render
  if (showSplash) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between items-center p-8 text-center select-none animate-fade-in relative overflow-hidden">
        {/* Abstract background ambient glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />

        <div />

        {/* Logo Container */}
        <div className="flex flex-col items-center">
          <div className="w-28 h-28 bg-slate-900 rounded-3xl flex items-center justify-center border border-amber-400/30 shadow-[0_0_50px_rgba(251,191,36,0.15)] mb-6 animate-bounce">
            <span className="text-amber-400 font-bold text-4xl font-sans tracking-widest">SAT</span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-extrabold text-white font-sans tracking-tight">
            Sky Automation Tech
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mt-3 leading-relaxed">
            Premium Gadget & Mobile Accessories Inventory Core Management System
          </p>

          {/* Sub brands logos/chips */}
          <div className="flex gap-3 mt-8">
            <span className="px-3 py-1.5 rounded-full bg-slate-900 border border-amber-400/20 text-xs text-amber-400 font-medium font-sans">
              ★ GadgetZu
            </span>
            <span className="px-3 py-1.5 rounded-full bg-slate-900 border border-teal-500/20 text-xs text-teal-400 font-medium font-sans">
              ✦ RTX Gadget
            </span>
          </div>
        </div>

        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={() => setShowSplash(false)}
            className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-3.5 px-6 rounded-2xl transition-all duration-200 transform active:scale-95 shadow-[0_4px_20px_rgba(251,191,36,0.3)] font-sans text-sm"
          >
            Launch System Console
          </button>
          
          <p className="text-xs text-slate-500 font-mono tracking-wider">
            SECURE ACCESS ENCRYPTED
          </p>
        </div>
      </div>
    );
  }

  // Auth / OTP / Forgot Password view
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-amber-400/20 shadow-lg">
            <span className="text-amber-400 font-bold text-2xl font-sans">SAT</span>
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-white tracking-tight">
          {otpSent ? 'Security Verification' : isForgotPassword ? 'Reset Password' : isLogin ? 'Sign In to Console' : 'Create Operator Account'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          {otpSent 
            ? 'Verify with the OTP sent to your email.' 
            : isForgotPassword 
              ? 'Enter your recovery email below.' 
              : 'Sky Automation Tech Enterprise Ecosystem'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-4 shadow-2xl rounded-3xl border border-slate-800 sm:px-10">
          
          {error && (
            <div className="mb-4 bg-red-950/40 border border-red-500/30 text-red-300 p-3.5 rounded-2xl text-xs flex items-start gap-2">
              <span className="font-bold">Error:</span>
              <p>{error}</p>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 bg-teal-950/40 border border-teal-500/30 text-teal-300 p-3.5 rounded-2xl text-xs flex items-start gap-2">
              <CheckCircle2 size={16} className="text-teal-400 flex-shrink-0" />
              <p>{infoMessage}</p>
            </div>
          )}

          {/* OTP FORM */}
          {otpSent ? (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Enter 6-Digit OTP Code
                </label>
                <div className="mt-2 relative">
                  <KeyRound className="absolute top-3.5 left-3 text-slate-500" size={18} />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 123456"
                    value={userEnteredOtp}
                    onChange={(e) => setUserEnteredOtp(e.target.value)}
                    className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center text-xl tracking-widest font-mono"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-xs text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-500 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 transition-all duration-150"
              >
                {loading ? 'Verifying...' : 'Verify OTP & Log In'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Go Back to Login
                </button>
              </div>
            </form>
          ) : (
            /* GENERAL AUTH FORM */
            <form onSubmit={handleAuthSubmit} className="space-y-5">
              {!isLogin && !isForgotPassword && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Full Name
                  </label>
                  <div className="mt-1 relative">
                    <User className="absolute top-3.5 left-3 text-slate-500" size={18} />
                    <input
                      type="text"
                      placeholder="Your Full Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Email Address
                </label>
                <div className="mt-1 relative">
                  <Mail className="absolute top-3.5 left-3 text-slate-500" size={18} />
                  <input
                    type="email"
                    placeholder="email@skyautomation.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                    required
                  />
                </div>
              </div>

              {!isForgotPassword && (
                <div>
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Password
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(true)}
                        className="text-xs text-amber-500 hover:text-amber-400 hover:underline"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="mt-1 relative">
                    <Lock className="absolute top-3.5 left-3 text-slate-500" size={18} />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                      required={!isForgotPassword}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 transition-all duration-150"
                >
                  {loading 
                    ? 'Processing Network Request...' 
                    : isForgotPassword 
                      ? 'Send Recovery Code' 
                      : isLogin 
                        ? 'Authenticate Identity' 
                        : 'Register Operator Profile'}
                </button>
              </div>

              {/* Toggle Login/Register */}
              <div className="text-center mt-4">
                {isForgotPassword ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400 hover:underline"
                  >
                    Return to Log In
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError('');
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400 hover:underline"
                  >
                    {isLogin ? "Need a new account? Register Operator Profile" : "Already have an account? Sign In"}
                  </button>
                )}
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
