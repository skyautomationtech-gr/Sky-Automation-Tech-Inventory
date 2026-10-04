import React, { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

interface LiveClockWidgetProps {
  variant?: 'header' | 'dashboard' | 'compact';
  className?: string;
}

export const LiveClockWidget: React.FC<LiveClockWidgetProps> = ({ 
  variant = 'header',
  className = '' 
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    // Ticks every second for real-time accuracy
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format Time (HH:MM:SS AM/PM)
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const formattedHours = String(displayHours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  // Format Date (Day, DD Month YYYY)
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
      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg backdrop-blur-md bg-white/70 border border-slate-200/80 shadow-2xs font-mono text-xs text-slate-800 ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-bold text-slate-900">{formattedHours}:{formattedMinutes} {ampm}</span>
        <span className="text-slate-400 text-[10px]">&bull;</span>
        <span className="text-slate-600 text-[11px]">{shortDayName}, {dateNum} {monthName}</span>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className={`relative group overflow-hidden rounded-xl backdrop-blur-md bg-gradient-to-r from-white/90 via-slate-50/80 to-amber-50/40 border border-slate-200/90 p-2 sm:px-3 sm:py-2 shadow-xs flex items-center gap-3 transition-all ${className}`}>
        {/* Ambient fluid glow line */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-teal-400 to-amber-500 opacity-80" />
        
        {/* Live Indicator + Clock Icon */}
        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
          <Clock size={16} className="text-amber-400" />
        </div>

        {/* Time & Date Display */}
        <div className="min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-black text-slate-900 text-sm tracking-wider">
              {formattedHours}:{formattedMinutes}
              <span className="text-slate-400 font-normal text-xs">:{formattedSeconds}</span>
            </span>
            <span className="font-mono font-bold text-[10px] uppercase px-1 py-0.2 rounded bg-amber-100/80 text-amber-800 border border-amber-200/50">
              {ampm}
            </span>
            <span className="relative flex h-1.5 w-1.5 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5 truncate">
            <Calendar size={11} className="text-slate-400 shrink-0" />
            <span className="truncate">{dayName}, {dateNum} {monthName} {year}</span>
          </div>
        </div>
      </div>
    );
  }

  // Default Top Header Bar Glass Variant
  return (
    <div className={`relative overflow-hidden rounded-xl backdrop-blur-md bg-white/80 hover:bg-white/95 border border-slate-200/80 px-3 py-1.5 shadow-xs flex items-center gap-2.5 transition-all ${className}`}>
      {/* Live status dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>

      {/* Clock info */}
      <div className="flex items-center gap-2 font-mono text-xs divide-x divide-slate-200">
        <div className="flex items-center gap-1 font-black text-slate-900 tracking-wide">
          <span>{formattedHours}:{formattedMinutes}</span>
          <span className="text-slate-400 text-[10px] font-medium">:{formattedSeconds}</span>
          <span className="text-[10px] text-amber-600 font-bold ml-0.5">{ampm}</span>
        </div>
        <div className="pl-2 flex items-center gap-1 text-slate-600 font-sans text-[11px] font-medium">
          <Calendar size={12} className="text-slate-400" />
          <span>{shortDayName}, {dateNum} {monthName}</span>
        </div>
      </div>
    </div>
  );
};
