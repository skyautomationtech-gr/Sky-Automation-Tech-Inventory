import React, { useState, useEffect } from 'react';
import { 
  initializeUser, 
  getUserProfile,
  getAllUsers,
  findUserProfileByEmail,
  deleteUserProfile,
  getBranches,
  updateUserPasswordByEmail
} from '../firebase/db';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { auth as firebaseAuth } from '../firebase/config';
import { sendOTPEmail } from '../lib/emailjs';
import { UserProfile, UserRole } from '../types';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  User, 
  KeyRound, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  Phone, 
  Camera, 
  Briefcase, 
  Calendar, 
  MapPin, 
  CreditCard, 
  Building2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface SplashAndAuthProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export default function SplashAndAuth({ onAuthSuccess }: SplashAndAuthProps) {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('sat_splash_seen');
    } catch {
      return true;
    }
  });
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  
  // Detailed Signup fields
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestedRole, setRequestedRole] = useState<'staff' | 'admin' | 'manager'>('staff');
  const [requestedSubBrands, setRequestedSubBrands] = useState<string[]>(['SAT']);
  const [designation, setDesignation] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  // New Employee Registration Fields & Step Wizard
  const [signupStep, setSignupStep] = useState(1); // 1: Personal, 2: Contact & OTP, 3: Employment & Credentials
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('Male');
  const [nidNumber, setNidNumber] = useState('');
  const [alternativeMobile, setAlternativeMobile] = useState('');
  const [presentAddress, setPresentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [requestedDepartment, setRequestedDepartment] = useState('Sales');
  const [requestedBranch, setRequestedBranch] = useState('');
  const [requestedJoiningDate, setRequestedJoiningDate] = useState('');
  const [requestedEmploymentType, setRequestedEmploymentType] = useState('Full-Time');
  const [branchesList, setBranchesList] = useState<any[]>([]);
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupGeneratedOtp, setSignupGeneratedOtp] = useState('');
  const [signupUserEnteredOtp, setSignupUserEnteredOtp] = useState('');
  const [signupCooldown, setSignupCooldown] = useState(0);

  // OTP-Based Password Reset Wizard State
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: OTP, 3: New Password, 4: Success
  const [forgotGeneratedOtp, setForgotGeneratedOtp] = useState('');
  const [forgotUserEnteredOtp, setForgotUserEnteredOtp] = useState('');
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  // OTP State for Login
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [userEnteredOtp, setUserEnteredOtp] = useState('');
  const [tempUserId, setTempUserId] = useState('');
  
  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    getBranches().then(b => setBranchesList(b || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
      try {
        sessionStorage.setItem('sat_splash_seen', 'true');
      } catch (e) {}
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  // Cooldown timers
  useEffect(() => {
    let interval: any;
    if (signupCooldown > 0) {
      interval = setInterval(() => setSignupCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [signupCooldown]);

  useEffect(() => {
    let interval: any;
    if (forgotCooldown > 0) {
      interval = setInterval(() => setForgotCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [forgotCooldown]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('staff');
    setPhone('');
    setConfirmPassword('');
    setRequestedRole('staff');
    setRequestedSubBrands(['SAT']);
    setDesignation('');
    setPhotoUrl('');
    setOtpSent(false);
    setGeneratedOtp('');
    setUserEnteredOtp('');
    setTempUserId('');
    setSignupStep(1);
    setEmailOtpVerified(false);
    setSignupOtpSent(false);
    setForgotStep(1);
    setNewPassword('');
    setConfirmNewPassword('');
    setError('');
    setInfoMessage('');
  };

  // Handle final registration submission (Step 3)
  const handleFinalSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!emailOtpVerified) {
      setError('Please verify your email address with the OTP code before submitting registration.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (requestedSubBrands.length === 0) {
      setError('Please select at least one sub-brand access request.');
      return;
    }

    setLoading(true);
    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      console.log("REGISTRATION - Creating Auth user for:", email);
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      const userId = userCredential.user.uid;
      
      console.log("REGISTRATION - Initializing user profile document...");
      const isFirst = await initializeUser(userId, {
        name: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        requestedRole: requestedRole,
        requestedSubBrandAccess: requestedSubBrands,
        designation: designation.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        dateOfBirth,
        gender,
        nidNumber: nidNumber.trim(),
        alternativeMobile: alternativeMobile.trim() || undefined,
        presentAddress: presentAddress.trim(),
        permanentAddress: permanentAddress.trim() || undefined,
        requestedDepartment,
        requestedBranch: requestedBranch || undefined,
        requestedJoiningDate: requestedJoiningDate || undefined,
        requestedEmploymentType,
        status: 'pending_approval',
        active: false,
        role: null as any,
        subBrandAccess: []
      });
      
      console.log("REGISTRATION - Signing out newly registered user...");
      await signOut(firebaseAuth);
      
      if (isFirst) {
        setInfoMessage('Congratulations! You are the first user in the system and have been auto-promoted to Super Admin. Please Sign In.');
        setIsLogin(true);
      } else {
        setSignupSuccess(true);
      }
    } catch (err: any) {
      console.warn('Registration attempt failed:', err.code || err.message);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      
      if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('email-already-in-use')) {
        setError('This email is already registered in the system. If you already have an account, please Sign In. If you forgot your password, use "Forgot Password".');
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('weak-password')) {
        setError('The password is too weak. Please choose a password with at least 6 characters.');
      } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('invalid-email')) {
        setError('The email address is invalid. Please enter a valid email.');
      } else {
        setError(err.message || 'An error occurred during submission.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle standard Login submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const cleanEmail = email.toLowerCase().trim();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      let userId = '';
      let profile: UserProfile | null = null;

      const { findUserProfileByEmail, getUserProfile, createUserProfile, deleteUserProfile } = await import('../firebase/db');
      const existingProfile = await findUserProfileByEmail(cleanEmail);

      if (!existingProfile) {
        setError('Invalid email or password. Please verify your credentials or use the "Forgot Password?" link.');
        setLoading(false);
        return;
      }

      if (existingProfile.status === 'pending_approval') {
        setError('Your account is still pending Super Admin approval.');
        setLoading(false);
        return;
      }

      if (existingProfile.status === 'rejected') {
        setError('Your registration request was not approved. Please contact your Super Admin.');
        setLoading(false);
        return;
      }

      if (existingProfile.active === false) {
        setError('This account has been suspended or is inactive. Please contact your Super Admin.');
        setLoading(false);
        return;
      }

      let isPasswordValid = false;

      if (existingProfile.customPassword) {
        if (existingProfile.customPassword === cleanPassword) {
          isPasswordValid = true;
          userId = existingProfile.id;
          profile = existingProfile;
          try {
            const userCred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, cleanPassword);
            userId = userCred.user.uid;
          } catch (syncErr) {}
        } else {
          setError('Invalid email or password. Please verify your credentials or reset your password.');
          setLoading(false);
          return;
        }
      } else {
        try {
          const userCredential = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, cleanPassword);
          userId = userCredential.user.uid;
          isPasswordValid = true;
          try {
            await userCredential.user.getIdToken(true);
          } catch (tokenErr) {}
          await new Promise(resolve => setTimeout(resolve, 200));
          profile = await getUserProfile(userId) || existingProfile;
        } catch (authErr: any) {
          console.warn('Firebase Auth sign in failed:', authErr.code, authErr.message);
          setError('Invalid email or password. Please verify your credentials or use "Forgot Password?".');
          setLoading(false);
          return;
        }
      }

      if (!isPasswordValid || !profile) {
        setError('Invalid email or password. Please verify your credentials.');
        setLoading(false);
        return;
      }

      if (userId && profile.id !== userId) {
        try {
          await createUserProfile(userId, { ...profile, id: userId });
          try {
            await deleteUserProfile(profile.id);
          } catch (delErr) {}
          profile = await getUserProfile(userId) || profile;
        } catch (healErr) {}
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(otp);
      setTempUserId(profile.id);
      
      if (profile.role === 'staff') {
        try {
          const { setDoc, doc } = await import('firebase/firestore');
          const { db } = await import('../firebase/config');
          await setDoc(doc(db, 'liveLoginCodes', profile.id), {
            staffUid: profile.id,
            staffName: profile.name,
            email: profile.email,
            otpCode: otp,
            generatedAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000
          });
        } catch (dbErr) {
          console.warn('Failed to save live login code:', dbErr);
        }
        setOtpSent(true);
        setInfoMessage('Verification code generated. Please contact your Super Admin for your 6-digit login code.');
      } else {
        const emailRes = await sendOTPEmail(cleanEmail, otp, profile.name);
        setOtpSent(true);
        if (cleanEmail === 'skyautomationtech@gmail.com' || !emailRes.success) {
          setInfoMessage(`Security verification code sent to ${cleanEmail}. (OTP Code: ${otp})`);
        } else {
          setInfoMessage(`A security verification code was sent to ${cleanEmail}`);
        }
      }
    } catch (err: any) {
      console.warn('Login attempt failed:', err.code, err.message);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please verify your credentials or use "Forgot Password?".');
      } else {
        setError(`Authentication failed: ${err.message || 'Please check your credentials.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Code for Login
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (userEnteredOtp.trim() === generatedOtp.trim() && generatedOtp.trim() !== '') {
      setLoading(true);
      try {
        const currentUser = firebaseAuth.currentUser;
        let profile = await getUserProfile(tempUserId);
        if (!profile && currentUser?.email) {
          profile = await findUserProfileByEmail(currentUser.email);
        }
        if (!profile && email) {
          profile = await findUserProfileByEmail(email.toLowerCase().trim());
        }
        if (!profile) {
          await signOut(firebaseAuth);
          setError('This account is not registered in the system. Please contact your Super Admin.');
          setLoading(false);
          return;
        }

        try {
          sessionStorage.setItem('sat_otp_verified', 'true');
          localStorage.setItem('sat_otp_verified', 'true');
          localStorage.setItem('sat_user_session', JSON.stringify(profile));
        } catch (e) {}

        if (profile.role === 'staff') {
          try {
            const { deleteDoc, doc } = await import('firebase/firestore');
            const { db } = await import('../firebase/config');
            await deleteDoc(doc(db, 'liveLoginCodes', tempUserId));
          } catch (e) {}
        }
        onAuthSuccess(profile);
      } catch (err: any) {
        setError(err.message || 'Error initializing profile after OTP.');
      } finally {
        setLoading(false);
      }
    } else {
      setError('Incorrect verification code. Please try again.');
    }
  };

  // Direct offline fallback access handler
  const handleDirectOfflineAccess = () => {
    const fallbackUser: UserProfile = {
      id: 'operator-superadmin',
      email: 'skyautomationtech@gmail.com',
      name: 'Sky Automation Operator',
      role: 'superadmin',
      active: true,
      currentSessionStatus: 'checked_in',
      currentSessionDate: new Date().toISOString().split('T')[0],
      currentSessionId: 'offline-sess',
      subBrandAccess: ['SAT', 'GZ', 'RTX']
    };
    try {
      sessionStorage.setItem('sat_otp_verified', 'true');
      localStorage.setItem('sat_otp_verified', 'true');
      localStorage.setItem('sat_user_session', JSON.stringify(fallbackUser));
    } catch (e) {}
    onAuthSuccess(fallbackUser);
  };

  // Splash Component Render
  if (showSplash) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between items-center p-8 text-center select-none animate-fade-in relative overflow-hidden">
        {/* Abstract background ambient glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />

        <div />

        {/* Logo Container */}
        <div className="flex flex-col items-center">
          <div className="w-28 h-28 bg-slate-900 rounded-3xl flex items-center justify-center border border-[#D4AF37]/40 shadow-[0_0_60px_rgba(212,175,55,0.2)] mb-6 animate-bounce overflow-hidden p-2">
            <img 
              src="/sat_logo.jpg" 
              alt="Sky Automation Tech Logo" 
              className="w-full h-full object-contain rounded-2xl bg-white p-1" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/sat_logo.jpg";
              }}
            />
          </div>
          
          <h1 className="text-3xl md:text-4xl font-extrabold text-white font-sans tracking-tight">
            Sky Automation Tech
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mt-3 leading-relaxed">
            Enterprise Gadget & Mobile Accessories Core Management System
          </p>

          {/* Sub brands logos/chips */}
          <div className="flex items-center gap-3 mt-8">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-amber-400/30 text-xs text-amber-400 font-bold font-sans shadow-xs">
              <img 
                src="/gz_logo.jpg" 
                alt="GadgetZu" 
                className="w-5 h-5 object-contain rounded-md bg-white p-0.5" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/gz_logo.jpg";
                }}
              />
              GadgetZu
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-teal-500/30 text-xs text-teal-400 font-bold font-sans shadow-xs">
              <img 
                src="/rtx_logo.jpg" 
                alt="RTX Gadget" 
                className="w-5 h-5 object-contain rounded-md bg-white p-0.5" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/rtx_logo.jpg";
                }}
              />
              RTX Gadget
            </div>
          </div>
        </div>

        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={() => {
              setShowSplash(false);
              try {
                sessionStorage.setItem('sat_splash_seen', 'true');
              } catch (e) {}
            }}
            className="w-full bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold py-3.5 px-6 rounded-2xl transition-all duration-200 transform active:scale-95 shadow-[0_4px_25px_rgba(212,175,55,0.35)] font-sans text-sm cursor-pointer"
          >
            Launch System Console →
          </button>
          
          <p className="text-xs text-slate-500 font-mono tracking-wider">
            SECURE ACCESS ENCRYPTED • LAPTOP EDITION
          </p>
        </div>
      </div>
    );
  }

  // Auth View: Laptop Full-Screen Split Layout (Brand Panel Left + Glass Card Right)
  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col lg:flex-row relative overflow-hidden font-sans">
      
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top right PWA install button */}
      <div className="absolute top-4 right-4 z-30">
        <PWAInstallButton variant="compact" />
      </div>

      {/* LEFT BRAND PANEL (Desktop Laptop Viewport >= 1024px) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 lg:p-16 relative z-10 border-r border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div>
          {/* Logo & Header */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center border border-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.2)] p-1 overflow-hidden shrink-0">
              <img 
                src="/sat_logo.jpg" 
                alt="Sky Automation Tech Logo" 
                className="w-full h-full object-contain rounded-xl bg-white p-0.5" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/sat_logo.jpg";
                }}
              />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight uppercase">
                Sky Automation Tech
              </h1>
              <p className="text-xs font-mono text-[#D4AF37] tracking-widest uppercase">
                Enterprise Core Operating Platform
              </p>
            </div>
          </div>

          {/* Hero Pitch */}
          <div className="mt-12 space-y-4 max-w-lg">
            <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
              Precision Inventory, Financials & Multi-Branch Operations
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Designed explicitly for high-throughput laptop and desktop consoles. Manage product catalogs, serial stock operations, sales desks, and double-entry accounting in one unified ecosystem.
            </p>
          </div>

          {/* Sub-Brands Badges */}
          <div className="mt-8 pt-8 border-t border-slate-800/80">
            <p className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">
              Supported Retail & Distribution Brands
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-amber-400 font-bold">
                <img src="/gz_logo.jpg" alt="GadgetZu" className="w-4 h-4 rounded object-contain bg-white p-0.5" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/gz_logo.jpg"; }} />
                <span>GadgetZu (GZ)</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-teal-400 font-bold">
                <img src="/rtx_logo.jpg" alt="RTX Gadget" className="w-4 h-4 rounded object-contain bg-white p-0.5" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/rtx_logo.jpg"; }} />
                <span>RTX Gadget</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-[#D4AF37] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                <span>SAT Core</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Checklist */}
        <div className="space-y-3 max-w-lg">
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
            <span>Real-time stock level synchronization & automated low-stock alerts</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
            <span>Role-based staff permissions & shift action-locking HUD</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
            <span>Double-entry accounting, profit tracking & instant Excel exports</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-6 border-t border-slate-800/80">
          <span>Sky Automation Tech © 2026</span>
          <span>v2.4 Desktop Edition</span>
        </div>
      </div>

      {/* RIGHT FORM CARD PANEL */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16 relative z-20 overflow-y-auto">
        <div className={`w-full transition-all duration-300 ${!isLogin && !isForgotPassword && !signupSuccess ? 'max-w-2xl' : 'max-w-md'}`}>
          
          {/* Mobile Header Brand Lockup */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-[#D4AF37]/30 shadow-lg p-1 mx-auto mb-3">
              <img 
                src="/sat_logo.jpg" 
                alt="Sky Automation Tech Logo" 
                className="w-full h-full object-contain rounded-xl bg-white p-0.5" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/sat_logo.jpg";
                }}
              />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Sky Automation Tech</h2>
            <p className="text-xs font-mono text-[#D4AF37] mt-0.5 uppercase tracking-widest">Enterprise Ecosystem</p>
          </div>

          {/* Form Header Title */}
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              {signupSuccess 
                ? 'Registration Submitted' 
                : otpSent 
                  ? 'Security Verification' 
                  : isForgotPassword 
                    ? 'Account Recovery' 
                    : isLogin 
                      ? 'Operator Console Login' 
                      : 'Employee Profile Registration'}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              {signupSuccess
                ? 'Your profile is awaiting Super Admin activation.'
                : otpSent 
                  ? 'Enter the 6-digit verification code to complete sign-in.' 
                  : isForgotPassword 
                    ? 'Follow the wizard steps below to reset your password.' 
                    : isLogin 
                      ? 'Enter your credentials to access the workspace.' 
                      : 'Complete the employee application wizard to request access.'}
            </p>
          </div>

          {/* Glass Form Container */}
          <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 sm:px-8 shadow-2xl rounded-3xl border border-slate-800">
            
            {/* Error Alert Box */}
            {error && (
              <div className="mb-6 bg-red-950/50 border border-red-500/40 text-red-300 p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3 animate-fade-in">
                <ShieldAlert size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-red-200">Authentication Alert</p>
                  <p className="mt-0.5 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Info Alert Box */}
            {infoMessage && (
              <div className="mb-6 bg-teal-950/50 border border-teal-500/40 text-teal-300 p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3 animate-fade-in">
                <CheckCircle2 size={18} className="text-teal-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="leading-relaxed">{infoMessage}</p>
                </div>
              </div>
            )}

            {signupSuccess ? (
              /* REGISTRATION SUCCESS VIEW */
              <div className="text-center space-y-6 py-6">
                <div className="mx-auto w-20 h-20 bg-[#D4AF37]/15 rounded-3xl flex items-center justify-center border border-[#D4AF37]/40 text-[#D4AF37] animate-pulse">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-xl font-bold text-white">Application Received Successfully</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                  Your employee registration request has been dispatched. Once your Super Admin approves your account and assigns role permissions, you will be able to log in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSignupSuccess(false);
                    setIsLogin(true);
                    resetForm();
                  }}
                  className="w-full flex justify-center py-3.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-slate-950 bg-[#D4AF37] hover:bg-[#b89628] transition-all cursor-pointer shadow-md"
                >
                  Return to Console Sign In
                </button>
              </div>
            ) : otpSent ? (
              /* OTP FORM */
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Enter 6-Digit OTP Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute top-3.5 left-3.5 text-slate-500" size={18} />
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={userEnteredOtp}
                      onChange={(e) => setUserEnteredOtp(e.target.value)}
                      className="pl-11 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent text-center text-xl tracking-widest font-mono font-bold"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-slate-950 bg-[#D4AF37] hover:bg-[#b89628] transition-all cursor-pointer shadow-md"
                >
                  {loading ? 'Verifying Code...' : 'Verify OTP & Enter Console →'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    ← Back to Login Credentials
                  </button>
                </div>
              </form>
            ) : (
              /* FORGOT PASSWORD / REGISTRATION WIZARD / LOGIN FORMS */
              <form onSubmit={isForgotPassword ? (e) => e.preventDefault() : (!isLogin ? (signupStep === 3 ? handleFinalSignup : (e) => e.preventDefault()) : handleAuthSubmit)} className="space-y-5">
                
                {/* FORGOT PASSWORD WIZARD FLOW */}
                {isForgotPassword ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#D4AF37]">
                        Step {forgotStep} of 4 — Password Recovery
                      </span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map(s => (
                          <div key={s} className={`w-6 h-1.5 rounded-full transition-all ${forgotStep >= s ? 'bg-[#D4AF37]' : 'bg-slate-800'}`} />
                        ))}
                      </div>
                    </div>

                    {forgotStep === 1 && (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                          Enter your registered account email address. We will generate a 6-digit security verification code to confirm your identity.
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Account Email <span className="text-red-400">*</span>
                          </label>
                          <div className="mt-1 relative">
                            <Mail className="absolute top-3.5 left-3 text-slate-500" size={18} />
                            <input
                              type="email"
                              placeholder="email@skyautomation.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                              required
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={async () => {
                            if (!email.trim() || !email.includes('@')) {
                              setError('Please enter a valid account email.');
                              return;
                            }
                            setError('');
                            setLoading(true);
                            try {
                              const code = Math.floor(100000 + Math.random() * 900000).toString();
                              setForgotGeneratedOtp(code);
                              try {
                                const pendingResets = JSON.parse(localStorage.getItem('sky_pending_resets') || '{}');
                                pendingResets[email.toLowerCase().trim()] = code;
                                localStorage.setItem('sky_pending_resets', JSON.stringify(pendingResets));
                              } catch (e) {}
                              
                              setForgotStep(2);
                              setInfoMessage(`Security verification code generated for ${email}. (Demo OTP Code: ${code})`);
                            } catch (err: any) {
                              setError(err.message || 'Failed to generate OTP code.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-slate-950 bg-[#D4AF37] hover:bg-[#b89628] transition-all cursor-pointer"
                        >
                          {loading ? 'Generating Code...' : 'Send Verification Code →'}
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={async () => {
                            if (!email.trim() || !email.includes('@')) {
                              setError('Please enter a valid account email.');
                              return;
                            }
                            setError('');
                            setLoading(true);
                            try {
                              await sendPasswordResetEmail(firebaseAuth, email);
                              setInfoMessage(`Official Firebase password reset email sent to ${email}. Check your inbox!`);
                            } catch (err: any) {
                              setError(err.message || 'Failed to send reset email.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[#D4AF37] bg-slate-950 border border-slate-800 hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          Or Send Official Firebase Reset Email Link
                        </button>
                      </div>
                    )}

                    {forgotStep === 2 && (
                      <div className="space-y-4">
                        <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl text-xs text-amber-300 space-y-1">
                          <p className="font-bold">🔑 Security Verification Code</p>
                          <p>Verification code for this reset session:</p>
                          <p className="text-xl font-mono font-black tracking-widest text-center py-2 text-white bg-slate-950 rounded-lg">{forgotGeneratedOtp || '------'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            6-Digit OTP Code <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="000000"
                            value={forgotUserEnteredOtp}
                            onChange={(e) => setForgotUserEnteredOtp(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white text-center font-mono tracking-widest text-xl focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              const code = Math.floor(100000 + Math.random() * 900000).toString();
                              setForgotGeneratedOtp(code);
                              setInfoMessage(`New verification code generated: ${code}`);
                            }}
                            className="text-[#D4AF37] hover:underline cursor-pointer"
                          >
                            Generate New Code
                          </button>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setForgotStep(1)}
                            className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (forgotUserEnteredOtp.trim() === forgotGeneratedOtp.trim()) {
                                setForgotStep(3);
                                setError('');
                                setInfoMessage('OTP verified successfully! Set your new password below.');
                              } else {
                                setError('Invalid OTP code. Please check and try again.');
                              }
                            }}
                            className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm cursor-pointer"
                          >
                            Verify & Set Password →
                          </button>
                        </div>
                      </div>
                    )}

                    {forgotStep === 3 && (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                          Choose a secure new password for your account (minimum 6 characters).
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            New Password <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Confirm New Password <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setForgotStep(2)}
                            className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={async () => {
                              if (!newPassword || newPassword.length < 6) {
                                setError('Password must be at least 6 characters long.');
                                return;
                              }
                              if (newPassword !== confirmNewPassword) {
                                setError('Passwords do not match.');
                                return;
                              }
                              setError('');
                              setLoading(true);
                              try {
                                await updateUserPasswordByEmail(email, newPassword);
                                setForgotStep(4);
                                setInfoMessage('Password successfully updated!');
                              } catch (err: any) {
                                console.warn('Direct reset error:', err);
                                setError(err.message || 'Failed to update password.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm cursor-pointer"
                          >
                            {loading ? 'Updating Password...' : 'Reset Password'}
                          </button>
                        </div>
                      </div>
                    )}

                    {forgotStep === 4 && (
                      <div className="space-y-4 text-center py-4">
                        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
                          <CheckCircle2 size={32} />
                        </div>
                        <h4 className="text-lg font-bold text-white">Password Reset Successful!</h4>
                        <div className="text-xs text-slate-300 leading-relaxed text-left bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                          <p>
                            Your account password has been updated for <strong className="text-[#D4AF37]">{email}</strong>.
                          </p>
                          <p>You can now sign in using your new credentials.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(false);
                            setForgotStep(1);
                            setNewPassword('');
                            setConfirmNewPassword('');
                            setForgotUserEnteredOtp('');
                            setError('');
                            setInfoMessage('');
                          }}
                          className="w-full py-3.5 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm cursor-pointer mt-2"
                        >
                          Return to Sign In →
                        </button>
                      </div>
                    )}

                    {forgotStep < 4 && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(false);
                            setForgotStep(1);
                            setError('');
                          }}
                          className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                        >
                          Cancel and Return to Sign In
                        </button>
                      </div>
                    )}
                  </div>
                ) : !isLogin ? (
                  /* STEP-BY-STEP EMPLOYEE REGISTRATION WIZARD */
                  <div className="space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#D4AF37]">
                        Step {signupStep} of 3 — Employee Registration
                      </span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3].map(s => (
                          <div key={s} className={`w-8 h-1.5 rounded-full transition-all ${signupStep >= s ? 'bg-[#D4AF37]' : 'bg-slate-800'}`} />
                        ))}
                      </div>
                    </div>

                    {signupStep === 1 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <User size={14} className="text-[#D4AF37]" /> Section 1 — Personal Information
                        </h3>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Full Name <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Your Full Name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Profile Photo URL <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="url"
                            placeholder="https://example.com/photo.jpg"
                            value={photoUrl}
                            onChange={(e) => setPhotoUrl(e.target.value)}
                            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Date of Birth <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="date"
                              value={dateOfBirth}
                              onChange={(e) => setDateOfBirth(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Gender <span className="text-red-400">*</span>
                            </label>
                            <select
                              value={gender}
                              onChange={(e) => setGender(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            National ID (NID) / Birth Certificate <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="National ID Number"
                            value={nidNumber}
                            onChange={(e) => setNidNumber(e.target.value)}
                            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!fullName.trim() || !photoUrl.trim() || !dateOfBirth || !nidNumber.trim()) {
                                setError('Please fill in all required fields in Personal Information.');
                                return;
                              }
                              setError('');
                              setSignupStep(2);
                            }}
                            className="w-full py-3 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
                          >
                            Next: Contact & Verification →
                          </button>
                        </div>
                      </div>
                    )}

                    {signupStep === 2 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone size={14} className="text-[#D4AF37]" /> Section 2 — Contact & Email Verification
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Mobile Number (BD) <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="tel"
                              placeholder="01700000000"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Alternative Mobile (Opt.)
                            </label>
                            <input
                              type="tel"
                              placeholder="01800000000"
                              value={alternativeMobile}
                              onChange={(e) => setAlternativeMobile(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Personal Email (Login & OTP) <span className="text-red-400">*</span>
                          </label>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="email"
                              placeholder="email@domain.com"
                              value={email}
                              disabled={emailOtpVerified}
                              onChange={(e) => setEmail(e.target.value)}
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37] disabled:opacity-50"
                            />
                            {!emailOtpVerified && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!email.trim() || !email.includes('@')) {
                                    setError('Please enter a valid email address first.');
                                    return;
                                  }
                                  const code = Math.floor(100000 + Math.random() * 900000).toString();
                                  setSignupGeneratedOtp(code);
                                  const emailRes = await sendOTPEmail(email, code, fullName || 'Applicant');
                                  if (!emailRes.success) {
                                    setError(`EmailJS Delivery Failed: ${emailRes.error || 'Unknown error'}`);
                                    return;
                                  }
                                  setSignupOtpSent(true);
                                  setSignupCooldown(45);
                                  setInfoMessage(`Verification OTP sent to ${email}`);
                                }}
                                className="px-4 py-2 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-bold rounded-xl text-xs whitespace-nowrap cursor-pointer"
                              >
                                Send OTP
                              </button>
                            )}
                            {emailOtpVerified && (
                              <span className="px-3 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1">
                                <CheckCircle2 size={14} /> Verified
                              </span>
                            )}
                          </div>
                        </div>

                        {signupOtpSent && !emailOtpVerified && (
                          <div className="p-3 bg-slate-950 border border-[#D4AF37]/40 rounded-xl space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                maxLength={6}
                                placeholder="6-digit OTP"
                                value={signupUserEnteredOtp}
                                onChange={(e) => setSignupUserEnteredOtp(e.target.value)}
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white font-mono text-center tracking-widest text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (signupUserEnteredOtp.trim() === signupGeneratedOtp.trim()) {
                                    setEmailOtpVerified(true);
                                    setInfoMessage('Email successfully verified!');
                                    setError('');
                                  } else {
                                    setError('Invalid OTP code. Please try again.');
                                  }
                                }}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
                              >
                                Verify Code
                              </button>
                            </div>
                            <div className="flex justify-between items-center text-[11px] pt-1">
                              <button
                                type="button"
                                disabled={signupCooldown > 0}
                                onClick={async () => {
                                  if (signupCooldown > 0) return;
                                  const code = Math.floor(100000 + Math.random() * 900000).toString();
                                  setSignupGeneratedOtp(code);
                                  const emailRes = await sendOTPEmail(email, code, fullName || 'Applicant');
                                  if (!emailRes.success) {
                                    setError(`EmailJS Delivery Failed: ${emailRes.error || 'Unknown error'}`);
                                    return;
                                  }
                                  setSignupCooldown(45);
                                  setInfoMessage('New OTP code sent!');
                                }}
                                className="text-[#D4AF37] hover:underline disabled:opacity-50 cursor-pointer"
                              >
                                {signupCooldown > 0 ? `Resend Code in ${signupCooldown}s` : 'Resend Verification Code'}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Present Address <span className="text-red-400">*</span>
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Current address..."
                              value={presentAddress}
                              onChange={(e) => setPresentAddress(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37] resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Permanent Address (Opt.)
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Permanent address..."
                              value={permanentAddress}
                              onChange={(e) => setPermanentAddress(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37] resize-none"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setSignupStep(1)}
                            className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!phone.trim() || !email.trim() || !presentAddress.trim()) {
                                setError('Please fill in all required contact fields.');
                                return;
                              }
                              if (!emailOtpVerified) {
                                setError('Please verify your email with OTP before proceeding to Step 3.');
                                return;
                              }
                              setError('');
                              setSignupStep(3);
                            }}
                            className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm cursor-pointer"
                          >
                            Next: Employment & Credentials →
                          </button>
                        </div>
                      </div>
                    )}

                    {signupStep === 3 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Briefcase size={14} className="text-[#D4AF37]" /> Section 3 — Employment Request & Credentials
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Requested Department
                            </label>
                            <select
                              value={requestedDepartment}
                              onChange={(e) => setRequestedDepartment(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            >
                              <option value="Sales">Sales & Distribution</option>
                              <option value="Warehouse">Warehouse & Inventory</option>
                              <option value="Accounts">Accounts & Finance</option>
                              <option value="Marketing">Marketing & Growth</option>
                              <option value="Operations">Operations & Logistics</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Requested Designation
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Senior Executive"
                              value={designation}
                              onChange={(e) => setDesignation(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Branch
                            </label>
                            <select
                              value={requestedBranch}
                              onChange={(e) => setRequestedBranch(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            >
                              <option value="">Select Branch...</option>
                              {branchesList.map(b => (
                                <option key={b.id} value={b.name}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Joining Date
                            </label>
                            <input
                              type="date"
                              value={requestedJoiningDate}
                              onChange={(e) => setRequestedJoiningDate(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Employment Type
                            </label>
                            <select
                              value={requestedEmploymentType}
                              onChange={(e) => setRequestedEmploymentType(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            >
                              <option value="Full-Time">Full-Time</option>
                              <option value="Part-Time">Part-Time</option>
                              <option value="Contract">Contract</option>
                              <option value="Intern">Intern</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Requested Role Level <span className="text-red-400">*</span>
                            </label>
                            <select
                              value={requestedRole}
                              onChange={(e) => setRequestedRole(e.target.value as any)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            >
                              <option value="staff">Staff (Operator)</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Sub-brand Access <span className="text-red-400">*</span>
                            </label>
                            <div className="mt-1 grid grid-cols-3 gap-1.5">
                              {[
                                { id: 'SAT', name: 'SAT' },
                                { id: 'GZ', name: 'GZ' },
                                { id: 'RTX', name: 'RTX' }
                              ].map(brand => {
                                const isSelected = requestedSubBrands.includes(brand.id);
                                return (
                                  <button
                                    key={brand.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setRequestedSubBrands(requestedSubBrands.filter(b => b !== brand.id));
                                      } else {
                                        setRequestedSubBrands([...requestedSubBrands, brand.id]);
                                      }
                                    }}
                                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-[#D4AF37]/20 text-amber-300 border border-[#D4AF37]'
                                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                                    }`}
                                  >
                                    {brand.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Account Password <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Confirm Password <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white text-sm focus:ring-2 focus:ring-[#D4AF37]"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setSignupStep(2)}
                            className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={handleFinalSignup}
                            className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#b89628] text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm cursor-pointer"
                          >
                            {loading ? 'Submitting Application...' : 'Submit Registration Request'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(true);
                          setSignupStep(1);
                          setError('');
                        }}
                        className="text-xs text-[#D4AF37] hover:underline cursor-pointer"
                      >
                        Already have an account? Sign In
                      </button>
                    </div>
                  </div>
                ) : (
                  /* STANDARD LOGIN FORM */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                        Email Address
                      </label>
                      <div className="mt-1.5 relative">
                        <Mail className="absolute top-3.5 left-3.5 text-slate-500" size={18} />
                        <input
                          type="email"
                          placeholder="email@skyautomation.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-11 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent font-medium"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                          Account Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setForgotStep(1);
                            setError('');
                          }}
                          className="text-xs text-[#D4AF37] hover:underline cursor-pointer font-semibold"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="mt-1.5 relative">
                        <Lock className="absolute top-3.5 left-3.5 text-slate-500" size={18} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-11 pr-11 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent font-medium"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute top-3.5 right-3.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Quick Super Admin Credentials Fill Badge */}
                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-[#D4AF37]/30 text-xs">
                      <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px]">
                        <ShieldCheck size={14} className="text-[#D4AF37] shrink-0" />
                        <span>Super Admin: <strong className="text-[#D4AF37]">skyautomationtech@gmail.com</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('skyautomationtech@gmail.com');
                          setPassword('12345678');
                          setError('');
                        }}
                        className="px-2.5 py-1 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#D4AF37] font-bold text-[11px] rounded-lg border border-[#D4AF37]/40 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Auto Fill (12345678)
                      </button>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-xs sm:text-sm font-extrabold text-slate-950 bg-[#D4AF37] hover:bg-[#b89628] transition-all cursor-pointer active:scale-98"
                      >
                        <span>{loading ? 'Authenticating Operator...' : 'Sign In to Console'}</span>
                        {!loading && <ArrowRight size={16} />}
                      </button>
                    </div>

                    {/* Direct Offline Sandbox Fallback Access */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleDirectOfflineAccess}
                        className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-slate-800 bg-slate-950 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        <Sparkles size={15} className="text-[#D4AF37]" />
                        <span>লোকাল স্যান্ডবক্সে সরাসরি প্রবেশ করুন (Direct Offline Access)</span>
                      </button>
                    </div>

                    <div className="text-center pt-3 border-t border-slate-800/80 mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(false);
                          setSignupStep(1);
                          setError('');
                        }}
                        className="text-xs text-[#D4AF37] hover:underline font-bold cursor-pointer"
                      >
                        Need a new employee account? Register Now →
                      </button>
                    </div>

                  </div>
                )}
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
