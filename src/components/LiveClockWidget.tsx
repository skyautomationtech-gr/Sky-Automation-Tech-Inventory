import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Activity } from 'lucide-react';

interface LiveClockWidgetProps {
  variant?: 'header' | 'compact' | 'full';
  className?: string;
}

export const LiveClockWidget: React.FC<LiveClockWidgetProps> = ({ 
  variant = 'header',
  className = '' 
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    // 1-second interval for real-time accurate clock
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format Time
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const formattedHours = String(displayHours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  // Format Date
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const dayName = days[currentTime.getDay()];
  const shortDayName = shortDays[currentTime.getDay()];
  const dateNum = String(currentTime.getDate()).padStart(2, '0');
  const monthName = months[currentTime.getMonth()];
  const year = currentTime.getFullYear();

  if (variant === 'compact') {
    return (
      <div 
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl backdrop-blur-xl bg-slate-900/80 border border-slate-700/60 shadow-xs text-white ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-mono font-bold text-xs text-slate-100">
          {formattedHours}:{formattedMinutes}
        </span>
        <span className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {ampm}
        </span>
        <span className="text-slate-500 text-[10px]">&bull;</span>
        <span className="text-slate-300 text-xs font-medium">
          {shortDayName}, {dateNum} {monthName}
        </span>
      </div>
    );
  }

  // Premium Fluid & Glassmorphic UI
  return (
    <div 
      className={`relative group overflow-hidden rounded-2xl backdrop-blur-xl bg-white/80 hover:bg-white/95 border border-slate-200/90 shadow-xs transition-all duration-300 ring-1 ring-slate-900/5 ${className}`}
    >
      {/* Fluid animated ambient gradient top border */}
      <div className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-amber-400 via-teal-500 to-amber-500" />

      <div className="flex items-center gap-3 px-3.5 py-2">
        {/* Real-time Status Icon with Emerald Pulse */}
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-amber-400 border border-slate-700/50 shadow-xs shrink-0">
          <Clock size={16} className="text-amber-400" />
        </div>

        {/* Time HUD */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            {/* Live pulsing dot */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>

            {/* Digital Clock */}
            <span className="font-mono font-black text-slate-900 text-sm tracking-wider">
              {formattedHours}:{formattedMinutes}
              <span className="text-slate-400 font-medium text-xs">:{formattedSeconds}</span>
            </span>

            {/* AM / PM Badge */}
            <span className="font-mono font-extrabold text-[10px] uppercase px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 border border-amber-500/20">
              {ampm}
            </span>
          </div>

          {/* Date Row */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium mt-0.5">
            <Calendar size={12} className="text-amber-600 shrink-0" />
            <span className="font-sans font-semibold text-slate-700">
              {dayName}, {dateNum} {monthName} {year}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
